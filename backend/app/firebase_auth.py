"""Firebase ID token verification via JWKS (no Admin SDK required)."""

from __future__ import annotations

import os
import time
from typing import Any

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
_FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "")

_jwks_cache: dict[str, Any] = {"keys": {}, "expires_at": 0}

_bearer = HTTPBearer(auto_error=True)


def _load_jwks() -> dict[str, Any]:
    now = time.time()
    if _jwks_cache["expires_at"] > now and _jwks_cache["keys"]:
        return _jwks_cache["keys"]
    resp = httpx.get(JWKS_URL, timeout=5)
    resp.raise_for_status()
    cc = resp.headers.get("cache-control", "")
    import re
    m = re.search(r"max-age=(\d+)", cc)
    ttl = int(m.group(1)) if m else 3600
    keys = {k["kid"]: k for k in resp.json().get("keys", [])}
    _jwks_cache.update({"keys": keys, "expires_at": now + ttl})
    return keys


def verify_firebase_token(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict[str, str]:
    if not _FIREBASE_PROJECT_ID:
        raise HTTPException(status_code=500, detail="Firebase project not configured")
    token = creds.credentials
    try:
        header = jwt.get_unverified_header(token)
        kid = header.get("kid", "")
        keys = _load_jwks()
        if kid not in keys:
            # Try refreshing once
            _jwks_cache["expires_at"] = 0
            keys = _load_jwks()
        if kid not in keys:
            raise HTTPException(status_code=401, detail="Unknown token key")
        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(keys[kid])
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=_FIREBASE_PROJECT_ID,
            issuer=f"https://securetoken.google.com/{_FIREBASE_PROJECT_ID}",
            options={"verify_exp": True, "verify_iat": True},
        )
        uid = payload.get("sub") or payload.get("user_id", "")
        if not uid:
            raise HTTPException(status_code=401, detail="Missing uid in token")
        return {"uid": uid, "email": payload.get("email", "")}
    except HTTPException:
        raise
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Auth error: {e}")
