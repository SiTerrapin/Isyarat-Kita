@echo off
title Isyarat Kita - Backend FastAPI Server
cd /d "%~dp0"

echo =====================================================
echo   Isyarat Kita - Backend FastAPI + AI BISINDO
echo =====================================================
echo.

if not exist "venv\Scripts\uvicorn.exe" (
    echo [ERROR] Virtual environment 'venv' belum ditemukan!
    echo         Jalankan dulu: python -m venv venv ^&^& venv\Scripts\pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

echo [1/2] Memastikan PostgreSQL Docker (isyarat_kita_db) berjalan...
docker compose up -d >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARN] Docker belum menyala atau dilewati. Pastikan PostgreSQL aktif di port 15432.
) else (
    echo [OK]   Database PostgreSQL siap.
)

echo.
echo [2/2] Menjalankan FastAPI di http://0.0.0.0:8000 ...
echo       Health Check : http://localhost:8000/health
echo       Swagger Docs : http://localhost:8000/docs
echo       Tekan Ctrl+C untuk menghentikan server.
echo.

"venv\Scripts\uvicorn.exe" app.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir app

echo.
pause
