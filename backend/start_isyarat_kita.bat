@echo off
title Launcher Isyarat Kita

cd /d "%~dp0"

echo [1/2] Menjalankan Backend FastAPI (http://127.0.0.1:8000)...
start "Backend FastAPI" cmd /k "call venv\Scripts\activate.bat && uvicorn app.main:app --host 0.0.0.0 --port 8000"

timeout /t 3 /nobreak >nul

echo [2/2] Menjalankan Cloudflare Tunnel Sync ke Render Router...
start "Cloudflare Tunnel Sync" cmd /k "call venv\Scripts\activate.bat && python tunnel_sync.py"

echo Semua layanan sudah dijalankan!
