"""Masaüstü uygulaması her açılışta AYNI porta bağlanmalı.

WebView deposu (agent ayarları dahil) origin'e, yani porta bağlı. Rastgele
port her açılışta yeni ve boş bir depo demekti; agent ayarları kapatıp açınca
kayboluyordu.
"""

from __future__ import annotations

import importlib.util
import os
import socket

import pytest

_P = os.path.join(os.path.dirname(__file__), "..", "..", "desktop", "launcher.py")
spec = importlib.util.spec_from_file_location("launcher", _P)
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)  # type: ignore[union-attr]


def _occupy(port: int) -> socket.socket:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", port))
    s.listen()
    return s


@pytest.fixture
def base(monkeypatch):
    # Testte gerçek uygulama açıksa çakışmasın: boş bir aralık seç.
    p = launcher._free_port()
    monkeypatch.setenv("ACTUARIUS_PORT", str(p))
    return p


def test_same_port_on_every_launch(base):
    assert launcher._app_port() == base
    assert launcher._app_port() == base


def test_busy_preferred_port_falls_to_the_next_one(base):
    s = _occupy(base)
    try:
        assert launcher._app_port() == base + 1
    finally:
        s.close()


def test_default_is_the_fixed_port(monkeypatch):
    monkeypatch.delenv("ACTUARIUS_PORT", raising=False)
    if not launcher._port_is_free(launcher.PREFERRED_PORT):
        pytest.skip("47821 bu makinede kullanımda (uygulama açık olabilir)")
    assert launcher._app_port() == launcher.PREFERRED_PORT
