' Runs thin-bootstrap.ps1 with no visible console window.
If WScript.Arguments.Count < 1 Then WScript.Quit 1

pluginDir = WScript.Arguments(0)
ps1 = pluginDir & "\thin-bootstrap.ps1"
cmd = "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & ps1 & """ -PluginDir """ & pluginDir & """"

Set shell = CreateObject("WScript.Shell")
exitCode = shell.Run(cmd, 0, True)
WScript.Quit exitCode
