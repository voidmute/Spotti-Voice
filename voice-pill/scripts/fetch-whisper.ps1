# Downloads whisper.cpp CLI + ggml-base.bin (Russian via -l ru) into %APPDATA%\SpottiVoice\whisper
$ErrorActionPreference = "Stop"

$WhisperVersion = "v1.8.1"
$Vendor = Join-Path $env:APPDATA "SpottiVoice\whisper"
New-Item -ItemType Directory -Force -Path $Vendor | Out-Null

$Cli = Join-Path $Vendor "whisper-cli.exe"
$Model = Join-Path $Vendor "ggml-base.bin"

if ((Test-Path -LiteralPath $Cli) -and (Test-Path -LiteralPath $Model)) {
    Write-Host "[Spotti Voice] whisper.cpp ready: $Vendor"
    exit 0
}

Write-Host "[Spotti Voice] Installing whisper.cpp $WhisperVersion (Russian local STT)..."

if (-not (Test-Path -LiteralPath $Cli)) {
    $ZipUrl = "https://github.com/ggml-org/whisper.cpp/releases/download/$WhisperVersion/whisper-bin-x64.zip"
    $TempZip = Join-Path $env:TEMP "spotti-whisper-bin-x64.zip"
    $TempDir = Join-Path $env:TEMP "spotti-whisper-extract"

    if (Test-Path $TempDir) { Remove-Item -LiteralPath $TempDir -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

    Write-Host "[Spotti Voice] Downloading CLI..."
    Invoke-WebRequest -Uri $ZipUrl -OutFile $TempZip -UseBasicParsing
    Expand-Archive -LiteralPath $TempZip -DestinationPath $TempDir -Force

    $Found = Get-ChildItem -Path $TempDir -Recurse -Filter "whisper-cli.exe" -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $Found) {
        throw "whisper-cli.exe not found in $ZipUrl"
    }

    $ReleaseDir = $Found.DirectoryName
    Get-ChildItem -LiteralPath $ReleaseDir -File | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $Vendor -Force
    }

    Remove-Item -LiteralPath $TempZip -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $TempDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "[Spotti Voice] CLI installed."
}

if (-not (Test-Path -LiteralPath $Model)) {
    $ModelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"
    Write-Host "[Spotti Voice] Downloading ggml-base.bin (~142 MB)..."
    Invoke-WebRequest -Uri $ModelUrl -OutFile $Model -UseBasicParsing
    Write-Host "[Spotti Voice] Model installed."
}

Write-Host "[Spotti Voice] whisper.cpp ready: $Vendor"
Write-Host "[Spotti Voice] Language: Russian (ru) only for local mode."
