# Silent thin bootstrap: fetch manifest + setup runtime from VPS, launch polished setup wizard.
param(
    [Parameter(Mandatory = $true)][string]$PluginDir
)

$ErrorActionPreference = "Stop"
$LogPath = Join-Path $env:TEMP "SpottiVoice-bootstrap.log"

function Write-Log([string]$Message) {
    $line = "[$(Get-Date -Format o)] $Message"
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
}

function Enable-Tls12 {
    try {
        [Net.ServicePointManager]::SecurityProtocol = `
            [Net.SecurityProtocolType]::Tls12 -bor `
            [Net.SecurityProtocolType]::Tls13
    } catch {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    }
}

function Show-FatalError([string]$Message) {
    Write-Log "FATAL: $Message"
    try {
        Add-Type -AssemblyName System.Windows.Forms
        [void][System.Windows.Forms.MessageBox]::Show(
            $Message,
            "Spotti Voice",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        )
    } catch {
        # Last resort if WinForms unavailable.
        Write-Host $Message
    }
}

function Get-Sha256([string]$FilePath) {
    return (Get-FileHash -LiteralPath $FilePath -Algorithm SHA256).Hash.ToLower()
}

function Download-FileRobust {
    param(
        [string]$Url,
        [string]$Dest,
        [string]$ExpectedSha256,
        [int]$MaxAttempts = 4
    )
    $parent = Split-Path -Parent $Dest
    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    $tmp = "$Dest.partial"

    $lastError = $null
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        try {
            $resumeAt = 0
            if (Test-Path -LiteralPath $tmp) {
                $resumeAt = (Get-Item -LiteralPath $tmp).Length
            }

            Write-Log "download attempt $attempt/$MaxAttempts $Url (resume=$resumeAt)"
            $request = [System.Net.HttpWebRequest]::Create($Url)
            $request.UserAgent = "SpottiVoice-Setup/1.0"
            $request.AllowAutoRedirect = $true
            $request.Timeout = 7200000
            $request.ReadWriteTimeout = 7200000
            $request.KeepAlive = $true
            if ($resumeAt -gt 0) {
                $request.AddRange($resumeAt)
            }
            $response = $request.GetResponse()
            try {
                $http = $response -as [System.Net.HttpWebResponse]
                $status = if ($http) { [int]$http.StatusCode } else { 200 }

                if ($resumeAt -gt 0 -and $status -ne 206) {
                    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
                    throw "range_not_supported"
                }

                $stream = $response.GetResponseStream()
                if ($resumeAt -gt 0 -and $status -eq 206) {
                    $fileStream = [System.IO.File]::Open($tmp, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::Write)
                    $fileStream.Seek($resumeAt, [System.IO.SeekOrigin]::Begin) | Out-Null
                } else {
                    if (Test-Path -LiteralPath $tmp) {
                        Remove-Item -LiteralPath $tmp -Force
                    }
                    $fileStream = [System.IO.File]::Create($tmp)
                }
                try {
                    $buffer = New-Object byte[] 1048576
                    $read = 0
                    while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                        $fileStream.Write($buffer, 0, $read)
                    }
                } finally {
                    $fileStream.Close()
                    $stream.Close()
                }
            } finally {
                $response.Close()
            }

            if ($ExpectedSha256) {
                $actual = Get-Sha256 $tmp
                if ($actual -ne $ExpectedSha256.ToLower()) {
                    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
                    throw "checksum_mismatch"
                }
            }

            if (Test-Path -LiteralPath $Dest) { Remove-Item -LiteralPath $Dest -Force }
            Move-Item -LiteralPath $tmp -Destination $Dest -Force
            Write-Log "download ok $Dest"
            return
        } catch {
            $lastError = $_
            Write-Log "download failed attempt $attempt : $($_.Exception.Message)"
            if ($_.Exception.Message -match "checksum_mismatch|range_not_supported") {
                if (Test-Path -LiteralPath $tmp) {
                    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
                }
            }
            if ($attempt -lt $MaxAttempts) {
                Start-Sleep -Seconds ([Math]::Min(8, $attempt * 2))
            }
        }
    }
    throw $lastError
}

function Fetch-Json([string]$Url) {
    Enable-Tls12
    $request = [System.Net.HttpWebRequest]::Create($Url)
    $request.UserAgent = "SpottiVoice-Setup/1.0"
    $request.AllowAutoRedirect = $true
    $request.Timeout = 120000
    $request.ReadWriteTimeout = 120000
    $response = $request.GetResponse()
    try {
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
        try {
            return $reader.ReadToEnd()
        } finally {
            $reader.Close()
        }
    } finally {
        $response.Close()
    }
}

function Copy-VcRuntime {
    param([string]$SourceDir, [string]$RuntimeDir)
    if (-not (Test-Path -LiteralPath $SourceDir)) { return }
    $names = @(
        "vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll",
        "msvcp140_1.dll", "msvcp140_2.dll", "concrt140.dll"
    )
    foreach ($name in $names) {
        $src = Join-Path $SourceDir $name
        if (Test-Path -LiteralPath $src) {
            Copy-Item -LiteralPath $src -Destination (Join-Path $RuntimeDir $name) -Force
        }
    }
}

