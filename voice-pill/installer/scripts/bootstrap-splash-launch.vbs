' Launch bootstrap-splash.hta hidden (style 0).
If WScript.Arguments.Count < 1 Then WScript.Quit 1

hta = WScript.Arguments(0)
cmd = "mshta.exe """ & hta & """"
CreateObject("WScript.Shell").Run cmd, 0, False
