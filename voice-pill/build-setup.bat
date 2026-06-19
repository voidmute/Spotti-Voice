@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

set "SKIP_APP=0"
set "BUNDLE_LEGACY=0"
if /I "%~1"=="-SkipAppBuild" set "SKIP_APP=1"
if /I "%~1"=="-BundleLegacy" set "BUNDLE_LEGACY=1"
if /I "%~2"=="-SkipAppBuild" set "SKIP_APP=1"
if /I "%~2"=="-BundleLegacy" set "BUNDLE_LEGACY=1"

for /f "usebackq delims=" %%V in ("installer\VERSION") do set "APP_VERSION=%%V"
if not defined APP_VERSION set "APP_VERSION=0.1.0.0"

echo [SPOTTI] Building SpottiVoice-Setup.exe (thin Server bootstrap) v%APP_VERSION%

if not "%SKIP_APP%"=="0" goto :skip_app_build
echo [SPOTTI] Building application payload...
call "%~dp0build-exe.bat"
if errorlevel 1 exit /b 1
goto :after_app_build
:skip_app_build
if not exist "dist\electron\node_modules\electron\dist\Spotti Voice.exe" (
  echo [SPOTTI] dist\electron\node_modules\electron\dist\Spotti Voice.exe missing. Run build-exe.bat first or omit -SkipAppBuild.
  exit /b 1
)
if not exist "dist\Spotti Voice Engine.exe" (
  echo [SPOTTI] dist\Spotti Voice Engine.exe missing. Run build-exe.bat first or omit -SkipAppBuild.
  exit /b 1
)
:after_app_build

where npm >nul 2>&1
if errorlevel 1 (
  echo [SPOTTI] Node.js/npm required for setup UI.
  exit /b 1
)

echo [SPOTTI] Syncing brand assets...
python "scripts\make-icon.py"
if errorlevel 1 exit /b 1

echo [SPOTTI] Building setup UI (React)...
pushd installer\web
call npm install
if errorlevel 1 goto :fail
call npm run build
if errorlevel 1 goto :fail
popd
if not exist "installer\web\dist\index.html" (
  echo [SPOTTI] installer\web\dist\index.html missing.
  exit /b 1
)

echo [SPOTTI] Installing setup Electron shell...
if not exist "installer\electron\node_modules\electron\dist\resources.pak" (
  pushd installer\electron
  call npm install
  if errorlevel 1 goto :fail
  popd
)

echo [SPOTTI] Staging installer payload...
if not exist "dist\launch-ui.cmd" copy /Y "launch-ui.cmd" "dist\launch-ui.cmd" >nul
if exist "installer\staging" rmdir /S /Q "installer\staging" 2>nul
mkdir "installer\staging\payload" 2>nul
mkdir "installer\staging\setup-ui" 2>nul

robocopy "dist" "installer\staging\payload" /E /COPY:DAT /XD report /XF *.old /R:2 /W:1 /NFL /NDL /NJH /NJS >nul
if errorlevel 8 (
  echo [SPOTTI] Failed to stage dist payload.
  exit /b 1
)
if exist "installer\staging\payload\electron\.user-data" rmdir /S /Q "installer\staging\payload\electron\.user-data" 2>nul
del /F /Q "installer\staging\payload\*.old" 2>nul

if exist "installer\staging\payload\electron\.user-data" rmdir /S /Q "installer\staging\payload\electron\.user-data" 2>nul
del /F /Q "installer\staging\payload\*.old" 2>nul

echo [SPOTTI] Branding payload electron.exe (fallback launcher icon)...
node "scripts\brand-electron-shell.mjs" "installer\staging\payload\electron\node_modules\electron\dist\electron.exe" "installer\staging\payload\electron\node_modules\electron\dist\electron.exe" "Spotti Voice" "electron.exe"
if errorlevel 1 exit /b 1

echo [SPOTTI] Writing payload manifest and archive...
powershell -NoProfile -ExecutionPolicy Bypass -File "installer\scripts\write-payload-manifest.ps1" -PayloadDir "installer\staging\payload" -OutFile "installer\staging\setup-ui\payload-manifest.json" -Version "%APP_VERSION%"
if errorlevel 1 exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -File "installer\scripts\pack-payload.ps1" -PayloadDir "installer\staging\payload" -ZipOut "installer\staging\payload.zip"
if errorlevel 1 exit /b 1

