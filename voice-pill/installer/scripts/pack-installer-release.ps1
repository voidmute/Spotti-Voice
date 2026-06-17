# Pack portable SpottiVoice-Setup folder into a release ZIP (+ SHA256 sidecars).
param(
    [string]$SourceDir = "dist-setup",
    [string]$OutZip = "",
    [Parameter(Mandatory = $true)][string]$Version,
    [string]$VoicePillRoot = ""
)

$ErrorActionPreference = "Stop"

if (-not $VoicePillRoot) {
    $VoicePillRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

$sourcePath = if ([System.IO.Path]::IsPathRooted($SourceDir)) {
    $SourceDir
} else {
    Join-Path $VoicePillRoot $SourceDir
}

if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Source directory not found: $sourcePath"
}

$setupExe = Join-Path $sourcePath "SpottiVoice-Setup.exe"
if (-not (Test-Path -LiteralPath $setupExe)) {
    throw "Missing SpottiVoice-Setup.exe in $sourcePath"
}

if (-not $OutZip) {
    $OutZip = Join-Path $sourcePath "SpottiVoice-Setup-$Version.zip"
} elseif (-not [System.IO.Path]::IsPathRooted($OutZip)) {
    $OutZip = Join-Path $VoicePillRoot $OutZip
}

$zipDir = Split-Path -Parent $OutZip
if ($zipDir -and -not (Test-Path -LiteralPath $zipDir)) {
    New-Item -ItemType Directory -Path $zipDir -Force | Out-Null
}

$excludeNames = @(
    ".user-data",
    "payload",
    "install-state.json",
    "install-dir.txt",
    "install-flags.json",
    "desktop-shortcut.flag",
    ".gitignore",
    "_installer-bundle"
)

$zipBaseName = [System.IO.Path]::GetFileName($OutZip)
$items = Get-ChildItem -LiteralPath $sourcePath -Force | Where-Object {
    if ($excludeNames -contains $_.Name) { return $false }
    if ($_.Name -like "SpottiVoice-Setup-*.zip") { return $false }
    if ($_.Name -eq "SpottiVoice-Setup.sha256") { return $false }
    if ($_.Name -eq "SpottiVoice-Setup.zip.sha256") { return $false }
    return $true
}

if ($items.Count -eq 0) {
    throw "No release files to pack in $sourcePath"
}

if (Test-Path -LiteralPath $OutZip) {
    Remove-Item -LiteralPath $OutZip -Force
}

Write-Host "[SPOTTI] Packing release ZIP ($($items.Count) top-level items)..."
Compress-Archive -Path ($items | ForEach-Object { $_.FullName }) -DestinationPath $OutZip -CompressionLevel Optimal -Force

function Write-HashFile {
    param(
        [string]$FilePath,
        [string]$OutPath,
        [string]$LabelName
    )
    $hash = (Get-FileHash -LiteralPath $FilePath -Algorithm SHA256).Hash
    $line = "$hash  $LabelName"
    Set-Content -LiteralPath $OutPath -Value $line -Encoding ascii -NoNewline
    Add-Content -LiteralPath $OutPath -Value "" -Encoding ascii
}

$exeHashPath = Join-Path $sourcePath "SpottiVoice-Setup.sha256"
$zipHashPath = Join-Path $sourcePath "SpottiVoice-Setup.zip.sha256"
Write-HashFile -FilePath $setupExe -OutPath $exeHashPath -LabelName "SpottiVoice-Setup.exe"
Write-HashFile -FilePath $OutZip -OutPath $zipHashPath -LabelName $zipBaseName

Write-Host "[OK] portable folder: $sourcePath"
Write-Host "[OK] release ZIP: $OutZip"
Write-Host "[OK] SHA256: $exeHashPath"
Write-Host "[OK] SHA256: $zipHashPath"
