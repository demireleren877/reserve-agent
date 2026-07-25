"""LLM istemcisi — LOKAL, OpenAI-uyumlu endpoint için ince httpx sarmalayıcı.

Desktop OFFLINE çalışır; LLM makinede/LAN'da bir OpenAI-uyumlu sunucudur
(Ollama /v1, LM Studio, llama.cpp server). Ağır `openai` SDK'sını (ve onun
pydantic-core/jiter/tqdm bağımlılık ağacını) bundle'a sokmamak için doğrudan
`POST {base_url}/chat/completions` yapılır — httpx zaten backend bağımlılığı.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

import httpx


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


DEFAULT_MODEL = "llama3.1"
DEFAULT_BASE_URL = "http://localhost:11434/v1"  # Ollama


class AgentClient:
    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
        temperature: float | None = None,
        timeout: float = 300.0,
    ) -> None:
        self.model = model or os.getenv("AGENT_MODEL", DEFAULT_MODEL)
        self.api_key = api_key or os.getenv("AGENT_API_KEY", "local")
        base = (base_url or os.getenv("AGENT_BASE_URL", DEFAULT_BASE_URL)).rstrip("/")
        self.base_url = base
        self.temperature = temperature if temperature is not None else 0.2
        self.timeout = timeout

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Bir LLM turu çalıştır. Normalize edilmiş yanıt döndürür:
        {"content": str | None, "tool_calls": [ToolCall, ...]}
        """
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        with httpx.Client(timeout=self.timeout) as client:
            resp = client.post(
                f"{self.base_url}/chat/completions", json=payload, headers=headers
            )
            resp.raise_for_status()
            data = resp.json()

        choices = data.get("choices") or []
        if not choices:
            return {"content": None, "tool_calls": []}
        msg = choices[0].get("message") or {}
        content = msg.get("content")

        tool_calls: list[ToolCall] = []
        for tc in msg.get("tool_calls") or []:
            fn = tc.get("function") or {}
            raw_args = fn.get("arguments")
            args: dict[str, Any] = {}
            if isinstance(raw_args, dict):
                args = raw_args
            elif isinstance(raw_args, str) and raw_args.strip():
                try:
                    args = json.loads(raw_args)
                except json.JSONDecodeError:
                    args = {}
            tool_calls.append(
                ToolCall(id=tc.get("id") or "", name=fn.get("name") or "", arguments=args)
            )
        return {"content": content, "tool_calls": tool_calls}
