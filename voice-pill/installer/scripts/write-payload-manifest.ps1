param(
    [Parameter(Mandatory = $true)][string]$PayloadDir,
    [Parameter(Mandatory = $true)][string]$OutFile,
    [string]$Version = "0.1.0.0"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $PayloadDir)) {
    Write-Error "Payload directory not found: $PayloadDir"
}

$files = Get-ChildItem -LiteralPath $PayloadDir -Recurse -File -ErrorAction SilentlyContinue
$bytes = ($files | Measure-Object -Property Length -Sum).Sum
if ($null -eq $bytes) { $bytes = 0 }

$manifest = [ordered]@{
    version      = $Version
    fileCount    = @($files).Count
    payloadBytes = [int64]$bytes
}

$dir = Split-Path -Parent $OutFile
if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

$json = $manifest | ConvertTo-Json -Compress
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($OutFile, $json, $utf8NoBom)
Write-Host "[SPOTTI] payload-manifest.json: $($files.Count) files, $bytes bytes"
