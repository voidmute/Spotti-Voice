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
    "web\dist\index.html",
    "assets\app-icon.png"
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

$setupUiAbs = (Resolve-Path -LiteralPath $SetupUiDir).Path
$zipOutAbs = (Resolve-Path -LiteralPath $zipDir).Path + "\" + (Split-Path -Leaf $ZipOut)

Push-Location $setupUiAbs
try {
    & tar.exe -a -c -f $zipOutAbs .
    if ($LASTEXITCODE -ne 0) {
        throw "tar pack failed (exit $LASTEXITCODE)"
    }
} finally {
    Pop-Location
}

Write-Host "[SPOTTI] setup-runtime.zip: $ZipOut"
