# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec — Actuarius Enterprise masaüstü (offline).

Windows'ta çalıştır:
    pyinstaller actuarius.spec

Önkoşul: frontend statik export'u alınmış olmalı (enterprise/frontend/out).
    cd enterprise/frontend && set DESKTOP_BUILD=1 && set NEXT_PUBLIC_API_BASE= && npm run build

Sonuç: dist/Actuarius/ (tek klasör). İçinde Actuarius.exe — çift tıkla çalışır.
"""

import os
from PyInstaller.utils.hooks import collect_all, collect_submodules

SPEC_DIR = os.path.dirname(os.path.abspath(SPEC))
ENT = os.path.abspath(os.path.join(SPEC_DIR, "..", "..", "enterprise"))

BACKEND_APP = os.path.join(ENT, "backend", "app")
SCHEMA_SQL = os.path.join(ENT, "backend", "schema.sql")
FRONTEND_OUT = os.path.join(ENT, "frontend", "out")

datas = [
    (BACKEND_APP, "backend/app"),
    (SCHEMA_SQL, "backend"),
    (FRONTEND_OUT, "frontend"),
]
binaries = []
hiddenimports = [
    "app.main",
    "bcrypt",
    "jwt",
]

# Dinamik import'ları olan paketleri tam topla.
for pkg in ("uvicorn", "oracledb", "keyring", "chainladder", "fastapi", "starlette", "webview"):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

hiddenimports += collect_submodules("uvicorn")
# keyring Windows backend'i
hiddenimports += ["keyring.backends.Windows", "keyring.backends.SecretService", "keyring.backends.macOS"]

block_cipher = None

a = Analysis(
    ["launcher.py"],
    pathex=[SPEC_DIR],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "pytest"],
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Actuarius",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,  # pencere modu — konsol açılmaz
    icon=os.path.join(FRONTEND_OUT, "favicon.png") if os.path.isfile(os.path.join(FRONTEND_OUT, "favicon.png")) else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    name="Actuarius",
)
