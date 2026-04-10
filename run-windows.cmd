@echo off
setlocal

set "ROOT_DIR=%~dp0"
set "MODE=%~1"
set "EXTRA_ARGS="

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
if not "%~2"=="" set "EXTRA_ARGS=%~2"
if not "%~3"=="" set "EXTRA_ARGS=%EXTRA_ARGS% %~3"
if not "%~4"=="" set "EXTRA_ARGS=%EXTRA_ARGS% %~4"
if not "%~5"=="" set "EXTRA_ARGS=%EXTRA_ARGS% %~5"
if not "%~6"=="" set "EXTRA_ARGS=%EXTRA_ARGS% %~6"

cd /d "%ROOT_DIR%"
python .\backend\server.py %EXTRA_ARGS%
