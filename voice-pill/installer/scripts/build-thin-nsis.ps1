# Build thin SpottiVoice-Setup.exe (Server-hosted assets, local stub under 20 MB).
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
    try {
        Remove-Item -LiteralPath $OutFile -Force -ErrorAction Stop
    } catch {
        $fallback = Join-Path $outDir "SpottiVoice-Setup-$Version.exe"
        Write-Warning "Cannot overwrite locked $OutFile; building $fallback"
        $OutFile = $fallback
    }
}

$outFileRel = "..\..\dist-setup\" + (Split-Path -Leaf $OutFile)

Write-Host "[SPOTTI] Compiling thin NSIS installer..."
& $makensis "/DAPP_VERSION=$Version" "/DOUTFILE_REL=$outFileRel" $nsisScript
if ($LASTEXITCODE -ne 0) {
    throw "makensis failed (exit $LASTEXITCODE)"
}
if (-not (Test-Path -LiteralPath $OutFile)) {
    throw "NSIS did not produce $OutFile"
}

# Do NOT rcedit the NSIS output — it breaks NSIS embedded integrity CRC.
# UAC + icon come from SpottiVoiceThin.nsi (RequestExecutionLevel admin, Icon).

$sizeMb = (Get-Item -LiteralPath $OutFile).Length / 1MB
if ($sizeMb -gt $MaxSizeMb) {
    throw "Thin installer is $([math]::Round($sizeMb, 1)) MB (max $MaxSizeMb MB). Remove bundled assets from NSIS."
}
Write-Host "[OK] thin installer: $OutFile ($([math]::Round($sizeMb, 1)) MB, Server-hosted assets)"
