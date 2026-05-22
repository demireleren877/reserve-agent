"""Login / logout endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import create_token, get_current_user, verify_password
from app.db import get_pool

router = APIRouter(prefix="/v1/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    user_id: int
    username: str
    role: str


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest) -> LoginResponse:
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute(
                "SELECT id, username, password_hash, role, is_active "
                "FROM users WHERE username = :1",
                [body.username],
            )
            row = await cur.fetchone()

    if not row:
        raise HTTPException(status_code=401, detail="invalid_credentials")

    user_id, username, password_hash, role, is_active = row

    if not is_active:
        raise HTTPException(status_code=403, detail="user_disabled")

    if not verify_password(body.password, password_hash):
        raise HTTPException(status_code=401, detail="invalid_credentials")

    token = create_token(user_id, username, role)
    return LoginResponse(token=token, user_id=user_id, username=username, role=role)


@router.get("/me")
async def me(user: Annotated[dict, Depends(get_current_user)]) -> dict:
    return {"user_id": user["sub"], "username": user["username"], "role": user["role"]}
