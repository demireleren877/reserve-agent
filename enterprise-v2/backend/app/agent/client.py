"""LLM istemcisi — LOKAL, OpenAI-uyumlu endpoint için ince httpx sarmalayıcı.

Desktop OFFLINE çalışır; LLM makinede/LAN'da bir OpenAI-uyumlu sunucudur
(Ollama /v1, LM Studio, llama.cpp server). Ağır `openai` SDK'sını (ve onun
pydantic-core/jiter/tqdm bağımlılık ağacını) bundle'a sokmamak için doğrudan
`POST {base_url}/chat/completions` yapılır — httpx zaten backend bağımlılığı.
"""

from __future__ import annotations

import json
import os
import ssl
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import httpx


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@lru_cache(maxsize=1)
def tls_verify() -> ssl.SSLContext | bool:
    """Uzak LLM uçları için TLS doğrulama bağlamı.

    Kurumsal ağlar HTTPS'i kendi kök sertifikalarıyla yeniden imzalıyor
    (Zscaler, Forcepoint …). Windows o köke güveniyor — tarayıcı bu yüzden
    çalışıyor — ama paketli Python yalnız certifi listesine bakıyordu ve
    "CERTIFICATE_VERIFY_FAILED: self-signed certificate in certificate chain"
    ile düşüyordu. truststore işletim sisteminin deposunu kullanır (Windows
    sertifika deposu, macOS Keychain): IT'nin dağıttığı kök otomatik geçerli.

    Öncelik:
      1. AGENT_CA_BUNDLE (ya da SSL_CERT_FILE / REQUESTS_CA_BUNDLE): IT'nin
         verdiği .pem — depoya yüklenmemiş bir kök için kaçış yolu.
      2. İşletim sistemi deposu (truststore).
      3. httpx varsayılanı (certifi).
    Doğrulamayı KAPATMA seçeneği bilerek yok: anahtar araya giren herkese gider.
    """
    bundle = (
        os.getenv("AGENT_CA_BUNDLE") or os.getenv("SSL_CERT_FILE") or os.getenv("REQUESTS_CA_BUNDLE")
    )
    if bundle:
        ctx = ssl.create_default_context(cafile=bundle)
        # Python 3.13 katı X.509 kontrolünü varsayılan açıyor; eski kurumsal
        # kök sertifikalarında sık eksik olan Authority Key Identifier yüzünden
        # "Missing Authority Key Identifier" ile düşüyordu. Doğrulama sürüyor —
        # yalnız RFC 5280 katılığı gevşiyor.
        if hasattr(ssl, "VERIFY_X509_STRICT"):
            ctx.verify_flags &= ~ssl.VERIFY_X509_STRICT
        return ctx
    try:
        import truststore

        return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    except Exception:  # truststore yoksa ya da platform desteklemiyorsa
        return True


def is_cert_verify_error(exc: BaseException) -> bool:
    """Hata zincirinde bir sertifika doğrulama hatası var mı.

    Metne bakmak yetmiyor: işletim sistemi deposu doğrularken mesaj OpenSSL'in
    "CERTIFICATE_VERIFY_FAILED"i değil, yerelleştirilmiş OS metni oluyor
    ("… sertifikası güvenilir değil").
    """
    seen: set[int] = set()
    e: BaseException | None = exc
    while e is not None and id(e) not in seen:
        seen.add(id(e))
        if isinstance(e, ssl.SSLCertVerificationError) or "CERTIFICATE_VERIFY_FAILED" in str(e):
            return True
        e = e.__cause__ or e.__context__
    return False


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
        extra_body: dict[str, Any] | None = None,
        verify_tls: bool = True,
    ) -> None:
        self.model = model or os.getenv("AGENT_MODEL", DEFAULT_MODEL)
        self.api_key = api_key or os.getenv("AGENT_API_KEY", "local")
        base = (base_url or os.getenv("AGENT_BASE_URL", DEFAULT_BASE_URL)).rstrip("/")
        self.base_url = base
        self.temperature = temperature if temperature is not None else 0.2
        self.timeout = timeout
        # Sağlayıcıya özgü alanlar (ör. OpenRouter'da sağlayıcı sabitleme,
        # reasoning kapatma). Varsayılan boş: üretim isteği değişmez.
        self.extra_body = dict(extra_body or {})
        # False yalnız kullanıcı Agent Ayarları'nda açıkça seçerse (kurumsal ağ).
        self.verify_tls = verify_tls

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
        if self.extra_body:
            payload.update(self.extra_body)

        headers = {
            "Content-Type": "application/json",
            # OpenRouter opsiyonel metadata (zararsız; diğer sunucular yok sayar)
            "HTTP-Referer": "http://localhost",
            "X-Title": "Actuarius Enterprise",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        verify = tls_verify() if self.verify_tls else False
        with httpx.Client(timeout=self.timeout, verify=verify) as client:
            resp = client.post(
                f"{self.base_url}/chat/completions", json=payload, headers=headers
            )
            if resp.status_code >= 400:
                # Gerçek sebep yanıt gövdesindedir. OpenRouter alttaki sağlayıcı
                # hatasını error.metadata.raw içinde saklar ("Provider returned error").
                detail: Any = resp.text
                try:
                    j = resp.json()
                    err = j.get("error")
                    if isinstance(err, dict):
                        msg = str(err.get("message") or "")
                        meta = err.get("metadata") or {}
                        raw = ""
                        if isinstance(meta, dict):
                            raw = str(meta.get("raw") or meta.get("provider_name") or "")
                        detail = f"{msg} — {raw}".strip(" —") if raw else (msg or err)
                    elif err:
                        detail = err
                except Exception:
                    pass
                raise RuntimeError(f"LLM {resp.status_code}: {str(detail)[:800]}")
            data = resp.json()

        choices = data.get("choices") or []
        if not choices:
            return {"content": None, "tool_calls": []}
        msg = choices[0].get("message") or {}
        content = msg.get("content")
        # Bazı sağlayıcılar (ör. Gemini) content'i parça listesi döndürebilir.
        if isinstance(content, list):
            content = "".join(
                p.get("text", "") for p in content if isinstance(p, dict)
            )
        # Reasoning modelleri (DeepSeek vb.) cevabı reasoning alanında dönebilir → düş.
        if not content:
            content = (
                msg.get("reasoning_content")
                or msg.get("reasoning")
                or choices[0].get("reasoning")
            )

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
                    # Küçük/lokal modeller bozuk JSON üretebiliyor. Sessizce {}
                    # bırakmak tool'u varsayılanlarla çalıştırır (prim 0'a düşer,
                    # CDF 1.0 olur) — hatayı taşı ki dispatch reddedip modele
                    # düzeltme şansı versin.
                    args = {"__malformed_arguments__": raw_args[:400]}
            tool_calls.append(
                ToolCall(id=tc.get("id") or "", name=fn.get("name") or "", arguments=args)
            )
        return {"content": content, "tool_calls": tool_calls}
