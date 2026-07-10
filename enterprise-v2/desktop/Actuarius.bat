@echo off
REM Actuarius Enterprise — exe olmadan, doğrudan Python'dan çift tıkla çalıştır.
REM Gereksinimler (bir kez):
REM   1) pip install -r requirements.txt   (pywebview, uvicorn, oracledb, ...)
REM   2) ..\frontend\out klasörü hazır olmalı (Node'lu bir yerde bir kez derlenir)
REM Bu dosyaya çift tıkla → uygulama penceresi açılır (konsol görünmez).

cd /d "%~dp0"
start "" pythonw launcher.py
