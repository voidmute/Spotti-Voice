# Post-install: shortcuts, protocol handler, ARP registry, uninstall scripts.
param(
    [Parameter(Mandatory = $true)][string]$InstallDir,
    [Parameter(Mandatory = $true)][string]$PluginStateDir,
    [string]$Version = "0.1.0.0",
    [string]$Publisher = "Spotti",
    [string]$AppName = "Spotti Voice"
)

$ErrorActionPreference = "Stop"

$AppExeRel = "electron\node_modules\electron\dist\Spotti Voice.exe"
$LaunchUiRel = "launch-ui.cmd"
$ElectronDirRel = "electron"
$Protocol = "spotti-voice"

$InstallDir = $InstallDir.Trim().TrimEnd('\')
$AppExe = Join-Path $InstallDir $AppExeRel
$LaunchUi = Join-Path $InstallDir $LaunchUiRel
$ElectronDir = Join-Path $InstallDir $ElectronDirRel

if (-not (Test-Path -LiteralPath $AppExe)) {
    throw "Main application missing after install: $AppExe"
}

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    return $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$programFiles = [Environment]::GetFolderPath("ProgramFiles").TrimEnd('\')
$machineWide = (Test-IsAdmin) -and ($InstallDir.StartsWith($programFiles, [System.StringComparison]::OrdinalIgnoreCase))

$desktopFlag = Join-Path $PluginStateDir "desktop-shortcut.flag"
$flagsFile = Join-Path $PluginStateDir "install-flags.json"
$wantDesktop = Test-Path -LiteralPath $desktopFlag
$wantStartMenu = $true
if (Test-Path -LiteralPath $flagsFile) {
    try {
        $flags = Get-Content -LiteralPath $flagsFile -Raw | ConvertFrom-Json
        if ($null -ne $flags.desktopShortcut) { $wantDesktop = [bool]$flags.desktopShortcut }
        if ($null -ne $flags.startMenuShortcut) { $wantStartMenu = [bool]$flags.startMenuShortcut }
    } catch {
        # keep defaults from flag file
    }
}

if ($machineWide) {
    $startMenuRoot = Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs\Spotti Voice"
    $desktopLnk = Join-Path $env:Public "Desktop\$AppName.lnk"
    $UninstKey = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\SpottiVoice"
    $ProtocolRoot = "HKLM:\Software\Classes\$Protocol"
} else {
    $startMenuRoot = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Spotti Voice"
    $desktopLnk = Join-Path ([Environment]::GetFolderPath("Desktop")) "$AppName.lnk"
    $UninstKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\SpottiVoice"
    $ProtocolRoot = "HKCU:\Software\Classes\$Protocol"
}

$appMenuLnk = Join-Path $startMenuRoot "$AppName.lnk"
$uninstallLnk = Join-Path $startMenuRoot "Uninstall.lnk"
$uninstallPs1 = Join-Path $InstallDir "Uninstall.ps1"
$uninstallCmd = Join-Path $InstallDir "Uninstall.cmd"

$wsh = New-Object -ComObject WScript.Shell

function New-Shortcut {
    param(
        [string]$LinkPath,
        [string]$TargetPath,
        [string]$Arguments = "",
        [string]$IconLocation = ""
    )
    $parent = Split-Path -Parent $LinkPath
    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    if (Test-Path -LiteralPath $LinkPath) {
        Remove-Item -LiteralPath $LinkPath -Force
    }
    $sc = $wsh.CreateShortcut($LinkPath)
    $sc.TargetPath = $TargetPath
    if ($Arguments) { $sc.Arguments = $Arguments }
    if ($IconLocation) { $sc.IconLocation = $IconLocation }
    $sc.WorkingDirectory = $InstallDir
    $sc.Save()
}

$uninstallScript = @'
param([int]$AfterPid = 0)
$ErrorActionPreference = "Stop"
$AppName = "Spotti Voice"
$Protocol = "spotti-voice"
$InstallDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstallDir = $InstallDir.Trim().TrimEnd('\')

if ($AfterPid -gt 0) {
    while (Get-Process -Id $AfterPid -ErrorAction SilentlyContinue) {
        Start-Sleep -Milliseconds 200
    }
}

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    return $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$programFiles = [Environment]::GetFolderPath("ProgramFiles").TrimEnd('\')
$machineWide = (Test-IsAdmin) -and ($InstallDir.StartsWith($programFiles, [System.StringComparison]::OrdinalIgnoreCase))

if ($machineWide) {
    $UninstKey = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\SpottiVoice"
    $ProtocolRoot = "HKLM:\Software\Classes\$Protocol"
    $desktopLnk = Join-Path $env:Public "Desktop\$AppName.lnk"
    $startMenuRoot = Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs\Spotti Voice"
} else {
    $UninstKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\SpottiVoice"
    $ProtocolRoot = "HKCU:\Software\Classes\$Protocol"
    $desktopLnk = Join-Path ([Environment]::GetFolderPath("Desktop")) "$AppName.lnk"
    $startMenuRoot = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Spotti Voice"
}

function Stop-AppProcesses {
    foreach ($name in @("Spotti Voice.exe", "Spotti Voice Engine.exe")) {
        Get-Process -Name ($name -replace '\.exe$','') -ErrorAction SilentlyContinue |
            Stop-Process -Force -ErrorAction SilentlyContinue
    }
}

Stop-AppProcesses
Start-Sleep -Milliseconds 400

if (Test-Path -LiteralPath $desktopLnk) { Remove-Item -LiteralPath $desktopLnk -Force }
if (Test-Path -LiteralPath $startMenuRoot) {
    Remove-Item -LiteralPath $startMenuRoot -Recurse -Force
}
if (Test-Path -LiteralPath $ProtocolRoot) {
    Remove-Item -LiteralPath $ProtocolRoot -Recurse -Force
}
if (Test-Path -LiteralPath $InstallDir) {
    Remove-Item -LiteralPath $InstallDir -Recurse -Force
}
if (Test-Path -LiteralPath $UninstKey) {
    Remove-Item -LiteralPath $UninstKey -Force
}
'@

Set-Content -LiteralPath $uninstallPs1 -Encoding UTF8 -Value $uninstallScript

@(
    "@echo off",
    "call `"%~dp0launch-ui.cmd`" --uninstall",
    "exit /b %ERRORLEVEL%"
) | Set-Content -LiteralPath $uninstallCmd -Encoding ASCII

if ($wantStartMenu) {
    New-Item -ItemType Directory -Path $startMenuRoot -Force | Out-Null
    # Direct EXE launch avoids cmd dependency and console flash on locked-down PCs.
    New-Shortcut -LinkPath $appMenuLnk -TargetPath $AppExe -Arguments "`"$ElectronDir`"" -IconLocation "$AppExe,0"
    New-Shortcut -LinkPath $uninstallLnk -TargetPath $uninstallCmd -IconLocation "$AppExe,0"
}

if ($wantDesktop) {
    New-Shortcut -LinkPath $desktopLnk -TargetPath $AppExe -Arguments "`"$ElectronDir`"" -IconLocation "$AppExe,0"
}

New-Item -Path $ProtocolRoot -Force | Out-Null
Set-ItemProperty -LiteralPath $ProtocolRoot -Name "(default)" -Value "URL:Spotti Voice OAuth"
New-ItemProperty -LiteralPath $ProtocolRoot -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
New-Item -Path "$ProtocolRoot\DefaultIcon" -Force | Out-Null
Set-ItemProperty -LiteralPath "$ProtocolRoot\DefaultIcon" -Name "(default)" -Value "$AppExe,0"
New-Item -Path "$ProtocolRoot\shell\open\command" -Force | Out-Null
$cmd = "`"$AppExe`" `"$($InstallDir)\electron`" `"%1`""
Set-ItemProperty -LiteralPath "$ProtocolRoot\shell\open\command" -Name "(default)" -Value $cmd

New-Item -Path $UninstKey -Force | Out-Null
Set-ItemProperty -LiteralPath $UninstKey -Name "DisplayName" -Value $AppName
Set-ItemProperty -LiteralPath $UninstKey -Name "DisplayVersion" -Value $Version
Set-ItemProperty -LiteralPath $UninstKey -Name "Publisher" -Value $Publisher
Set-ItemProperty -LiteralPath $UninstKey -Name "InstallLocation" -Value $InstallDir
Set-ItemProperty -LiteralPath $UninstKey -Name "UninstallString" -Value "`"$uninstallCmd`""
New-ItemProperty -LiteralPath $UninstKey -Name "NoModify" -Value 1 -PropertyType DWord -Force | Out-Null
New-ItemProperty -LiteralPath $UninstKey -Name "NoRepair" -Value 1 -PropertyType DWord -Force | Out-Null

Write-Host "[OK] Finalized install: $InstallDir (machineWide=$machineWide)"

$whisperScript = Join-Path $InstallDir "scripts\fetch-whisper.ps1"
if (Test-Path -LiteralPath $whisperScript) {
    Write-Host "[OK] Installing whisper.cpp for local Russian STT..."
    Start-Process -FilePath "powershell.exe" -ArgumentList @(
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", $whisperScript
    ) -WindowStyle Hidden | Out-Null
}
