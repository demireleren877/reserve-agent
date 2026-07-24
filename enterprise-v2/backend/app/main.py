from __future__ import annotations

import os
from pathlib import Path

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import init_pool, close_pool


def _load_env() -> None:
    for candidate in (
        Path(__file__).resolve().parents[2] / ".env",
        Path(__file__).resolve().parents[1] / ".env",
    ):
        if not candidate.is_file():
            continue
        for line in candidate.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


_load_env()

from app.api import router as compute_router  # noqa: E402
from app.routers.connections import router as connections_router  # noqa: E402
from app.routers.auth_router import router as auth_router  # noqa: E402
from app.routers.users import router as users_router  # noqa: E402
from app.routers.state import router as state_router  # noqa: E402
from app.routers.data import router as data_router  # noqa: E402
from app.routers.agent import router as agent_router  # noqa: E402
from app.routers.locks import router as locks_router  # noqa: E402

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()


app = FastAPI(title="Reserve Agent Enterprise", version="1.0.0", lifespan=lifespan)

_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(connections_router)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(state_router)
app.include_router(data_router)
app.include_router(agent_router)
app.include_router(locks_router)
app.include_router(compute_router)



@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# ─── Masaüstü modu: statik frontend'i aynı origin'den servis et ───────────────
# DESKTOP_STATIC_DIR, launcher tarafından Next statik export (out/) klasörüne ayarlanır.
# API /v1 ve /health üstte tanımlı; geri kalan her yol statik dosya/SPA fallback.
_static_dir = os.environ.get("DESKTOP_STATIC_DIR")
if _static_dir and Path(_static_dir).is_dir():
    import mimetypes

    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    # KRİTİK (Windows): Python mimetypes registry'den .js için yanlış tip
    # (text/plain / application/x-javascript) okuyabilir; Chromium/WebView2 script'i
    # reddedince hydration çöker (arayüz görünür ama tıklama çalışmaz). Doğru tipleri zorla.
    mimetypes.add_type("text/javascript", ".js")
    mimetypes.add_type("text/javascript", ".mjs")
    mimetypes.add_type("text/css", ".css")
    mimetypes.add_type("application/json", ".json")
    mimetypes.add_type("image/svg+xml", ".svg")
    mimetypes.add_type("font/woff2", ".woff2")

    _static_root = Path(_static_dir)

    class _SpaStatic(StaticFiles):
        """Bulunamayan ROUTE yollarını index.html'e düşür (trailingSlash export).
        Statik VARLIK (uzantılı: *.js, *.css, *.txt ...) bulunamazsa GERÇEK 404 dön —
        aksi halde eksik JS chunk'ına HTML dönüp hydration sessizce çöker."""

        async def get_response(self, path: str, scope):  # type: ignore[override]
            try:
                return await super().get_response(path, scope)
            except Exception:
                last = path.rsplit("/", 1)[-1]
                if "." in last:
                    # Dosya gibi (uzantılı) → SPA fallback YAPMA, gerçek 404'ü koru.
                    raise
                # /login → /login/index.html, kök → /index.html
                candidate = _static_root / path / "index.html"
                if candidate.is_file():
                    return FileResponse(candidate)
                return FileResponse(_static_root / "index.html")

    app.mount("/", _SpaStatic(directory=str(_static_root), html=True), name="static")
