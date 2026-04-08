@echo off
setlocal

set "ROOT_DIR=%~dp0"
set "MODE=%~1"

if "%MODE%"=="" set "MODE=lan"

if /I "%MODE%"=="local" (
  set "NEKO_HOST=127.0.0.1"
) else if /I "%MODE%"=="lan" (
  set "NEKO_HOST=0.0.0.0"
) else (
  echo Usage: run-windows.cmd [local^|lan]
  exit /b 1
)

if "%NEKO_PORT%"=="" set "NEKO_PORT=8765"

cd /d "%ROOT_DIR%"
python .\backend\server.py
