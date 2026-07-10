"""Uçtan uca build: frontend statik export → PyInstaller tek klasör.

    python build.py            # her ikisi
    python build.py --frontend # sadece frontend export
    python build.py --pack     # sadece paketleme (export hazır olmalı)

Windows'ta çalıştırın (exe hedefi için). macOS/Linux'ta test amaçlı çalışır ama
üretilen paket o platforma özeldir (PyInstaller cross-compile etmez).
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

DESKTOP_DIR = Path(__file__).resolve().parent
ENTERPRISE = DESKTOP_DIR.parents[1] / "enterprise"
FRONTEND = ENTERPRISE / "frontend"


def _npm() -> str:
    return "npm.cmd" if os.name == "nt" else "npm"


def build_frontend() -> None:
    print("→ Frontend statik export alınıyor...")
    env = os.environ.copy()
    env["DESKTOP_BUILD"] = "1"
    env["NEXT_PUBLIC_API_BASE"] = ""  # aynı origin
    if not (FRONTEND / "node_modules").is_dir():
        subprocess.run([_npm(), "ci"], cwd=FRONTEND, env=env, check=True)
    subprocess.run([_npm(), "run", "build"], cwd=FRONTEND, env=env, check=True)
    out = FRONTEND / "out"
    if not (out / "index.html").is_file():
        sys.exit("HATA: out/index.html üretilmedi — export başarısız.")
    print(f"  ✓ {out}")


def pack() -> None:
    print("→ PyInstaller ile paketleniyor...")
    if not (FRONTEND / "out" / "index.html").is_file():
        sys.exit("HATA: frontend/out yok. Önce: python build.py --frontend")
    subprocess.run(
        [sys.executable, "-m", "PyInstaller", "--noconfirm", "actuarius.spec"],
        cwd=DESKTOP_DIR,
        check=True,
    )
    print(f"  ✓ {DESKTOP_DIR / 'dist' / 'Actuarius'}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frontend", action="store_true")
    ap.add_argument("--pack", action="store_true")
    args = ap.parse_args()
    do_all = not (args.frontend or args.pack)
    if args.frontend or do_all:
        build_frontend()
    if args.pack or do_all:
        pack()
    print("\nBitti.")


if __name__ == "__main__":
    main()
