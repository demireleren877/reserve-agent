"""Actuarius Enterprise — masaüstü başlatıcı (offline).

Çift tıklandığında:
  1. Gömülü FastAPI backend'i 127.0.0.1'de boş bir portta başlatır (arka planda).
  2. Statik frontend'i (Next export) aynı sunucudan servis eder — aynı origin, CORS yok.
  3. /health yanıt verene kadar bekler, sonra native pencereyi açar (pywebview).
  4. Pencere kapanınca sunucuyu durdurur.

İnternet gerektirmez. Oracle şirket ağında (LAN) olmalıdır; bağlantı ilk açılışta
kurulum ekranından girilir ve bu bilgisayarda saklanır.

Geliştirme:  python launcher.py         (repodaki enterprise/ kaynaklarını kullanır)
Paketlenmiş: PyInstaller ile tek klasör (bkz. actuarius.spec / build.py)
"""

from __future__ import annotations

import os
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

APP_TITLE = "Actuarius Enterprise"


def _frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def _bundle_base() -> Path:
    """Paketlenmiş kaynak kökü (PyInstaller: _MEIPASS)."""
    if _frozen():
        return Path(getattr(sys, "_MEIPASS"))
    return Path(__file__).resolve().parent


def _repo_enterprise() -> Path:
    """Geliştirme modunda repodaki enterprise/ klasörü."""
    return Path(__file__).resolve().parents[2] / "enterprise"


def _resolve_backend_dir() -> Path:
    bundled = _bundle_base() / "backend"
    if (bundled / "app" / "main.py").is_file():
        return bundled
    return _repo_enterprise() / "backend"


def _resolve_static_dir() -> Path:
    bundled = _bundle_base() / "frontend"
    if (bundled / "index.html").is_file():
        return bundled
    return _repo_enterprise() / "frontend" / "out"


def _free_port() -> int:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _wait_health(base_url: str, timeout: float = 30.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{base_url}/health", timeout=1.5) as r:
                if r.status == 200:
                    return True
        except (urllib.error.URLError, ConnectionError, OSError):
            time.sleep(0.15)
    return False


def _fatal(message: str) -> None:
    """Pencere açılamadan hata olursa kullanıcıya göster."""
    sys.stderr.write(message + "\n")
    try:
        import webview

        webview.create_window(APP_TITLE, html=f"<h2 style='font-family:sans-serif'>{message}</h2>")
        webview.start()
    except Exception:
        pass
    sys.exit(1)


def main() -> None:
    backend_dir = _resolve_backend_dir()
    static_dir = _resolve_static_dir()

    if not (backend_dir / "app" / "main.py").is_file():
        _fatal(f"Backend bulunamadı: {backend_dir}")
    if not (static_dir / "index.html").is_file():
        _fatal(
            "Frontend derlenmemiş. Önce statik export alın:\n"
            "  cd enterprise/frontend && DESKTOP_BUILD=1 NEXT_PUBLIC_API_BASE= npm run build"
        )

    sys.path.insert(0, str(backend_dir))
    os.environ["DESKTOP_STATIC_DIR"] = str(static_dir)

    try:
        from app.main import app  # noqa: E402
        import uvicorn  # noqa: E402
    except Exception as e:  # pragma: no cover
        _fatal(f"Backend yüklenemedi: {e}")
        return

    port = _free_port()
    base_url = f"http://127.0.0.1:{port}"

    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    if not _wait_health(base_url):
        server.should_exit = True
        _fatal("Backend başlatılamadı (health yanıt vermedi).")
        return

    # Selftest: pencere açmadan paketin sağlığını doğrula (CI / build sonrası kontrol).
    if os.environ.get("ACTUARIUS_SELFTEST") == "1":
        try:
            with urllib.request.urlopen(f"{base_url}/v1/setup/status", timeout=3) as r:
                ok = r.status == 200
        except Exception:
            ok = False
        server.should_exit = True
        thread.join(timeout=5)
        print("SELFTEST_OK" if ok else "SELFTEST_FAIL")
        sys.exit(0 if ok else 1)

    import webview  # noqa: E402

    webview.create_window(
        APP_TITLE,
        base_url,
        width=1440,
        height=900,
        min_size=(1120, 720),
    )
    webview.start()  # pencere kapanana kadar bloklar

    server.should_exit = True
    thread.join(timeout=5)


if __name__ == "__main__":
    main()
