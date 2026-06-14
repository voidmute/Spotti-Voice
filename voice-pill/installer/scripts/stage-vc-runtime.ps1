# Copy bundled MSVC runtime DLLs into app folders (app-local deployment).
# No vc_redist /install, no extract, no reboot — ever.

param(
    [Parameter(Mandatory = $true)]
    [string] $TargetList
)

$ErrorActionPreference = "Stop"

$Targets = $TargetList -split ";" | ForEach-Object { $_.Trim() } | Where-Object { $_ }

$DllNames = @(
    "vcruntime140.dll",
    "vcruntime140_1.dll",
    "msvcp140.dll",
    "msvcp140_1.dll",
    "msvcp140_2.dll",
    "concrt140.dll"
)

$Bundled = Join-Path $PSScriptRoot "..\prereqs\vc-runtime-x64"

function Find-VsRedistDir {
    $roots = @(
        "${env:ProgramFiles}\Microsoft Visual Studio\2022",
        "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022"
    )
    foreach ($root in $roots) {
        if (-not (Test-Path $root)) { continue }
        $crtDirs = Get-ChildItem -Path $root -Directory -ErrorAction SilentlyContinue |
            ForEach-Object {
                Get-ChildItem -Path (Join-Path $_.FullName "VC\Redist\MSVC") -Directory -ErrorAction SilentlyContinue |
                    ForEach-Object {
                        Join-Path $_.FullName "x64\Microsoft.VC143.CRT"
                        Join-Path $_.FullName "x64\Microsoft.VC142.CRT"
                    }
            } |
            Where-Object { $_ -and (Test-Path (Join-Path $_ "vcruntime140.dll")) }
        if ($crtDirs) {
            return ($crtDirs | Select-Object -First 1)
        }
    }
    return $null
}

if (Test-Path (Join-Path $Bundled "vcruntime140.dll")) {
    $src = (Resolve-Path $Bundled).Path
    Write-Host "[SPOTTI] Using bundled VC runtime: $src"
} else {
    $src = Find-VsRedistDir
    if ($src) {
        Write-Host "[SPOTTI] Using VS redist folder: $src"
    } else {
        throw "Missing installer/prereqs/vc-runtime-x64 DLLs. See prereqs/README.md"
    }
}

function Copy-DllSet {
    param([string] $Dest)
    if (-not $Dest) { return }
    New-Item -ItemType Directory -Force -Path $Dest | Out-Null
    $copied = 0
    foreach ($name in $DllNames) {
        $from = Join-Path $src $name
        if (Test-Path $from) {
            Copy-Item -Path $from -Destination (Join-Path $Dest $name) -Force
            $copied++
        }
    }
    if ($copied -eq 0) {
        throw "No VC runtime DLLs copied to $Dest"
    }
    Write-Host "[SPOTTI] VC runtime ($copied files) -> $Dest"
}

foreach ($target in $Targets) {
    $resolved = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($target)
    Copy-DllSet -Dest $resolved

    $electronDist = Join-Path $resolved "electron\node_modules\electron\dist"
    if (Test-Path $electronDist) {
        Copy-DllSet -Dest $electronDist
    }
}
