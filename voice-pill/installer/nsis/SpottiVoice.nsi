; Spotti Voice — NSIS engine, silent install, custom Electron setup UI.
; Build: voice-pill\build-setup.bat (requires NSIS 3.x makensis on PATH)

!include "LogicLib.nsh"

!define APP_NAME "Spotti Voice"
!define APP_PUBLISHER "Spotti"
!define APP_EXE "Spotti Voice.exe"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\SpottiVoice"
!define PROTOCOL "spotti-voice"

!define APP_VERSION "0.1.0.0"

Name "${APP_NAME}"
OutFile "..\..\dist-setup\SpottiVoice-Setup.tmp.exe"
InstallDir "$PROGRAMFILES64\Spotti Voice"
RequestExecutionLevel admin
ShowInstDetails hide
SilentInstall silent

Var InstDirFromUi
Var SetupLogPath
Var BootstrapError

Function ReadInstallDirFromUi
  StrCpy $InstDirFromUi ""
  IfFileExists "$PLUGINSDIR\install-dir.txt" 0 done
  ClearErrors
  FileOpen $0 "$PLUGINSDIR\install-dir.txt" r
  IfErrors done
  FileRead $0 $1
  FileClose $0
trim_loop:
  StrLen $2 $1
  IntCmp $2 0 done_trim 0 done_trim
  IntOp $2 $2 - 1
  StrCpy $3 $1 1 $2
  StrCmp $3 "$\r" trim_one
  StrCmp $3 "$\n" trim_one
  StrCpy $InstDirFromUi $1
  Goto done
trim_one:
  StrCpy $1 $1 $2
  Goto trim_loop
done_trim:
  StrCpy $InstDirFromUi $1
done:
FunctionEnd

Function AppendSetupLog
  Exch $0
  ClearErrors
  FileOpen $1 "$SetupLogPath" a
  IfErrors log_done
  FileWrite $1 "$0$\r$\n"
  FileClose $1
log_done:
  Pop $0
FunctionEnd

Section "Main"
  InitPluginsDir
  ReadEnvStr $SetupLogPath TEMP
  StrCpy $SetupLogPath "$SetupLogPath\SpottiVoice-setup.log"
  Delete "$SetupLogPath"
  Push "PLUGINSDIR=$PLUGINSDIR"
  Call AppendSetupLog

  SetOutPath "$PLUGINSDIR\setup-ui"
  File "..\staging\setup-ui\main.mjs"
  File "..\staging\setup-ui\preload.mjs"
  File "..\staging\setup-ui\package.json"
  File /nonfatal "..\staging\setup-ui\package-lock.json"
  File /r "..\staging\setup-ui\web"
  File /r "..\staging\setup-ui\runtime"

  SetOutPath "$PLUGINSDIR"
  File /r "..\staging\payload"

  StrCpy $InstDirFromUi ""
  StrCpy $BootstrapError ""

  IfFileExists "$PLUGINSDIR\setup-ui\runtime\electron.exe" runtime_ok
    StrCpy $BootstrapError "12"
    Push "bootstrap error 12: missing runtime"
    Call AppendSetupLog
    Goto write_config
runtime_ok:
  IfFileExists "$PLUGINSDIR\payload\${APP_EXE}" payload_ok
    StrCpy $BootstrapError "11"
    Push "bootstrap error 11: missing payload exe"
    Call AppendSetupLog
    Goto write_config
payload_ok:
  StrCpy $BootstrapError ""

write_config:
  FileOpen $0 "$PLUGINSDIR\setup-ui\setup-config.ini" w
  FileWrite $0 "payloadDir=$PLUGINSDIR\payload$\r$\n"
  FileWrite $0 "stateFile=$PLUGINSDIR\install-state.json$\r$\n"
  FileWrite $0 "defaultDir=$INSTDIR$\r$\n"
  FileWrite $0 "version=${APP_VERSION}$\r$\n"
  ${If} $BootstrapError != ""
    FileWrite $0 "bootstrapError=$BootstrapError$\r$\n"
  ${EndIf}
  FileClose $0

  ${If} $BootstrapError == "12"
    Abort
  ${EndIf}

  Push "launching $PLUGINSDIR\setup-ui\runtime\electron.exe"
  Call AppendSetupLog

  DetailPrint "Launching custom Electron setup UI..."
  ExecWait '"$PLUGINSDIR\setup-ui\runtime\electron.exe" "$PLUGINSDIR\setup-ui"' $0

  Push "electron exit code $0"
  Call AppendSetupLog

  ${If} $0 != 0
    Abort
  ${EndIf}

  Call ReadInstallDirFromUi
  ${If} $InstDirFromUi == ""
    Push "install-dir.txt missing after wizard exit 0"
    Call AppendSetupLog
    Abort
  ${EndIf}
  StrCpy $INSTDIR $InstDirFromUi

  IfFileExists "$INSTDIR\${APP_EXE}" exe_ok
    Push "missing after install: $INSTDIR\${APP_EXE}"
    Call AppendSetupLog
    Abort
exe_ok:

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateDirectory "$SMPROGRAMS\Spotti Voice"
  CreateShortcut "$SMPROGRAMS\Spotti Voice\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  CreateShortcut "$SMPROGRAMS\Spotti Voice\Uninstall.lnk" "$INSTDIR\Uninstall.exe"

  IfFileExists "$PLUGINSDIR\desktop-shortcut.flag" 0 no_desktop
    CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
no_desktop:

  ; OAuth callback protocol handler
  WriteRegStr HKCR "${PROTOCOL}" "" "URL:Spotti Voice OAuth"
  WriteRegStr HKCR "${PROTOCOL}" "URL Protocol" ""
  WriteRegStr HKCR "${PROTOCOL}\DefaultIcon" "" "$INSTDIR\${APP_EXE},0"
  WriteRegStr HKCR "${PROTOCOL}\shell\open\command" "" '"$INSTDIR\${APP_EXE}" "%1"'

  WriteRegStr HKLM "${UNINST_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKLM "${UNINST_KEY}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKLM "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINST_KEY}" "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\${APP_NAME}.lnk"
  RMDir /r "$SMPROGRAMS\Spotti Voice"
  DeleteRegKey HKCR "${PROTOCOL}"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKLM "${UNINST_KEY}"
SectionEnd
