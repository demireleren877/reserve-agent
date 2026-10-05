"""Yerel araç çağırma desteği olmayan uçlarda araç kullanımı (JSON zarfı).

Ollama'nın /api/generate ucu yalnız düz "prompt" alır, tool calling yok. Kurumsal
gateway'ler bazen yalnız bu ucu açıyor. Konuşmayı ve araç şemalarını prompt'a
yazıp modelden katı bir JSON zarfı isteriz; zarfı ayrıştırıp normal araç
çağrısına çeviririz. Aynı yöntem eval'deki headless-Claude shim'inde Haiku ile
çalıştı (haiku_shim.py artık bunu kullanıyor).
"""

from __future__ import annotations

import json
import re

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


def render(messages: list[dict], tools: list[dict]) -> tuple[str, str]:
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


def extract_json(text: str) -> dict:
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


