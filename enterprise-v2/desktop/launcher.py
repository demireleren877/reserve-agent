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

# Açılış splash'i — pencere backend hazır olmadan anında görünür (offline'da
# ağ timeout'ları yüzünden gecikme olsa bile kullanıcı boş ekran görmez).
# Tamamen self-contained: harici font/görsel/istek YOK (offline uyumlu).
SPLASH_HTML = """<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%}
body{font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
background:radial-gradient(1100px 560px at 50% -12%,#eaf0ff 0%,#f6f7f9 58%);
color:#0f172a;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden}
.wrap{text-align:center;animation:fade .5s ease both}
.ring{width:52px;height:52px;margin:0 auto 24px;border-radius:50%;
border:3px solid #e2e5ea;border-top-color:#1d4ed8;animation:spin .8s linear infinite}
.logo{font-size:25px;font-weight:700;letter-spacing:-.02em;margin-bottom:5px}
.logo b{color:#1d4ed8}
.sub{font-size:12px;color:#64748b;margin-bottom:30px;letter-spacing:.02em}
.load{font-size:13px;color:#475569;font-weight:500}
.load::after{content:"";animation:dots 1.4s steps(1,end) infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1}}
@keyframes dots{0%{content:""}25%{content:"."}50%{content:".."}75%{content:"..."}100%{content:""}}
@media(prefers-color-scheme:dark){body{background:radial-gradient(1100px 560px at 50% -12%,#10192e 0%,#0b1220 58%);color:#e2e8f0}
.logo{color:#f1f5f9}.sub{color:#94a3b8}.ring{border-color:#1e293b;border-top-color:#60a5fa}.load{color:#cbd5e1}}
</style></head><body><div class="wrap">
<div class="ring"></div>
<div class="logo">Actuarius <b>Enterprise</b></div>
<div class="sub">Aktüeryal Rezerv &amp; IBNR</div>
<div class="load">Yükleniyor</div>
</div></body></html>"""

ERROR_HTML = """<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><style>
body{font-family:-apple-system,"Segoe UI",sans-serif;background:#f6f7f9;color:#0f172a;
display:flex;align-items:center;justify-content:center;height:100vh;text-align:center}
.b{max-width:440px;padding:24px}.t{font-size:16px;font-weight:600;margin-bottom:8px}
.s{font-size:13px;color:#64748b;line-height:1.5}
</style></head><body><div class="b">
<div class="t">Uygulama başlatılamadı</div>
<div class="s">Arka plan servisi yanıt vermedi. Uygulamayı kapatıp tekrar açmayı deneyin.
Sorun sürerse yöneticinize başvurun.</div>
</div></body></html>"""


def _ensure_std_streams() -> None:
    """Windowed (konsolsuz) PyInstaller build'inde sys.stdout/stderr None olur;
    uvicorn'un log formatter'ı isatty() çağırınca patlar. Boş akışa yönlendir."""
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w")


_ensure_std_streams()


def _frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def _bundle_base() -> Path:
    """Paketlenmiş kaynak kökü (PyInstaller: _MEIPASS)."""
    if _frozen():
        return Path(getattr(sys, "_MEIPASS"))
    return Path(__file__).resolve().parent


def _repo_v2() -> Path:
    """Geliştirme modunda enterprise-v2/ klasörü (backend + frontend kardeş)."""
    return Path(__file__).resolve().parents[1]


def _resolve_backend_dir() -> Path:
    bundled = _bundle_base() / "backend"
    if (bundled / "app" / "main.py").is_file():
        return bundled
    return _repo_v2() / "backend"


def _resolve_static_dir() -> Path:
    bundled = _bundle_base() / "frontend"
    if (bundled / "index.html").is_file():
        return bundled
    return _repo_v2() / "frontend" / "out"


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
            "  cd enterprise-v2/frontend && DESKTOP_BUILD=1 NEXT_PUBLIC_API_BASE= npm run build"
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

    # log_config=None: uvicorn'un renkli formatter'ını kurma (windowed build'de stdout yok).
    config = uvicorn.Config(
        app, host="127.0.0.1", port=port,
        log_config=None, log_level="warning", access_log=False,
    )
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    # Selftest: pencere açmadan paketin sağlığını doğrula (CI / build sonrası kontrol).
    if os.environ.get("ACTUARIUS_SELFTEST") == "1":
        ok = _wait_health(base_url)
        if ok:
            try:
                with urllib.request.urlopen(f"{base_url}/v1/connections", timeout=3) as r:
                    ok = r.status == 200
            except Exception:
                ok = False
        server.should_exit = True
        thread.join(timeout=5)
        print("SELFTEST_OK" if ok else "SELFTEST_FAIL")
        sys.exit(0 if ok else 1)

    import webview  # noqa: E402

    class _Bridge:
        """Frontend ↔ Python köprüsü. Tarayıcı download'u pywebview'da çalışmaz;
        dosyayı base64 alıp native 'Farklı Kaydet' diyaloğuyla diske yazar."""

        def save_file(self, filename: str, b64: str) -> dict:
            import base64

            try:
                win = webview.windows[0]
                result = win.create_file_dialog(
                    webview.SAVE_DIALOG, save_filename=filename or "dosya"
                )
                if not result:
                    return {"ok": False, "cancelled": True}
                path = result[0] if isinstance(result, (list, tuple)) else result
                data = base64.b64decode(b64.split(",")[-1])
                with open(path, "wb") as f:
                    f.write(data)
                return {"ok": True, "path": str(path)}
            except Exception as e:  # pragma: no cover
                return {"ok": False, "error": str(e)}

    # Pencereyi ANINDA splash ile aç (backend'i beklemeden). Böylece offline
    # makinede açılış gecikse bile kullanıcı animasyonlu yükleniyor ekranı görür.
    window = webview.create_window(
        APP_TITLE,
        html=SPLASH_HTML,
        width=1440,
        height=900,
        min_size=(1120, 720),
        js_api=_Bridge(),
    )

    def _on_ready(win) -> None:
        # GUI döngüsü başladıktan sonra arka planda çalışır: backend hazır olunca
        # gerçek uygulamaya geç. Splash bu sırada görünür.
        if _wait_health(base_url, timeout=60.0):
            win.load_url(base_url)
        else:
            win.load_html(ERROR_HTML)

    webview.start(_on_ready, window)  # pencere kapanana kadar bloklar

    server.should_exit = True
    thread.join(timeout=5)


if __name__ == "__main__":
    main()
