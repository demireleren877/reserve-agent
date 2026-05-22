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
from app.routers.auth_router import router as auth_router  # noqa: E402
from app.routers.users import router as users_router  # noqa: E402
from app.routers.state import router as state_router  # noqa: E402
from app.routers.data import router as data_router  # noqa: E402
from app.routers.agent import router as agent_router  # noqa: E402

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

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(state_router)
app.include_router(data_router)
app.include_router(agent_router)
app.include_router(compute_router)



@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
