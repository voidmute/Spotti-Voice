param(
    [Parameter(Mandatory = $true)][string]$PayloadDir,
    [Parameter(Mandatory = $true)][string]$ZipOut
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $PayloadDir)) {
    Write-Error "Payload directory not found: $PayloadDir"
}

$zipDir = Split-Path -Parent $ZipOut
if ($zipDir -and -not (Test-Path -LiteralPath $zipDir)) {
    New-Item -ItemType Directory -Path $zipDir -Force | Out-Null
}

if (Test-Path -LiteralPath $ZipOut) {
    Remove-Item -LiteralPath $ZipOut -Force
}

$items = Get-ChildItem -LiteralPath $PayloadDir -Force
if ($items.Count -eq 0) {
    Write-Error "Payload directory is empty: $PayloadDir"
}

Compress-Archive -Path ($items | ForEach-Object { $_.FullName }) -DestinationPath $ZipOut -CompressionLevel Optimal -Force
Write-Host "[SPOTTI] payload.zip: $ZipOut"
