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

from app.agent.prompted_tools import extract_json, render


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


# API biçimleri (Agent Ayarları → Custom):
#   openai          → {base}/chat/completions, yerel tool calling
#   ollama_chat     → Ollama /api/chat (tam URL), yerel tool calling
#   ollama_generate → Ollama /api/generate (tam URL), tool calling YOK: araçlar
#                     prompt'a yazılır, cevap JSON zarfıyla alınır
API_FORMATS = ("openai", "ollama_chat", "ollama_generate")


@dataclass
class OAuthClientCredentials:
    """OAuth2 client credentials — kurumsal LLM gateway'leri.

    Kullanıcının çalışan script'iyle birebir: Basic auth (client id + secret) ve
    JSON gövde {"grant_type": "client_credentials"}.
    """

    token_url: str
    client_id: str
    client_secret: str


# Token önbelleği: her LLM çağrısında yeni token almak hem yavaş hem de
# gateway'in hız sınırına takılır. Anahtar (token_url, client_id).
_TOKEN_CACHE: dict[tuple[str, str], tuple[str, float]] = {}


# tool_choice="required" çağrısının süre sınırı (sn)
FORCED_TOOL_TIMEOUT = 90.0


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
        api_format: str = "openai",
        oauth: OAuthClientCredentials | None = None,
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
        if api_format not in API_FORMATS:
            raise ValueError(f"api_format {api_format!r} — beklenen: {', '.join(API_FORMATS)}")
        self.api_format = api_format
        self.oauth = oauth

    # ── İstek ─────────────────────────────────────────────────────────────────

    def _verify(self) -> ssl.SSLContext | bool:
        return tls_verify() if self.verify_tls else False

    def _token(self, force: bool = False) -> str:
        """OAuth erişim token'ı; önbellekte geçerliyse onu döndürür."""
        assert self.oauth is not None
        import time

        key = (self.oauth.token_url, self.oauth.client_id)
        hit = _TOKEN_CACHE.get(key)
        if hit and not force and hit[1] > time.time():
            return hit[0]
        with httpx.Client(timeout=self.timeout, verify=self._verify()) as c:
            r = c.post(
                self.oauth.token_url,
                auth=(self.oauth.client_id, self.oauth.client_secret),
                json={"grant_type": "client_credentials"},
            )
        if r.status_code >= 400:
            raise RuntimeError(f"OAuth token {r.status_code}: {r.text[:400]}")
        body = r.json()
        token = body.get("access_token")
        if not token:
            raise RuntimeError(f"OAuth token yanıtında access_token yok: {str(body)[:300]}")
        # Süre bildirilmezse 5 dk; bitmeden 30 sn önce yenile.
        ttl = float(body.get("expires_in") or 300)
        _TOKEN_CACHE[key] = (token, time.time() + max(ttl - 30, 10))
        return token

    def _headers(self, force_token: bool = False) -> dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            # OpenRouter opsiyonel metadata (zararsız; diğer sunucular yok sayar)
            "HTTP-Referer": "http://localhost",
            "X-Title": "Actuarius Enterprise",
        }
        if self.oauth is not None:
            headers["Authorization"] = f"Bearer {self._token(force=force_token)}"
        elif self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _post(self, url: str, payload: dict[str, Any], timeout: float | None = None) -> dict[str, Any]:
        with httpx.Client(timeout=timeout or self.timeout, verify=self._verify()) as client:
            resp = client.post(url, json=payload, headers=self._headers())
            # Token gateway tarafında erken düşebilir: bir kez yenile, tekrar dene.
            if resp.status_code == 401 and self.oauth is not None:
                resp = client.post(url, json=payload, headers=self._headers(force_token=True))
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
            return resp.json()

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        tool_choice: str = "auto",
    ) -> dict[str, Any]:
        """Bir LLM turu çalıştır. Normalize edilmiş yanıt döndürür:
        {"content": str | None, "tool_calls": [ToolCall, ...]}

        tool_choice="required": model bir araç çağırmak ZORUNDA (OpenAI biçimi;
        LM Studio destekliyor). Ollama biçimlerinde karşılığı yok, yok sayılır.
        """
        if self.api_format == "ollama_chat":
            return self._chat_ollama(messages, tools)
        if self.api_format == "ollama_generate":
            return self._chat_ollama_generate(messages, tools)
        return self._chat_openai(messages, tools, tool_choice)

    # ── OpenAI uyumlu ─────────────────────────────────────────────────────────

    def _chat_openai(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]], tool_choice: str = "auto"
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature,
        }
        timeout = None
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = tool_choice
            if tool_choice == "required":
                # LM Studio'da zorunlu araç çağrısı ara sıra bitmeyen üretime
                # giriyor (ölçüldü: 240 sn zaman aşımı, üst üste). Araç çağrısı
                # kısadır: üretimi ve süreyi sınırla; çağıran hata alırsa normal
                # çağrıya düşer.
                payload["max_tokens"] = 1024
                timeout = min(self.timeout, FORCED_TOOL_TIMEOUT)
        if self.extra_body:
            payload.update(self.extra_body)
        data = self._post(f"{self.base_url}/chat/completions", payload, timeout)

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
        return {"content": content, "tool_calls": _to_tool_calls(msg.get("tool_calls") or [])}

    # ── Ollama /api/chat ──────────────────────────────────────────────────────

    def _chat_ollama(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [_ollama_message(m) for m in messages],
            "stream": False,
            # Qwen 3.5 düşünme kipini kapat — kullanıcının çalışan script'iyle aynı;
            # açıkken cevap gecikiyor ve ajan ayarları düşünmesiz ölçüldü.
            "think": False,
            "options": {"temperature": self.temperature},
        }
        if tools:
            payload["tools"] = tools
        if self.extra_body:
            payload.update(self.extra_body)
        data = self._post(self.base_url, payload)
        msg = data.get("message") or {}
        return {"content": msg.get("content") or None, "tool_calls": _to_tool_calls(msg.get("tool_calls") or [])}

    # ── Ollama /api/generate (araçlar prompt'ta) ──────────────────────────────

    def _chat_ollama_generate(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> dict[str, Any]:
        system, prompt = render(messages, tools)
        payload: dict[str, Any] = {
            "model": self.model,
            "system": system,
            "prompt": prompt,
            "stream": False,
            "think": False,
            "options": {"temperature": self.temperature},
        }
        if self.extra_body:
            payload.update(self.extra_body)
        data = self._post(self.base_url, payload)
        env = extract_json(str(data.get("response") or ""))
        calls = [
            {"function": {"name": c.get("name"), "arguments": c.get("arguments") or {}}}
            for c in (env.get("tool_calls") or [])
            if isinstance(c, dict) and c.get("name")
        ]
        return {"content": env.get("content"), "tool_calls": _to_tool_calls(calls)}


def _ollama_message(m: dict[str, Any]) -> dict[str, Any]:
    """OpenAI biçimli konuşma mesajını Ollama /api/chat biçimine çevirir.

    Ollama araç argümanlarını JSON string değil NESNE olarak bekliyor.
    """
    out: dict[str, Any] = {"role": m.get("role"), "content": m.get("content") or ""}
    calls = m.get("tool_calls") or []
    if calls:
        conv = []
        for c in calls:
            fn = c.get("function") or {}
            args = fn.get("arguments")
            if isinstance(args, str):
                try:
                    args = json.loads(args) if args.strip() else {}
                except json.JSONDecodeError:
                    args = {}
            conv.append({"function": {"name": fn.get("name"), "arguments": args or {}}})
        out["tool_calls"] = conv
    if m.get("role") == "tool" and m.get("name"):
        out["tool_name"] = m["name"]
    return out


def _to_tool_calls(raw: list[dict[str, Any]]) -> list[ToolCall]:
    import uuid

    tool_calls: list[ToolCall] = []
    for tc in raw:
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
            # Ollama çağrı kimliği vermiyor; döngü tool mesajını kimlikle eşliyor.
            ToolCall(id=tc.get("id") or f"call_{uuid.uuid4().hex[:8]}", name=fn.get("name") or "", arguments=args)
        )
    return tool_calls
