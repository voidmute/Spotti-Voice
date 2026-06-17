# Build single-file SpottiVoice-Setup.exe (NSIS wraps setup UI + payload.zip).
param(
    [Parameter(Mandatory = $true)][string]$StagingDir,
    [Parameter(Mandatory = $true)][string]$OutFile,
    [Parameter(Mandatory = $true)][string]$Version,
    [string]$VoicePillRoot = ""
)

$ErrorActionPreference = "Stop"

if (-not $VoicePillRoot) {
    $VoicePillRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

$setupUi = Join-Path $StagingDir "setup-ui"
$runtimeDir = Join-Path $setupUi "runtime"
$payloadZip = Join-Path $StagingDir "payload.zip"
$bootstrapDir = Join-Path (Split-Path -Parent $PSScriptRoot) "bootstrap"
$asarCli = Join-Path $VoicePillRoot "installer\electron\node_modules\@electron\asar\bin\asar.mjs"
$nsisScript = Join-Path $VoicePillRoot "installer\nsis\SpottiVoice.nsi"
$makensis = Join-Path $VoicePillRoot "tools\nsis\nsis-3.12\makensis.exe"
if (-not (Test-Path -LiteralPath $makensis)) {
    $makensisCmd = Get-Command makensis -ErrorAction SilentlyContinue
    if ($makensisCmd) {
        $makensis = $makensisCmd.Source
    }
}

foreach ($path in @($setupUi, $runtimeDir, $payloadZip, $bootstrapDir, $nsisScript)) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Missing build input: $path"
    }
}
if (-not (Test-Path -LiteralPath $asarCli)) {
    throw "Missing @electron/asar - run npm install in installer\electron"
}
if (-not (Test-Path -LiteralPath $makensis)) {
    throw "Missing makensis.exe — install NSIS 3.x or use monorepo voice-pill\tools\nsis"
}

$resourcesDir = Join-Path $runtimeDir "resources"
New-Item -ItemType Directory -Path $resourcesDir -Force | Out-Null
$defaultAppAsar = Join-Path $resourcesDir "default_app.asar"
if (Test-Path -LiteralPath $defaultAppAsar) {
    Remove-Item -LiteralPath $defaultAppAsar -Force
}
Write-Host "[SPOTTI] Packing setup bootstrap default_app.asar..."
& node $asarCli pack $bootstrapDir $defaultAppAsar
if ($LASTEXITCODE -ne 0) {
    throw "asar pack failed for setup bootstrap (exit $LASTEXITCODE)"
}

$outDir = Split-Path -Parent $OutFile
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

# Remove stale portable-layout siblings from prior builds.
if (Test-Path -LiteralPath $outDir) {
    Get-ChildItem -LiteralPath $outDir -Force | Where-Object {
        $_.Name -ne ".gitignore" -and $_.Name -ne (Split-Path -Leaf $OutFile)
    } | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if (Test-Path -LiteralPath $OutFile) {
    Remove-Item -LiteralPath $OutFile -Force
}

Write-Host "[SPOTTI] Compiling NSIS installer (single .exe)..."
$nsisDir = Split-Path -Parent $nsisScript
& $makensis "/DAPP_VERSION=$Version" $nsisScript
if ($LASTEXITCODE -ne 0) {
    throw "makensis failed (exit $LASTEXITCODE)"
}

if (-not (Test-Path -LiteralPath $OutFile)) {
    throw "NSIS did not produce $OutFile"
}

$bytes = [System.IO.File]::ReadAllBytes($OutFile)
$peOffset = [BitConverter]::ToInt32($bytes, 0x3C)
$machine = [BitConverter]::ToUInt16($bytes, $peOffset + 4)
# NSIS outer stub is x86 (0x014C); bundled Electron runtime inside is x64.
if ($machine -ne 0x014C -and $machine -ne 0x8664) {
    throw "Unexpected PE machine type 0x$($machine.ToString('X4'))."
}
$archLabel = if ($machine -eq 0x8664) { "x64" } else { "NSIS x86 stub (unpacks x64 Electron)" }

$sizeMb = [math]::Round((Get-Item -LiteralPath $OutFile).Length / 1MB, 1)
Write-Host "[OK] single-file installer: $OutFile ($sizeMb MB, $archLabel)"
