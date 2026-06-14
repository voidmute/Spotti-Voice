@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

echo [SPOTTI] Installing Python dependencies...
python -m pip install -r requirements.txt -r requirements-build.txt -q
if errorlevel 1 (
  echo [SPOTTI] pip install failed.
  exit /b 1
)

echo [SPOTTI] Building React UI...
where npm >nul 2>&1
if errorlevel 1 (
  echo [SPOTTI] Node.js/npm not found. Install Node 18+.
  exit /b 1
)
pushd web
call npm install
if errorlevel 1 goto :fail
call npm run build
if errorlevel 1 goto :fail
popd

if not exist "web\dist\index.html" (
  echo [SPOTTI] web\dist\index.html missing after build.
  exit /b 1
)

echo [SPOTTI] Stopping running Spotti Voice / Electron...
taskkill /F /IM "Spotti Voice.exe" >nul 2>&1
taskkill /F /IM electron.exe >nul 2>&1
ping -n 3 127.0.0.1 >nul
if exist "dist\Spotti Voice.exe" (
  del /F /Q "dist\Spotti Voice.exe" 2>nul
)
if exist "dist\Spotti Voice.exe" (
  if exist "dist\Spotti Voice.exe.old" del /F /Q "dist\Spotti Voice.exe.old" 2>nul
  move /Y "dist\Spotti Voice.exe" "dist\Spotti Voice.exe.old" >nul
)
if exist "dist\Spotti Voice.exe" (
  echo [SPOTTI] Cannot overwrite dist\Spotti Voice.exe - close it and retry.
  exit /b 1
)

if not exist "electron\node_modules\electron" (
  echo [SPOTTI] Installing Electron shell...
  pushd electron
  call npm install
  if errorlevel 1 goto :fail
  popd
)

echo [SPOTTI] Building Spotti Voice.exe (PyInstaller)...
python -m PyInstaller spotti_voice_engine.spec --noconfirm --clean
if errorlevel 1 (
  echo [SPOTTI] PyInstaller failed.
  exit /b 1
)

echo [SPOTTI] Copying Electron shell beside exe...
if not exist "electron\node_modules\electron\dist\resources.pak" (
  pushd electron
  call npm ci
  if errorlevel 1 goto :fail
  popd
)
if not exist "dist\electron" mkdir "dist\electron"
if exist "dist\electron\.user-data" rmdir /S /Q "dist\electron\.user-data" 2>nul
ping -n 2 127.0.0.1 >nul
copy /Y "electron\package.json" "dist\electron\" >nul
copy /Y "electron\package-lock.json" "dist\electron\" >nul
copy /Y "electron\main.mjs" "dist\electron\" >nul
copy /Y "electron\preload.cjs" "dist\electron\" >nul
copy /Y "electron\tray-menu.html" "dist\electron\" >nul
copy /Y "electron\tray-menu-preload.cjs" "dist\electron\" >nul
copy /Y "electron\winGlobalPtt.mjs" "dist\electron\" >nul
if not exist "dist\electron\node_modules\electron\dist\resources.pak" (
  if exist "dist\electron\node_modules" rmdir /S /Q "dist\electron\node_modules" 2>nul
  ping -n 2 127.0.0.1 >nul
)
robocopy "electron\node_modules" "dist\electron\node_modules" /E /COPY:DAT /R:2 /W:1 /NFL /NDL /NJH /NJS >nul
if not exist "dist\electron\node_modules\electron\dist\resources.pak" (
  echo [SPOTTI] Electron runtime incomplete - resources.pak missing.
  exit /b 1
)

echo [SPOTTI] Copying web UI beside exe...
if exist "dist\web" rmdir /S /Q "dist\web" 2>nul
xcopy /E /I /Y /Q "web\dist" "dist\web\dist" >nul
if not exist "dist\web\dist\index.html" (
  echo [SPOTTI] dist\web\dist\index.html missing after copy.
  exit /b 1
)

echo [SPOTTI] Bundling MSVC runtime DLLs...
powershell -NoProfile -ExecutionPolicy Bypass -File "installer\scripts\stage-vc-runtime.ps1" -TargetList "dist"
if errorlevel 1 (
  echo [SPOTTI] Failed to stage VC++ runtime DLLs.
  exit /b 1
)

echo.
echo [OK] dist\Spotti Voice.exe
echo     UI: dist\web\dist\
echo     Electron: dist\electron\
exit /b 0

:fail
popd
exit /b 1
