' Launch bootstrap-splash.ps1 (hidden console, visible WinForms spinner).
If WScript.Arguments.Count < 1 Then WScript.Quit 1

ps1 = WScript.Arguments(0)
cmd = "powershell.exe -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & ps1 & """"
CreateObject("WScript.Shell").Run cmd, 0, False
