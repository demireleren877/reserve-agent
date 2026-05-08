"""Modül soyutlaması — her aktüeryal süreç (rezerv, IFRS 17, ortalama muallak…)
kendi tool set'i + system prompt eklentisi + dispatch fonksiyonu ile bir
ModuleSpec olarak kayıt edilir. Tek genel agent bunların hepsine erişir.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable


@dataclass
class ModuleSpec:
    name: str
    """Kanonik kimlik (URL/route ile aynı): 'reserve', 'ifrs17', 'avg_claim'."""

    label: str
    """Kullanıcı dostu isim — sistem prompt + UI'da görünür."""

    system_prompt: str
    """Modül-spesifik agent talimatları (sekmeler, formüller, örnek senaryolar)."""

    tool_schemas: list[dict[str, Any]]
    """OpenAI/Anthropic tool-use formatında tool tanımları."""

    dispatch: Callable[[str, dict[str, Any], dict[str, Any]], dict[str, Any]]
    """(tool_name, args, ctx) -> result. ctx modül-spesifik (rezerv için
    triangle + session_state, IFRS17 için contract_groups vb.)."""

    context_provider: Callable[[dict[str, Any] | None], str]
    """session_state → kısa tek satırlık özet (system prompt'ta görünür)."""
