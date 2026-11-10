@echo off
title UniScore Portal Launcher
echo ==============================================
echo   Starting UniScore Portal (Localhost)
echo ==============================================

REM Start FastAPI Backend
echo [1/2] Starting Backend at http://127.0.0.1:8000 ...
start "UniScore Backend" cmd /k "cd /d "%~dp0backend" && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload || "C:\Users\Dhinesh\AppData\Local\Programs\Python\Python312\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

REM Start React/Vite Frontend
echo [2/2] Starting Frontend at http://localhost:5173 ...
start "UniScore Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Servers are up:
echo - Frontend: http://localhost:5173
echo - Backend API Docs: http://127.0.0.1:8000/docs
echo.
timeout /t 3 >nul
start http://localhost:5173
