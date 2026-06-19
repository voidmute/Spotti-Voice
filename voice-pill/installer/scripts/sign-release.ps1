# Optional Authenticode signing — set SPOTTI_CODESIGN_PFX + SPOTTI_CODESIGN_PASSWORD in your environment.
param(
    [Parameter(Mandatory = $true)][string[]]$Files
)

$ErrorActionPreference = "Stop"
$pfx = $env:SPOTTI_CODESIGN_PFX
$pass = $env:SPOTTI_CODESIGN_PASSWORD

if (-not $pfx) {
    Write-Host "[SPOTTI] Skip code signing (SPOTTI_CODESIGN_PFX not set)."
    exit 0
}
if (-not (Test-Path -LiteralPath $pfx)) {
    throw "Code signing PFX not found: $pfx"
}

$signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
if (-not $signtool) {
    $sdk = "${env:ProgramFiles(x86)}\Windows Kits\10\bin"
    if (Test-Path -LiteralPath $sdk) {
        $latest = Get-ChildItem -LiteralPath $sdk -Directory | Sort-Object Name -Descending | Select-Object -First 1
        $candidate = Join-Path $latest.FullName "x64\signtool.exe"
        if (Test-Path -LiteralPath $candidate) { $signtool = Get-Item -LiteralPath $candidate }
    }
}
if (-not $signtool) {
    throw "signtool.exe not found. Install Windows SDK or add signtool to PATH."
}

$args = @(
    "sign",
    "/fd", "SHA256",
    "/f", $pfx,
    "/tr", "http://timestamp.digicert.com",
    "/td", "SHA256"
)
if ($pass) { $args += @("/p", $pass) }
$args += $Files

Write-Host "[SPOTTI] Signing $($Files.Count) file(s)..."
& $signtool.Source @args
if ($LASTEXITCODE -ne 0) {
    throw "signtool failed (exit $LASTEXITCODE)"
}
Write-Host "[OK] Code signing complete."
