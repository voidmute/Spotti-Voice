# Stop leftover thin bootstrap installer processes (not Spotti Voice app or setup wizard).
$ErrorActionPreference = "SilentlyContinue"
$selfPid = $PID

function Stop-Proc([int]$Id) {
    if ($Id -le 0 -or $Id -eq $selfPid) { return }
    Stop-Process -Id $Id -Force -ErrorAction SilentlyContinue
}

Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ForEach-Object {
    $id = [int]$_.ProcessId
    if ($id -eq $selfPid) { return }
    $name = [string]$_.Name
    $cmd = [string]$_.CommandLine
    if ($name -ieq "SpottiVoice-Setup.exe") { Stop-Proc $id; return }
    if ($name -ieq "mshta.exe" -and $cmd -match "bootstrap-splash\.hta") { Stop-Proc $id; return }
    if ($name -ieq "powershell.exe" -and $cmd -match "thin-bootstrap\.ps1|bootstrap-splash\.ps1") { Stop-Proc $id; return }
    if ($name -ieq "wscript.exe" -and $cmd -match "run-bootstrap-hidden|bootstrap-splash-launch") { Stop-Proc $id; return }
}

Remove-Item -LiteralPath (Join-Path $env:TEMP "SpottiVoice-splash.pid") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $env:TEMP "SpottiVoice-splash.stop") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $env:TEMP "SpottiVoice\stub\SpottiVoice-Setup.exe") -Force -ErrorAction SilentlyContinue
