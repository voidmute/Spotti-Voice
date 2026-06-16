@echo off
setlocal
set "ROOT=%~dp0"
set "ELECTRON_DIR=%ROOT%electron"
set "DIST=%ROOT%electron\node_modules\electron\dist"
set "UI=%DIST%\Spotti Voice.exe"
if not exist "%UI%" set "UI=%DIST%\electron.exe"
if not exist "%UI%" exit /b 1
REM Never launch legacy root Spotti Voice.exe — it sits outside icudtl.dat and crashes.
start "" "%UI%" "%ELECTRON_DIR%" %*
