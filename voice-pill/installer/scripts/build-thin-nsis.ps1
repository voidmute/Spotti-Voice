# Build thin SpottiVoice-Setup.exe (VPS-hosted assets, local stub under 20 MB).
param(
    [Parameter(Mandatory = $true)][string]$OutFile,
    [Parameter(Mandatory = $true)][string]$Version,
    [int]$MaxSizeMb = 20,
    [string]$VoicePillRoot = ""
)

$ErrorActionPreference = "Stop"

if (-not $VoicePillRoot) {
    $VoicePillRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

$bootstrapManifest = Join-Path $VoicePillRoot "dist-setup\bootstrap-manifest.json"
$nsisScript = Join-Path $VoicePillRoot "installer\nsis\SpottiVoiceThin.nsi"
$makensis = Join-Path $VoicePillRoot "tools\nsis\nsis-3.12\makensis.exe"

foreach ($path in @($bootstrapManifest, $nsisScript)) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Missing build input: $path"
    }
}
if (-not (Test-Path -LiteralPath $makensis)) {
    $makensisCmd = Get-Command makensis -ErrorAction SilentlyContinue
    if ($makensisCmd) { $makensis = $makensisCmd.Source }
}
if (-not (Test-Path -LiteralPath $makensis)) {
    throw "Missing makensis.exe"
}

$outDir = Split-Path -Parent $OutFile
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
if (Test-Path -LiteralPath $OutFile) {
    Remove-Item -LiteralPath $OutFile -Force
}

Write-Host "[SPOTTI] Compiling thin NSIS installer..."
& $makensis "/DAPP_VERSION=$Version" $nsisScript
if ($LASTEXITCODE -ne 0) {
    throw "makensis failed (exit $LASTEXITCODE)"
}
if (-not (Test-Path -LiteralPath $OutFile)) {
    throw "NSIS did not produce $OutFile"
}

$brandScript = Join-Path $VoicePillRoot "scripts\brand-electron-shell.mjs"
if (Test-Path -LiteralPath $brandScript) {
    Write-Host "[SPOTTI] Applying UAC admin manifest + icon to thin installer..."
    & node $brandScript $OutFile $OutFile "Spotti Voice Setup" "SpottiVoice-Setup.exe" admin
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to brand thin installer with admin manifest"
    }
}

$sizeMb = (Get-Item -LiteralPath $OutFile).Length / 1MB
if ($sizeMb -gt $MaxSizeMb) {
    throw "Thin installer is $([math]::Round($sizeMb, 1)) MB (max $MaxSizeMb MB). Remove bundled assets from NSIS."
}
Write-Host "[OK] thin installer: $OutFile ($([math]::Round($sizeMb, 1)) MB, VPS-hosted assets)"
