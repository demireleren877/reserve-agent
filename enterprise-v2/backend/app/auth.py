"""JWT auth — Firebase yok, Oracle users tablosundan."""

from __future__ import annotations

import hashlib
import os
from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_SECRET = os.environ.get("JWT_SECRET", "change-me-in-production")
# HMAC-SHA256 anahtarı en az 32 byte olmalı (RFC 7518 §3.2). Yapılandırılan secret
# kısa olsa da (masaüstü varsayılanı 23 byte) SHA-256 ile 32 byte'a türetilir:
# InsecureKeyLengthWarning kalkar, deterministik olduğu için restart'ta token geçerli kalır.
_SIGNING_KEY = hashlib.sha256(_SECRET.encode()).digest()
_ALGO = "HS256"
_TTL_HOURS = int(os.environ.get("JWT_TTL_HOURS", "12"))

_bearer = HTTPBearer()


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_token(user_id: int, username: str, role: str) -> str:
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=_TTL_HOURS),
    }
    return jwt.encode(payload, _SIGNING_KEY, algorithm=_ALGO)


def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, _SIGNING_KEY, algorithms=[_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="token_expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="invalid_token")


def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
) -> dict:
    return _decode(creds.credentials)


def require_admin(
    user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="admin_required")
    return user
