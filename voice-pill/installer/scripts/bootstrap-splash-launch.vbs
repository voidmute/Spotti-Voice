' Launch bootstrap-splash.ps1 with no console flash (style 0).
If WScript.Arguments.Count < 1 Then WScript.Quit 1

ps1 = WScript.Arguments(0)
cmd = "powershell.exe -STA -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & ps1 & """"
CreateObject("WScript.Shell").Run cmd, 0, False
