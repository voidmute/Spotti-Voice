# Build x64 SpottiVoice-Setup.exe (portable Electron installer — no 32-bit NSIS/SFX wrapper).
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
$payloadZip = Join-Path $StagingDir "payload.zip"
$runtimeDir = Join-Path $setupUi "runtime"
$brandScript = Join-Path $VoicePillRoot "scripts\brand-electron-shell.mjs"
$bootstrapDir = Join-Path (Split-Path -Parent $PSScriptRoot) "bootstrap"
$asarCli = Join-Path $VoicePillRoot "installer\electron\node_modules\@electron\asar\bin\asar.mjs"

if (-not (Test-Path -LiteralPath $setupUi)) {
    throw "Missing staged setup-ui: $setupUi"
}
if (-not (Test-Path -LiteralPath $payloadZip)) {
    throw "Missing staged payload.zip: $payloadZip"
}
if (-not (Test-Path -LiteralPath $runtimeDir)) {
    throw "Missing setup Electron runtime: $runtimeDir"
}

$outDir = Split-Path -Parent $OutFile
$bundleDir = Join-Path $outDir "_installer-bundle"
if (Test-Path -LiteralPath $bundleDir) {
    Remove-Item -LiteralPath $bundleDir -Recurse -Force
}
New-Item -ItemType Directory -Path $bundleDir -Force | Out-Null

Write-Host "[SPOTTI] Staging x64 portable installer bundle..."
robocopy $runtimeDir $bundleDir /E /COPY:DAT /R:2 /W:1 /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) {
    throw "Failed to copy Electron runtime into installer bundle."
}

$appFiles = @("main.mjs", "preload.mjs", "package.json", "payload-manifest.json")
foreach ($name in $appFiles) {
    $src = Join-Path $setupUi $name
    if (Test-Path -LiteralPath $src) {
        Copy-Item -LiteralPath $src -Destination (Join-Path $bundleDir $name) -Force
    }
}
if (Test-Path -LiteralPath (Join-Path $setupUi "package-lock.json")) {
    Copy-Item -LiteralPath (Join-Path $setupUi "package-lock.json") -Destination (Join-Path $bundleDir "package-lock.json") -Force
}
Copy-Item -LiteralPath (Join-Path $setupUi "web") -Destination (Join-Path $bundleDir "web") -Recurse -Force
Copy-Item -LiteralPath $payloadZip -Destination (Join-Path $bundleDir "payload.zip") -Force

$assetsDir = Join-Path $bundleDir "assets"
New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null
foreach ($assetName in @("app-icon.png", "app-icon.ico")) {
    $assetSrc = Join-Path $VoicePillRoot "assets\$assetName"
    if (Test-Path -LiteralPath $assetSrc) {
        Copy-Item -LiteralPath $assetSrc -Destination (Join-Path $assetsDir $assetName) -Force
    }
}

$scriptsDir = Join-Path $bundleDir "scripts"
New-Item -ItemType Directory -Path $scriptsDir -Force | Out-Null
$finalizeSrc = Join-Path (Split-Path -Parent $PSScriptRoot) "scripts\finalize-install.ps1"
if (-not (Test-Path -LiteralPath $finalizeSrc)) {
    throw "Missing finalize-install.ps1"
}
Copy-Item -LiteralPath $finalizeSrc -Destination (Join-Path $scriptsDir "finalize-install.ps1") -Force

$resourcesDir = Join-Path $bundleDir "resources"
New-Item -ItemType Directory -Path $resourcesDir -Force | Out-Null
if (-not (Test-Path -LiteralPath $bootstrapDir)) {
    throw "Missing installer bootstrap: $bootstrapDir"
}
if (-not (Test-Path -LiteralPath $asarCli)) {
    throw "Missing @electron/asar - run npm install in installer\electron"
}
$defaultAppAsar = Join-Path $resourcesDir "default_app.asar"
if (Test-Path -LiteralPath $defaultAppAsar) {
    Remove-Item -LiteralPath $defaultAppAsar -Force
}
Write-Host "[SPOTTI] Packing setup bootstrap default_app.asar..."
& node $asarCli pack $bootstrapDir $defaultAppAsar
if ($LASTEXITCODE -ne 0) {
    throw "asar pack failed for setup bootstrap (exit $LASTEXITCODE)"
}

$electronSrc = Join-Path $bundleDir "electron.exe"
if (-not (Test-Path -LiteralPath $electronSrc)) {
    throw "electron.exe missing in bundle runtime."
}

$brandedSetup = Join-Path $bundleDir "Spotti Voice Setup.exe"
if (Test-Path -LiteralPath $brandedSetup) {
    Remove-Item -LiteralPath $brandedSetup -Force
}

Write-Host "[SPOTTI] Branding x64 SpottiVoice-Setup.exe..."
$brandedTemp = "$OutFile.new"
if (Test-Path -LiteralPath $brandedTemp) {
    Remove-Item -LiteralPath $brandedTemp -Force
}
& node $brandScript $electronSrc $brandedTemp "Spotti Voice Setup" "SpottiVoice-Setup.exe"
if ($LASTEXITCODE -ne 0) {
    throw "brand-electron-shell.mjs failed (exit $LASTEXITCODE)"
}
if (Test-Path -LiteralPath $OutFile) {
    Remove-Item -LiteralPath $OutFile -Force
}
Move-Item -LiteralPath $brandedTemp -Destination $OutFile -Force

Write-Host "[SPOTTI] Branding fallback electron.exe in bundle..."
& node $brandScript $electronSrc $electronSrc "Spotti Voice Setup" "electron.exe"
if ($LASTEXITCODE -ne 0) {
    throw "brand-electron-shell.mjs failed for bundle electron.exe (exit $LASTEXITCODE)"
}

# Copy support files beside SpottiVoice-Setup.exe (user double-clicks the x64 exe).
$outBundleDir = $outDir
foreach ($item in Get-ChildItem -LiteralPath $bundleDir) {
    if ($item.Name -ieq "electron.exe") { continue }
    if ($item.Name -ieq "Spotti Voice Setup.exe") { continue }
    $dest = Join-Path $outBundleDir $item.Name
    if ($item.PSIsContainer) {
        if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
        Copy-Item -LiteralPath $item.FullName -Destination $dest -Recurse -Force
    } else {
        Copy-Item -LiteralPath $item.FullName -Destination $dest -Force
    }
}

Remove-Item -LiteralPath $bundleDir -Recurse -Force

foreach ($staleName in @("electron.exe", "Spotti Voice Setup.exe")) {
    $stalePath = Join-Path $outBundleDir $staleName
    if (Test-Path -LiteralPath $stalePath) {
        Remove-Item -LiteralPath $stalePath -Force
        Write-Host "[SPOTTI] Removed stale $staleName from installer folder."
    }
}

$stalePayload = Join-Path $outBundleDir "payload"
if (Test-Path -LiteralPath $stalePayload) {
    Remove-Item -LiteralPath $stalePayload -Recurse -Force
    Write-Host "[SPOTTI] Removed stale extracted payload folder (re-extracts from payload.zip on install)."
}

# Verify PE machine type (0x8664 = AMD64)
$bytes = [System.IO.File]::ReadAllBytes($OutFile)
$peOffset = [BitConverter]::ToInt32($bytes, 0x3C)
$machine = [BitConverter]::ToUInt16($bytes, $peOffset + 4)
if ($machine -ne 0x8664) {
    throw "PE machine type 0x$($machine.ToString('X4')) - expected 0x8664 (x64). Installer is not 64-bit."
}
Write-Host "[OK] x64 installer: $OutFile (PE machine 0x8664)"
