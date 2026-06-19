' Launch bootstrap-splash.hta visible (style 1). Style 0 hides mshta and only blinks the caret.
If WScript.Arguments.Count < 1 Then WScript.Quit 1

hta = WScript.Arguments(0)
cmd = "mshta.exe """ & hta & """"
CreateObject("WScript.Shell").Run cmd, 1, False
