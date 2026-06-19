# manifest.json for Server-hosted Spotti Voice installer assets.
param(
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$OutFile,
    [string]$SetupRuntimeZip = "",
    [string]$PayloadZip = "",
    [string]$BaseUrl = "https://spottibot.duckdns.org/downloads/voice",
    [string]$VoicePillRoot = ""
)

$ErrorActionPreference = "Stop"

if (-not $VoicePillRoot) {
    $VoicePillRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

$distSetup = Join-Path $VoicePillRoot "dist-setup"
if (-not $SetupRuntimeZip) { $SetupRuntimeZip = Join-Path $distSetup "setup-runtime.zip" }
if (-not $PayloadZip) { $PayloadZip = Join-Path $distSetup "payload.zip" }

foreach ($path in @($SetupRuntimeZip, $PayloadZip)) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Missing release asset: $path"
    }
}

function Get-Sha256([string]$FilePath) {
    return (Get-FileHash -LiteralPath $FilePath -Algorithm SHA256).Hash.ToLower()
}

$versionUrl = "$BaseUrl/$Version"
$manifest = [ordered]@{
    version    = $Version
    baseUrl    = $versionUrl
    setupRuntime = [ordered]@{
        file   = "setup-runtime.zip"
        url    = "$versionUrl/setup-runtime.zip"
        sha256 = (Get-Sha256 $SetupRuntimeZip)
        bytes  = (Get-Item -LiteralPath $SetupRuntimeZip).Length
    }
    payload = [ordered]@{
        file   = "payload.zip"
        url    = "$versionUrl/payload.zip"
        sha256 = (Get-Sha256 $PayloadZip)
        bytes  = (Get-Item -LiteralPath $PayloadZip).Length
    }
}

$dir = Split-Path -Parent $OutFile
if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

$json = $manifest | ConvertTo-Json -Depth 4 -Compress
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($OutFile, $json, $utf8NoBom)
Write-Host "[SPOTTI] manifest.json: $OutFile"

# Bootstrap stub embedded in thin NSIS (manifest URL only).
$bootstrapManifest = [ordered]@{
    version     = $Version
    manifestUrl = "$versionUrl/manifest.json"
}
$bootstrapOut = Join-Path $distSetup "bootstrap-manifest.json"
[System.IO.File]::WriteAllText($bootstrapOut, ($bootstrapManifest | ConvertTo-Json -Compress), $utf8NoBom)
Write-Host "[SPOTTI] bootstrap-manifest.json: $bootstrapOut"
