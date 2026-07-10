"""Kullanıcı yönetimi — sadece admin erişebilir."""

from __future__ import annotations

from typing import Annotated

import oracledb
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import hash_password, require_admin
from app.db import get_pool

router = APIRouter(prefix="/v1/admin/users", tags=["users"])

Admin = Annotated[dict, Depends(require_admin)]


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "user"


class UpdateUserRequest(BaseModel):
    password: str | None = None
    role: str | None = None
    is_active: bool | None = None


@router.get("", response_model=list[UserOut])
async def list_users(_: Admin) -> list[UserOut]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute(
                "SELECT id, username, role, is_active FROM users ORDER BY id"
            )
            rows = await cur.fetchall()
    return [UserOut(id=r[0], username=r[1], role=r[2], is_active=bool(r[3])) for r in rows]


@router.post("", response_model=UserOut, status_code=201)
async def create_user(body: CreateUserRequest, _: Admin) -> UserOut:
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute("SELECT id FROM users WHERE username = :1", [body.username])
            if await cur.fetchone():
                raise HTTPException(status_code=409, detail="username_exists")

            pw_hash = hash_password(body.password)
            out_id = cur.var(oracledb.NUMBER)
            await cur.execute(
                "INSERT INTO users (username, password_hash, role) "
                "VALUES (:1, :2, :3) RETURNING id INTO :4",
                [body.username, pw_hash, body.role, out_id],
            )
            new_id = int(out_id.getvalue()[0])
        await conn.commit()

    return UserOut(id=new_id, username=body.username, role=body.role, is_active=True)


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(user_id: int, body: UpdateUserRequest, _: Admin) -> UserOut:
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute(
                "SELECT id, username, password_hash, role, is_active FROM users WHERE id = :1",
                [user_id],
            )
            row = await cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="user_not_found")

            uid, username, pw_hash, role, is_active = row

            new_pw_hash = hash_password(body.password) if body.password else pw_hash
            new_role = body.role if body.role is not None else role
            new_active = int(body.is_active) if body.is_active is not None else is_active

            await cur.execute(
                "UPDATE users SET password_hash=:1, role=:2, is_active=:3 WHERE id=:4",
                [new_pw_hash, new_role, new_active, user_id],
            )
        await conn.commit()

    return UserOut(id=uid, username=username, role=new_role, is_active=bool(new_active))


@router.delete("/{user_id}", status_code=204)
async def delete_user(user_id: int, admin: Admin) -> None:
    if str(user_id) == admin["sub"]:
        raise HTTPException(status_code=400, detail="cannot_delete_self")
    pool = await get_pool()
    async with pool.acquire() as conn:
        with conn.cursor() as cur:
            await cur.execute("DELETE FROM users WHERE id = :1", [user_id])
        await conn.commit()
