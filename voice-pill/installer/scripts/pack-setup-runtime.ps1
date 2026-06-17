param(
    [Parameter(Mandatory = $true)][string]$SetupUiDir,
    [Parameter(Mandatory = $true)][string]$ZipOut
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $SetupUiDir)) {
    throw "setup-ui directory not found: $SetupUiDir"
}

$required = @(
    "main.mjs",
    "preload.mjs",
    "package.json",
    "payload-manifest.json",
    "runtime\electron.exe",
    "web\dist\index.html"
)
foreach ($rel in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $SetupUiDir $rel))) {
        throw "setup-ui missing: $rel"
    }
}

$zipDir = Split-Path -Parent $ZipOut
if ($zipDir -and -not (Test-Path -LiteralPath $zipDir)) {
    New-Item -ItemType Directory -Path $zipDir -Force | Out-Null
}
if (Test-Path -LiteralPath $ZipOut) {
    Remove-Item -LiteralPath $ZipOut -Force
}

$items = Get-ChildItem -LiteralPath $SetupUiDir -Force
Compress-Archive -Path ($items | ForEach-Object { $_.FullName }) -DestinationPath $ZipOut -CompressionLevel Optimal -Force
Write-Host "[SPOTTI] setup-runtime.zip: $ZipOut"
