#!/usr/bin/env python3
"""Claude Code'un headless kipini OpenAI-uyumlu bir /chat/completions ucuna çevirir.

NEDEN: eval koşucusu OpenAI şekilli bir uç bekliyor; elimizde Anthropic API
anahtarı yok ama Claude Code binary'si var ve Haiku'yu headless çalıştırıyor.
Bu shim arada durur — Haiku GERÇEKTEN bizim sistem promptumuzu ve gerçek araç
şemalarını görür, araç seçimini kendi yapar.

TEK FARK: native tool-calling yerine JSON kipi. Binary bize OpenAI tool_calls
döndürmediği için modelden katı bir JSON zarfı isteyip parse ediyoruz. Yani
ölçtüğümüz şey "Haiku bu prompt ve bu katalogla doğru aracı seçiyor mu" —
tool-calling transport'u değil.

Kullanım:
    python tests/agent_eval/haiku_shim.py --port 8765 &
    python tests/agent_eval/run_eval.py --base-url http://127.0.0.1:8765/v1
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CLAUDE = os.environ.get("CLAUDE_CODE_EXECPATH", "claude")
MODEL = os.environ.get("HAIKU_MODEL", "claude-haiku-4-5-20251001")

# Modelin cevabı bu zarfa sığmalı. Araç çağrısı VARSA content boş bırakılır;
# lokal modellerin yaptığı gibi ikisini birden döndürmesi de kabul.
ENVELOPE = """
Yukarıdaki talimatlara göre davranıyorsun. Aşağıda konuşma geçmişi ve
çağırabileceğin araçların şemaları var.

SADECE tek bir JSON nesnesi yaz. Açıklama, markdown, kod bloğu YOK.

{"content": "<kullanıcıya metin cevabın; araç çağırıyorsan null>",
 "tool_calls": [{"name": "<araç adı>", "arguments": {<şemaya uygun argümanlar>}}]}

Araç çağırmayacaksan "tool_calls": [] bırak ve cevabı content'e yaz.
Araç çağıracaksan content'i null yap. Argüman adlarını şemadan birebir al;
zorunlu argümanı tahmin etme.
"""


def _render(messages: list[dict], tools: list[dict]) -> tuple[str, str]:
    """(system_prompt, user_prompt) döndürür."""
    system = ""
    lines: list[str] = []
    for m in messages:
        role = m.get("role")
        if role == "system":
            system += (m.get("content") or "") + "\n"
            continue
        if role == "user":
            lines.append(f"[KULLANICI]\n{m.get('content') or ''}")
        elif role == "assistant":
            calls = m.get("tool_calls") or []
            if calls:
                rendered = [
                    {"name": (c.get("function") or {}).get("name"),
                     "arguments": (c.get("function") or {}).get("arguments")}
                    for c in calls
                ]
                lines.append(f"[SEN — araç çağırdın]\n{json.dumps(rendered, ensure_ascii=False)}")
            if m.get("content"):
                lines.append(f"[SEN]\n{m['content']}")
        elif role == "tool":
            lines.append(f"[ARAÇ SONUCU — {m.get('name', '?')}]\n{m.get('content') or ''}")

    catalog = json.dumps(
        [t.get("function", t) for t in tools], ensure_ascii=False, indent=None
    )
    user = (
        "# KONUŞMA\n" + "\n\n".join(lines)
        + "\n\n# ARAÇ ŞEMALARI\n" + catalog
        + "\n" + ENVELOPE
    )
    return system.strip(), user


_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.S)


def _extract_json(text: str) -> dict:
    """Modelin çıktısından JSON zarfını söker.

    Haiku zaman zaman zarfı kod bloğuna sarıyor ya da önüne bir cümle
    koyuyor; ikisini de affediyoruz, çünkü test edilen şey biçim disiplini
    değil araç seçimi.
    """
    if not text:
        return {"content": None, "tool_calls": []}
    m = _FENCE.search(text)
    if m:
        text = m.group(1)
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start = text.find("{")
    while start != -1:
        depth, in_str, esc = 0, False, False
        for i in range(start, len(text)):
            ch = text[i]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start:i + 1])
                    except json.JSONDecodeError:
                        break
        start = text.find("{", start + 1)
    # Parse edilemeyen çıktıyı düz cevap say — turu öldürmesin.
    return {"content": text, "tool_calls": []}


def _call_claude(system: str, user: str, timeout: float) -> str:
    with tempfile.TemporaryDirectory() as tmp:
        sp = os.path.join(tmp, "system.txt")
        with open(sp, "w", encoding="utf-8") as fh:
            fh.write(system or "Sen yardımcı bir asistansın.")
        cmd = [
            CLAUDE, "-p", user,
            "--model", MODEL,
            "--system-prompt-file", sp,
            "--output-format", "json",
            "--max-turns", "1",
            "--allowedTools", "",
        ]
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout,
            cwd=tmp,  # proje CLAUDE.md'si sızmasın
        )
    if proc.returncode != 0:
        raise RuntimeError(f"claude exit {proc.returncode}: {proc.stderr[:400]}")
    try:
        return json.loads(proc.stdout).get("result") or ""
    except json.JSONDecodeError:
        return proc.stdout


class Handler(BaseHTTPRequestHandler):
    timeout_s = 180.0

    def log_message(self, *a):  # gürültüyü kes
        pass

    def do_POST(self):  # noqa: N802
        if not self.path.rstrip("/").endswith("/chat/completions"):
            self.send_error(404)
            return
        n = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(n) or b"{}")
        system, user = _render(body.get("messages") or [], body.get("tools") or [])
        t0 = time.time()
        try:
            raw = _call_claude(system, user, self.timeout_s)
            env = _extract_json(raw)
            err = None
        except Exception as e:  # noqa: BLE001
            env, err = {"content": None, "tool_calls": []}, str(e)

        calls = []
        for c in env.get("tool_calls") or []:
            if not isinstance(c, dict) or not c.get("name"):
                continue
            calls.append({
                "id": "call_" + uuid.uuid4().hex[:8],
                "type": "function",
                "function": {
                    "name": c["name"],
                    "arguments": json.dumps(c.get("arguments") or {}, ensure_ascii=False),
                },
            })

        out = {
            "id": "chatcmpl-" + uuid.uuid4().hex[:12],
            "object": "chat.completion",
            "model": MODEL,
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": env.get("content"),
                    "tool_calls": calls,
                },
                "finish_reason": "tool_calls" if calls else "stop",
            }],
        }
        print(f"  ← {time.time() - t0:5.1f}s  {len(calls)} çağrı"
              + (f"  HATA: {err[:80]}" if err else ""), file=sys.stderr, flush=True)
        data = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--timeout", type=float, default=180.0)
    a = ap.parse_args()
    Handler.timeout_s = a.timeout
    print(f"haiku shim :{a.port}  ·  model={MODEL}  ·  binary={CLAUDE}", file=sys.stderr, flush=True)
    ThreadingHTTPServer(("127.0.0.1", a.port), Handler).serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
