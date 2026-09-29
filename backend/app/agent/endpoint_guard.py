"""Kullanıcının Agent Ayarları'nda verdiği LLM uç noktasını doğrular.

Masaüstünde LLM kullanıcının kendi makinesinde/LAN'ındadır; web'de ise isteği
SUNUCU atar. Doğrulamasız bir `base_url`, sunucuyu iç ağa ya da bulut metadata
servisine istek atmaya yönlendirebilir (SSRF). Bu yüzden web'de yalnız herkese
açık, `https` uç noktalarına izin verilir.
"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse


class EndpointNotAllowed(ValueError):
    """Uç nokta güvenlik kurallarını karşılamıyor."""


_BLOCKED_HOSTS = {"localhost", "localhost.localdomain", "metadata.google.internal"}


def _is_public(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def validate_llm_base_url(base_url: str, resolve: bool = True) -> str:
    """Geçerli ise normalize edilmiş URL'yi döndürür, değilse EndpointNotAllowed fırlatır.

    `resolve=True` iken host DNS ile çözülür ve çözülen HER adres herkese açık olmalıdır.
    """
    url = base_url.strip().rstrip("/")
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise EndpointNotAllowed("Yalnız https uç noktaları desteklenir")
    host = (parsed.hostname or "").lower()
    if not host:
        raise EndpointNotAllowed("Geçersiz adres")
    if host in _BLOCKED_HOSTS or host.endswith(".localhost") or host.endswith(".internal"):
        raise EndpointNotAllowed("Yerel/iç ağ adreslerine izin verilmez")
    if parsed.username or parsed.password:
        raise EndpointNotAllowed("Adreste kullanıcı bilgisi olamaz")

    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None
    if literal is not None:
        if not _is_public(literal):
            raise EndpointNotAllowed("Yerel/iç ağ adreslerine izin verilmez")
        return url

    if resolve:
        try:
            infos = socket.getaddrinfo(host, parsed.port or 443, proto=socket.IPPROTO_TCP)
        except OSError as e:
            raise EndpointNotAllowed("Adres çözümlenemedi") from e
        for info in infos:
            ip = ipaddress.ip_address(info[4][0])
            if not _is_public(ip):
                raise EndpointNotAllowed("Yerel/iç ağ adreslerine izin verilmez")
    return url
