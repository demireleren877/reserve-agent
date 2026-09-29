import pytest

from app.agent.endpoint_guard import EndpointNotAllowed, validate_llm_base_url


@pytest.mark.parametrize(
    "url",
    [
        "http://api.openai.com/v1",  # https değil
        "https://localhost:11434/v1",
        "https://127.0.0.1/v1",
        "https://10.0.0.5/v1",
        "https://192.168.1.10/v1",
        "https://169.254.169.254/latest",  # bulut metadata
        "https://[::1]/v1",
        "https://metadata.google.internal/",
        "https://foo.localhost/v1",
        "https://user:pw@api.openai.com/v1",
        "ftp://example.com",
        "https://",
    ],
)
def test_rejects_non_public_or_non_https(url):
    with pytest.raises(EndpointNotAllowed):
        validate_llm_base_url(url, resolve=False)


def test_accepts_public_https_and_normalizes():
    url = validate_llm_base_url("https://openrouter.ai/api/v1/", resolve=False)
    assert url == "https://openrouter.ai/api/v1"
    assert validate_llm_base_url("https://8.8.8.8/v1", resolve=False) == "https://8.8.8.8/v1"


def test_rejects_hostname_resolving_to_private(monkeypatch):
    import socket

    def fake_getaddrinfo(host, port, proto=0):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.1.2.3", port))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)
    with pytest.raises(EndpointNotAllowed):
        validate_llm_base_url("https://evil.example.com/v1")
