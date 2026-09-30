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


def _call_claude(system: str, user: str, timeout: float, attempts: int = 3) -> str:
    """Tek bir Haiku turu. Geçici hatada yeniden dener.

    Prompt argv yerine STDIN'den gider: araç kataloğu + konuşma 30k karakteri
    geçiyor ve argüman olarak taşımak hem kırılgan hem de süreç listesinde
    tüm promptu görünür kılıyor.

    Yeniden deneme şart: ilk tam koşuda 73 senaryonun 33'ü "claude exit 1" ile
    düştü ve rapor bunları AJAN hatası gibi gösterdi. Geçici bir sağlayıcı
    hatasının kalıcı bir test sonucuna dönüşmesi, ölçümün kendisini bozuyor.
    """
    last = ""
    for attempt in range(attempts):
        with tempfile.TemporaryDirectory() as tmp:
            sp = os.path.join(tmp, "system.txt")
            with open(sp, "w", encoding="utf-8") as fh:
                fh.write(system or "Sen yardımcı bir asistansın.")
            cmd = [
                CLAUDE, "-p",
                "--model", MODEL,
                "--system-prompt-file", sp,
                "--output-format", "json",
                "--max-turns", "1",
                "--allowedTools", "",
            ]
            try:
                proc = subprocess.run(
                    cmd, input=user, capture_output=True, text=True,
                    timeout=timeout, cwd=tmp,  # proje CLAUDE.md'si sızmasın
                )
            except subprocess.TimeoutExpired:
                last = f"timeout ({timeout}s)"
                proc = None

        if proc is not None and proc.returncode == 0:
            try:
                out = json.loads(proc.stdout)
            except json.JSONDecodeError:
                return proc.stdout
            # exit 0 her zaman başarı değil: kullanım limiti ve sağlayıcı
            # hataları is_error=true ile, hata metni de "result" içinde
            # dönüyor. Bunu cevap diye geçirmek, ajan "araç çağırmadı" gibi
            # görünen sahte düşüşler üretiyordu — son tam koşu AG19'dan
            # itibaren kategoriden bağımsız çöktü.
            if not out.get("is_error"):
                return out.get("result") or ""
            last = (f"is_error | subtype={out.get('subtype')} | "
                    f"api_error_status={out.get('api_error_status')} | "
                    f"result={str(out.get('result'))[:300]}")
        if proc is not None:
            # Hata metni stdout'ta da olabiliyor; ikisini de taşı yoksa
            # "exit 1:" diye boş bir mesaj kalıyor ve teşhis imkânsızlaşıyor.
            last = (f"exit {proc.returncode} | stderr={proc.stderr.strip()[:300]}"
                    f" | stdout={proc.stdout.strip()[:300]}")
        if attempt < attempts - 1:
            time.sleep(2 ** attempt * 3)
    raise RuntimeError(f"claude {attempts} denemede başarısız: {last}")


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
