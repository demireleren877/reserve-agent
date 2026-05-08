"""OpenRouter (OpenAI-uyumlu) LLM istemcisi.

OpenRouter OpenAI SDK ile uyumlu çalışır — `base_url` parametresini değiştirerek
Claude modellerine erişiriz.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

from openai import OpenAI


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


DEFAULT_MODEL = "anthropic/claude-sonnet-4.6"
DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"


class AgentClient:
    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
    ) -> None:
        self.model = model or os.getenv("OPENROUTER_MODEL", DEFAULT_MODEL)
        self._client = OpenAI(
            api_key=api_key or os.getenv("OPENROUTER_API_KEY", "missing"),
            base_url=base_url or os.getenv("OPENROUTER_BASE_URL", DEFAULT_BASE_URL),
        )

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Bir LLM turu çalıştır. Normalize edilmiş yanıt döndürür:

        {
            "content": str | None,
            "tool_calls": [ToolCall, ...],
        }
        """
        resp = self._client.chat.completions.create(
            model=self.model,
            messages=messages,  # type: ignore[arg-type]
            tools=tools,  # type: ignore[arg-type]
        )
        msg = resp.choices[0].message
        tool_calls: list[ToolCall] = []
        if msg.tool_calls:
            for tc in msg.tool_calls:
                args: dict[str, Any] = {}
                try:
                    args = json.loads(tc.function.arguments) if tc.function.arguments else {}
                except json.JSONDecodeError:
                    args = {}
                tool_calls.append(
                    ToolCall(id=tc.id, name=tc.function.name, arguments=args)
                )
        return {"content": msg.content, "tool_calls": tool_calls}
