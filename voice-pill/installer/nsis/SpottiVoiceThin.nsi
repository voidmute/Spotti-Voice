; Spotti Voice — thin bootstrap installer (assets on Server, ~20 MB local stub).
; Build: voice-pill\build-setup.bat

!include "LogicLib.nsh"
!include "FileFunc.nsh"
!insertmacro GetParameters
!insertmacro GetOptions

!define APP_NAME "Spotti Voice"
!ifndef APP_VERSION
  !define APP_VERSION "0.1.0.0"
!endif

Name "${APP_NAME}"
!ifndef OUTFILE_REL
  !define OUTFILE_REL "..\..\dist-setup\SpottiVoice-Setup.exe"
!endif
OutFile "${OUTFILE_REL}"
SetCompressor /SOLID lzma
RequestExecutionLevel admin
ShowInstDetails hide
SilentInstall silent
Icon "..\..\assets\app-icon.ico"

VIProductVersion ${APP_VERSION}
VIAddVersionKey /LANG=1033 "ProductName" "${APP_NAME}"
VIAddVersionKey /LANG=1033 "CompanyName" "Spotti"
VIAddVersionKey /LANG=1033 "FileDescription" "${APP_NAME} Installer"
VIAddVersionKey /LANG=1033 "FileVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=1033 "ProductVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Spotti"

Function .onInit
  ${GetParameters} $R0
  StrCpy $R1 ""
  ${GetOptions} $R0 "/stubcache" $R1
  StrCmp $R1 "1" bootstrap_run

  ; Temp relaunch only from Downloads (file-lock workaround). Else one launch, no extra prompt.
  StrCpy $R2 $EXEPATH
  StrLen $R3 $R2
  StrCpy $R4 0
dl_scan:
  IntCmp $R4 $R3 bootstrap_run
  StrCpy $R5 $R2 9 $R4
  StrCmp $R5 "Downloads" dl_relaunch
  StrCpy $R5 $R2 9 $R4
  StrCmp $R5 "downloads" dl_relaunch
  IntOp $R4 $R4 + 1
  Goto dl_scan

dl_relaunch:
  CreateDirectory "$TEMP\SpottiVoice\stub"
  CopyFiles /SILENT "$EXEPATH" "$TEMP\SpottiVoice\stub\SpottiVoice-Setup.exe"
  Exec '"$TEMP\SpottiVoice\stub\SpottiVoice-Setup.exe" /stubcache=1'
  Quit

bootstrap_run:
FunctionEnd

Section "Bootstrap"
  InitPluginsDir

  SetOutPath "$PLUGINSDIR"
  File "..\scripts\thin-bootstrap.ps1"
  File "..\scripts\run-bootstrap-hidden.vbs"
  File "..\scripts\bootstrap-splash.ps1"
  File "..\scripts\bootstrap-splash-launch.vbs"
  File "..\..\dist-setup\bootstrap-manifest.json"

  SetOutPath "$PLUGINSDIR\vc-runtime"
  File "..\prereqs\vc-runtime-x64\vcruntime140.dll"
  File "..\prereqs\vc-runtime-x64\vcruntime140_1.dll"
  File "..\prereqs\vc-runtime-x64\msvcp140.dll"
  File "..\prereqs\vc-runtime-x64\msvcp140_1.dll"
  File "..\prereqs\vc-runtime-x64\msvcp140_2.dll"
  File "..\prereqs\vc-runtime-x64\concrt140.dll"

  DetailPrint "Preparing Spotti Voice setup..."
  Exec '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "$PLUGINSDIR\bootstrap-splash.ps1"'
  Sleep 1200
  ExecWait '"$SYSDIR\wscript.exe" //B //Nologo "$PLUGINSDIR\run-bootstrap-hidden.vbs" "$PLUGINSDIR"' $0

  ${If} $0 != 0
    Abort
  ${EndIf}
  Quit
SectionEnd