function Write-SetupConfig {
    param(
        [string]$SetupUiDir,
        [string]$CacheRoot,
        [string]$Version,
        $Manifest
    )
    $defaultDir = Join-Path $env:LOCALAPPDATA "Spotti Voice"
    $lines = @(
        "payloadArchiveUrl=$($Manifest.payload.url)",
        "payloadArchiveSha256=$($Manifest.payload.sha256)",
        "payloadDir=$CacheRoot\payload",
        "stateFile=$CacheRoot\install-state.json",
        "defaultDir=$defaultDir",
        "version=$Version"
    )
    $configPath = Join-Path $SetupUiDir "setup-config.ini"
    Set-Content -LiteralPath $configPath -Value ($lines -join "`r`n") -Encoding ASCII
}

try {
    Enable-Tls12
    Write-Log "bootstrap start pluginDir=$PluginDir"

    $stubPath = Join-Path $PluginDir "bootstrap-manifest.json"
    if (-not (Test-Path -LiteralPath $stubPath)) {
        throw "bootstrap-manifest.json missing"
    }
    $stub = Get-Content -LiteralPath $stubPath -Raw | ConvertFrom-Json
    $manifestUrl = [string]$stub.manifestUrl
    if (-not $manifestUrl) { throw "manifestUrl missing" }

    Write-Log "fetch manifest $manifestUrl"
    $manifest = (Fetch-Json $manifestUrl) | ConvertFrom-Json
    $version = [string]$manifest.version
    if (-not $version) { throw "manifest version missing" }

    $cacheRoot = Join-Path $env:LOCALAPPDATA "SpottiVoice\installer-cache\$version"
    $setupUiDir = Join-Path $cacheRoot "setup-ui"
    $runtimeZip = Join-Path $cacheRoot "setup-runtime.zip"
    $runtimeDir = Join-Path $setupUiDir "runtime"
    $setupExe = Join-Path $runtimeDir "Spotti Voice Setup.exe"
    $fallbackExe = Join-Path $runtimeDir "electron.exe"

    New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null

    $needRuntime = -not (
        (Test-Path -LiteralPath $setupExe) -or
        (Test-Path -LiteralPath $fallbackExe)
    )
    if (-not $needRuntime) {
        $mainMjs = Join-Path $setupUiDir "main.mjs"
        if (-not (Test-Path -LiteralPath $mainMjs)) {
            $needRuntime = $true
        }
    }
    if (-not $needRuntime -and (Test-Path -LiteralPath $runtimeZip)) {
        $zipSha = Get-Sha256 $runtimeZip
        if ($zipSha -ne [string]$manifest.setupRuntime.sha256) {
            $needRuntime = $true
        }
    }

    if ($needRuntime) {
        Write-Log "download setup-runtime"
        Download-FileRobust `
            -Url ([string]$manifest.setupRuntime.url) `
            -Dest $runtimeZip `
            -ExpectedSha256 ([string]$manifest.setupRuntime.sha256)

        Write-Log "extract setup-runtime"
        if (Test-Path -LiteralPath $setupUiDir) {
            Remove-Item -LiteralPath $setupUiDir -Recurse -Force
        }
        New-Item -ItemType Directory -Path $setupUiDir -Force | Out-Null
        $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
        if ($tar) {
            Write-Log "extract via tar"
            & tar.exe -xf $runtimeZip -C $setupUiDir
            if ($LASTEXITCODE -ne 0) {
                throw "extract_failed"
            }
        } else {
            Expand-Archive -LiteralPath $runtimeZip -DestinationPath $setupUiDir -Force
        }
        $mainMjs = Join-Path $setupUiDir "main.mjs"
        if (-not (Test-Path -LiteralPath $mainMjs)) {
            throw "setup_runtime_invalid"
        }
    }

    Write-Log "stage vc runtime"
    Copy-VcRuntime -SourceDir (Join-Path $PluginDir "vc-runtime") -RuntimeDir $runtimeDir
    Write-SetupConfig -SetupUiDir $setupUiDir -CacheRoot $cacheRoot -Version $version -Manifest $manifest

    $launchExe = if (Test-Path -LiteralPath $setupExe) { $setupExe } else { $fallbackExe }
    if (-not (Test-Path -LiteralPath $launchExe)) {
        throw "setup runtime missing after extract"
    }

    Write-Log "launch setup wizard $launchExe"
    $proc = Start-Process `
        -FilePath $launchExe `
        -ArgumentList "`"$setupUiDir`"" `
        -WorkingDirectory $runtimeDir `
        -PassThru `
        -Wait
    exit $proc.ExitCode
} catch {
    $detail = $_.Exception.Message
    Write-Log "bootstrap error: $detail"
    $msg = if ($detail -match "checksum_mismatch") {
        "Downloaded setup files are corrupted. Please try again in a few minutes."
    } elseif ($detail -match "manifest|manifestUrl|missing") {
        "Installer configuration is invalid. Download SpottiVoice-Setup.exe again."
    } else {
        @(
            "Could not download Spotti Voice setup files from the server."
            "Check your internet connection and try again."
            ""
            "If the problem continues, your firewall or antivirus may be blocking the download."
        ) -join "`r`n"
    }
    Show-FatalError -Message $msg
    exit 1
}