copy /Y "installer\electron\package.json" "installer\staging\setup-ui\" >nul
copy /Y "installer\electron\package-lock.json" "installer\staging\setup-ui\" >nul 2>nul
copy /Y "installer\electron\main.mjs" "installer\staging\setup-ui\" >nul
copy /Y "installer\electron\preload.mjs" "installer\staging\setup-ui\" >nul
if not exist "installer\staging\setup-ui\scripts" mkdir "installer\staging\setup-ui\scripts" 2>nul
copy /Y "installer\scripts\finalize-install.ps1" "installer\staging\setup-ui\scripts\" >nul
if not exist "installer\staging\setup-ui\assets" mkdir "installer\staging\setup-ui\assets" 2>nul
copy /Y "assets\app-icon.png" "installer\staging\setup-ui\assets\" >nul
xcopy /E /I /Y /Q "installer\web\dist" "installer\staging\setup-ui\web\dist" >nul
if exist "installer\staging\setup-ui\.user-data" rmdir /S /Q "installer\staging\setup-ui\.user-data" 2>nul
mkdir "installer\staging\setup-ui\runtime" 2>nul
robocopy "installer\electron\node_modules\electron\dist" "installer\staging\setup-ui\runtime" /E /COPY:DAT /R:2 /W:1 /NFL /NDL /NJH /NJS >nul
if not exist "installer\staging\setup-ui\runtime\electron.exe" (
  echo [SPOTTI] Electron runtime missing in staging.
  exit /b 1
)

echo [SPOTTI] Trimming Electron locales (setup runtime)...
for %%F in ("installer\staging\setup-ui\runtime\locales\*.pak") do (
  if /I not "%%~nxF"=="en-US.pak" if /I not "%%~nxF"=="ru.pak" del "%%F" 2>nul
)

echo [SPOTTI] Branding setup wizard shell...
node "scripts\brand-electron-shell.mjs" "installer\staging\setup-ui\runtime\electron.exe" "installer\staging\setup-ui\runtime\Spotti Voice Setup.exe" "Spotti Voice Setup" "Spotti Voice Setup.exe" admin
if errorlevel 1 exit /b 1

echo [SPOTTI] Packing setup bootstrap default_app.asar...
if not exist "installer\staging\setup-ui\runtime\resources" mkdir "installer\staging\setup-ui\runtime\resources" 2>nul
node "installer\electron\node_modules\@electron\asar\bin\asar.mjs" pack "installer\bootstrap" "installer\staging\setup-ui\runtime\resources\default_app.asar"
if errorlevel 1 exit /b 1

echo [SPOTTI] Bundling MSVC runtime DLLs...
powershell -NoProfile -ExecutionPolicy Bypass -File "installer\scripts\stage-vc-runtime.ps1" -TargetList "installer\staging\setup-ui\runtime;installer\staging\payload"
if errorlevel 1 (
  echo [SPOTTI] Failed to stage VC++ runtime DLLs.
  exit /b 1
)

if not exist "dist-setup" mkdir "dist-setup"

echo [SPOTTI] Packing Server release assets...
copy /Y "installer\staging\payload.zip" "dist-setup\payload.zip" >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "installer\scripts\pack-setup-runtime.ps1" -SetupUiDir "installer\staging\setup-ui" -ZipOut "dist-setup\setup-runtime.zip"
if errorlevel 1 exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -File "installer\scripts\write-release-manifest.ps1" -Version "%APP_VERSION%" -OutFile "dist-setup\manifest.json"
if errorlevel 1 exit /b 1

if "%BUNDLE_LEGACY%"=="1" (
  echo [SPOTTI] Building legacy bundled NSIS installer...
  powershell -NoProfile -ExecutionPolicy Bypass -File "installer\scripts\build-nsis-installer.ps1" -StagingDir "installer\staging" -OutFile "dist-setup\SpottiVoice-Setup-legacy.exe" -Version "%APP_VERSION%"
  if errorlevel 1 exit /b 1
) else (
  echo [SPOTTI] Building thin SpottiVoice-Setup.exe ^(Server assets, max 20 MB^)...
  powershell -NoProfile -ExecutionPolicy Bypass -File "installer\scripts\build-thin-nsis.ps1" -OutFile "dist-setup\SpottiVoice-Setup.exe" -Version "%APP_VERSION%"
  if errorlevel 1 exit /b 1
)

echo [SPOTTI] Writing SHA256...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$h=(Get-FileHash -LiteralPath 'dist-setup\SpottiVoice-Setup.exe' -Algorithm SHA256).Hash.ToLower(); Set-Content -LiteralPath 'dist-setup\SpottiVoice-Setup.sha256' -Value \"$h  SpottiVoice-Setup.exe\" -Encoding ascii"
if errorlevel 1 exit /b 1

echo [SPOTTI] Code signing (optional)...
powershell -NoProfile -ExecutionPolicy Bypass -File "installer\scripts\sign-release.ps1" -Files "dist-setup\SpottiVoice-Setup.exe"
if errorlevel 1 exit /b 1

echo.
echo [OK] dist-setup\SpottiVoice-Setup.exe ^(thin bootstrap — upload assets to Server^)
echo [OK] dist-setup\manifest.json + setup-runtime.zip + payload.zip
echo [OK] Upload: .\scripts\deploy\sync-voice-installer-assets.ps1
echo [OK] dist-setup\SpottiVoice-Setup.sha256
exit /b 0

:fail
popd
exit /b 1
