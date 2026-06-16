@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

echo [Spotti Voice] Installing Python dependencies...
python -m pip install -r requirements.txt -r requirements-build.txt -q
if errorlevel 1 (
  echo [Spotti Voice] pip install failed.
  exit /b 1
)

echo [Spotti Voice] Generating app icon...
python scripts\make-icon.py
if errorlevel 1 (
  echo [Spotti Voice] Icon generation failed.
  exit /b 1
)

echo [Spotti Voice] Stopping running engine...
taskkill /F /IM "Spotti Voice Engine.exe" >nul 2>&1
taskkill /F /IM "Spotti Voice.exe" >nul 2>&1
taskkill /F /IM SpottiVoice.exe >nul 2>&1
ping -n 2 127.0.0.1 >nul

set "PYI_EXTRA="
if /I "%~1"=="--clean" (
  set "PYI_EXTRA=--clean"
  echo [Spotti Voice] Full clean rebuild requested.
) else (
  echo [Spotti Voice] Incremental build ^(pass --clean for full rebuild^).
)

echo [Spotti Voice] Building Spotti Voice Engine.exe...
python -m PyInstaller spotti_voice_engine.spec --noconfirm %PYI_EXTRA%
if errorlevel 1 (
  echo [Spotti Voice] PyInstaller failed.
  exit /b 1
)

if not exist "dist\Spotti Voice Engine.exe" (
  echo [Spotti Voice] dist\Spotti Voice Engine.exe missing after build.
  exit /b 1
)

echo [Spotti Voice] Built dist\Spotti Voice Engine.exe
exit /b 0
