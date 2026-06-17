; Spotti Voice — thin bootstrap installer (assets on VPS, ~20 MB local stub).
; Build: voice-pill\build-setup.bat

!include "LogicLib.nsh"

!define APP_NAME "Spotti Voice"
!ifndef APP_VERSION
  !define APP_VERSION "0.1.0.0"
!endif

Name "${APP_NAME}"
OutFile "..\..\dist-setup\SpottiVoice-Setup.exe"
SetCompressor /SOLID lzma
RequestExecutionLevel user
ShowInstDetails hide
SilentInstall silent
Icon "..\..\assets\app-icon.ico"

Section "Bootstrap"
  InitPluginsDir

  SetOutPath "$PLUGINSDIR"
  File "..\scripts\thin-bootstrap.ps1"
  File "..\..\dist-setup\bootstrap-manifest.json"

  SetOutPath "$PLUGINSDIR\vc-runtime"
  File "..\prereqs\vc-runtime-x64\vcruntime140.dll"
  File "..\prereqs\vc-runtime-x64\vcruntime140_1.dll"
  File "..\prereqs\vc-runtime-x64\msvcp140.dll"
  File "..\prereqs\vc-runtime-x64\msvcp140_1.dll"
  File "..\prereqs\vc-runtime-x64\msvcp140_2.dll"
  File "..\prereqs\vc-runtime-x64\concrt140.dll"

  DetailPrint "Preparing Spotti Voice setup..."
  ExecWait 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "$PLUGINSDIR\thin-bootstrap.ps1" -PluginDir "$PLUGINSDIR"' $0

  ${If} $0 != 0
    Abort
  ${EndIf}
SectionEnd
