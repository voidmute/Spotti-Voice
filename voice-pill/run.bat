@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

REM Stale Spotti Voice Electron from this folder (avoids cache lock / duplicate PTT)
for /f "tokens=2 delims==" %%p in ('wmic process where "name='electron.exe' and CommandLine like '%%voice-pill\\electron%%'" get ProcessId /format:list 2^>nul ^| find "ProcessId"') do (
  taskkill /F /PID %%p >nul 2>&1
)

if not exist "web\dist\index.html" (
  echo [Spotti Voice] Building web UI...
  cd /d "%~dp0web"
  if not exist "node_modules\" call npm install
  call npm run build
  if errorlevel 1 (
    echo [Spotti Voice] Web build failed. Fix errors above and retry.
    exit /b 1
  )
)

echo [Spotti Voice] Checking whisper.cpp (local Russian STT)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\fetch-whisper.ps1"
if errorlevel 1 (
  echo [Spotti Voice] whisper.cpp install failed. Check network and retry.
  exit /b 1
)

if not exist "dist\Spotti Voice.exe" (
  echo [Spotti Voice] Building branded engine exe...
  call "%~dp0build-engine.bat"
  if errorlevel 1 (
    echo [Spotti Voice] Engine build failed.
    exit /b 1
  )
)

echo [Spotti Voice] Starting Electron UI...
cd /d "%~dp0electron"
if not exist "node_modules\" call npm install
start "" npm.cmd start
exit /b 0
