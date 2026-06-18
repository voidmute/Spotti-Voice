# Downloads whisper.cpp CLI + ggml-base.bin (Russian via -l ru) into %APPDATA%\SpottiVoice\whisper
$ErrorActionPreference = "Stop"

$WhisperVersion = "v1.8.1"
$SpottiRoot = Join-Path $env:APPDATA "SpottiVoice"
$Vendor = Join-Path $SpottiRoot "whisper"
$StatusFile = Join-Path $SpottiRoot "whisper-install-status.json"
New-Item -ItemType Directory -Force -Path $Vendor | Out-Null

function Set-InstallStatus {
    param(
        [string]$Phase,
        [int]$Percent,
        [string]$Message
    )
    if (-not (Test-Path -LiteralPath $SpottiRoot)) {
        New-Item -ItemType Directory -Force -Path $SpottiRoot | Out-Null
    }
    @{
        phase     = $Phase
        percent   = $Percent
        message   = $Message
        updatedAt = (Get-Date).ToUniversalTime().ToString("o")
    } | ConvertTo-Json -Compress | Set-Content -LiteralPath $StatusFile -Encoding UTF8
}

$Cli = Join-Path $Vendor "whisper-cli.exe"
$Model = Join-Path $Vendor "ggml-base.bin"

if ((Test-Path -LiteralPath $Cli) -and (Test-Path -LiteralPath $Model)) {
    Set-InstallStatus -Phase "ready" -Percent 100 -Message "whisper.cpp готов"
    Write-Host "[Spotti Voice] whisper.cpp ready: $Vendor"
    exit 0
}

Set-InstallStatus -Phase "installing" -Percent 5 -Message "Скачивание whisper.cpp…"
Write-Host "[Spotti Voice] Installing whisper.cpp $WhisperVersion (Russian local STT)..."

if (-not (Test-Path -LiteralPath $Cli)) {
    $ZipUrl = "https://github.com/ggml-org/whisper.cpp/releases/download/$WhisperVersion/whisper-bin-x64.zip"
    $TempZip = Join-Path $env:TEMP "spotti-whisper-bin-x64.zip"
    $TempDir = Join-Path $env:TEMP "spotti-whisper-extract"

    if (Test-Path $TempDir) { Remove-Item -LiteralPath $TempDir -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

    Set-InstallStatus -Phase "downloading_cli" -Percent 18 -Message "Скачивание whisper.cpp (CLI)…"
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
    Set-InstallStatus -Phase "downloading_model" -Percent 48 -Message "CLI установлен. Скачивание модели…"
    Write-Host "[Spotti Voice] CLI installed."
}

if (-not (Test-Path -LiteralPath $Model)) {
    $ModelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"
    Set-InstallStatus -Phase "downloading_model" -Percent 58 -Message "Скачивание модели ggml-base (~142 МБ)…"
    Write-Host "[Spotti Voice] Downloading ggml-base.bin (~142 MB)..."
    Invoke-WebRequest -Uri $ModelUrl -OutFile $Model -UseBasicParsing
    Write-Host "[Spotti Voice] Model installed."
}

Set-InstallStatus -Phase "ready" -Percent 100 -Message "whisper.cpp готов"
Write-Host "[Spotti Voice] whisper.cpp ready: $Vendor"
Write-Host "[Spotti Voice] Language: Russian (ru) only for local mode."
