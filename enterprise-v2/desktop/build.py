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
import shutil
import subprocess
import sys
from pathlib import Path

# .absolute() (not .resolve()): eşlenmiş sürücüyü (P:) UNC'ye çevirmez —
# npm/cmd.exe UNC yolu çalışma dizini olarak kabul etmez.
DESKTOP_DIR = Path(__file__).absolute().parent
V2_ROOT = DESKTOP_DIR.parent            # enterprise-v2/
FRONTEND = V2_ROOT / "frontend"


def _npm() -> str | None:
    # Windows'ta npm bir .cmd script'idir; tam yolu bulmak WinError 2'yi önler.
    return shutil.which("npm.cmd") or shutil.which("npm")


def build_frontend(force: bool = False) -> None:
    out = FRONTEND / "out"
    if (out / "index.html").is_file() and not force:
        print(f"→ Frontend zaten hazır, atlanıyor (Node gerekmez): {out}")
        return

    npm = _npm()
    if npm is None:
        sys.exit(
            "HATA: npm bulunamadı — Node.js kurulu değil veya PATH'te yok.\n"
            "Seçenekler:\n"
            "  • Node.js kur (kurumsal npm registry / Nexus ile), sonra tekrar dene, ya da\n"
            "  • Node'lu bir makinede/CI'da alınmış enterprise-v2/frontend/out klasörünü\n"
            "    buraya kopyala; build.py Node'suz paketler."
        )

    print("→ Frontend statik export alınıyor...")
    env = os.environ.copy()
    env["DESKTOP_BUILD"] = "1"
    env["NEXT_PUBLIC_API_BASE"] = ""  # aynı origin
    if str(FRONTEND).startswith("\\\\"):
        sys.exit(
            "HATA: frontend UNC yolunda (\\\\sunucu\\...). npm UNC'de çalışmaz.\n"
            "Repoyu yerel diske kopyala (örn. C:\\reserve-agent) ve orada derle."
        )
    if not (FRONTEND / "node_modules").is_dir():
        # npm ci lock dosyası ister; yoksa npm install'a düş.
        cmd = [npm, "ci"] if (FRONTEND / "package-lock.json").is_file() else [npm, "install"]
        subprocess.run(cmd, cwd=FRONTEND, env=env, check=True)
    subprocess.run([npm, "run", "build"], cwd=FRONTEND, env=env, check=True)
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
        build_frontend(force=args.frontend)  # --frontend = zorla yeniden derle
    if args.pack or do_all:
        pack()
    print("\nBitti.")


if __name__ == "__main__":
    main()
