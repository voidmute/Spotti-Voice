# Thin Spotti Voice bootstrap: fetch manifest + setup runtime from VPS, launch setup wizard.
param(
    [Parameter(Mandatory = $true)][string]$PluginDir
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Show-BootstrapProgress {
    param([string]$Title, [string]$Status, [int]$Percent)
    if (-not $script:BootstrapForm) {
        $script:BootstrapForm = New-Object System.Windows.Forms.Form
        $script:BootstrapForm.Text = "Spotti Voice"
        $script:BootstrapForm.Size = New-Object System.Drawing.Size(480, 160)
        $script:BootstrapForm.StartPosition = "CenterScreen"
        $script:BootstrapForm.FormBorderStyle = "FixedDialog"
        $script:BootstrapForm.MaximizeBox = $false
        $script:BootstrapForm.MinimizeBox = $false
        $script:BootstrapForm.TopMost = $true
        $script:BootstrapForm.BackColor = [System.Drawing.Color]::FromArgb(18, 18, 26)

        $script:BootstrapLabel = New-Object System.Windows.Forms.Label
        $script:BootstrapLabel.AutoSize = $false
        $script:BootstrapLabel.Size = New-Object System.Drawing.Size(440, 48)
        $script:BootstrapLabel.Location = New-Object System.Drawing.Point(20, 20)
        $script:BootstrapLabel.ForeColor = [System.Drawing.Color]::Gainsboro
        $script:BootstrapLabel.Font = New-Object System.Drawing.Font("Segoe UI", 10)
        $script:BootstrapForm.Controls.Add($script:BootstrapLabel)

        $script:BootstrapBar = New-Object System.Windows.Forms.ProgressBar
        $script:BootstrapBar.Size = New-Object System.Drawing.Size(440, 18)
        $script:BootstrapBar.Location = New-Object System.Drawing.Point(20, 80)
        $script:BootstrapBar.Style = "Continuous"
        $script:BootstrapForm.Controls.Add($script:BootstrapBar)

        $script:BootstrapForm.Add_Shown({ $script:BootstrapForm.Activate() })
        $script:BootstrapForm.Show()
    }
    $script:BootstrapLabel.Text = $Status
    $script:BootstrapForm.Text = $Title
    if ($Percent -ge 0) {
        $script:BootstrapBar.Value = [Math]::Min(100, [Math]::Max(0, $Percent))
    }
    [System.Windows.Forms.Application]::DoEvents()
}

function Close-BootstrapProgress {
    if ($script:BootstrapForm) {
        $script:BootstrapForm.Close()
        $script:BootstrapForm.Dispose()
        $script:BootstrapForm = $null
    }
}

function Show-BootstrapError {
    param([string]$Message)
    Close-BootstrapProgress
    [System.Windows.Forms.MessageBox]::Show(
        $Message,
        "Spotti Voice",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
}

function Get-Sha256([string]$FilePath) {
    $hash = Get-FileHash -LiteralPath $FilePath -Algorithm SHA256
    return $hash.Hash.ToLower()
}

function Download-File {
    param(
        [string]$Url,
        [string]$Dest,
        [string]$ExpectedSha256,
        [scriptblock]$OnProgress
    )
    $parent = Split-Path -Parent $Dest
    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    $tmp = "$Dest.download"
    if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force }

    $request = [System.Net.HttpWebRequest]::Create($Url)
    $request.UserAgent = "SpottiVoice-Setup"
    $request.AllowAutoRedirect = $true
    $response = $request.GetResponse()
    try {
        $total = [int64]$response.ContentLength
        $stream = $response.GetResponseStream()
        $fileStream = [System.IO.File]::Create($tmp)
        try {
            $buffer = New-Object byte[] 65536
            $read = 0
            $done = 0L
            while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                $fileStream.Write($buffer, 0, $read)
                $done += $read
                if ($total -gt 0 -and $OnProgress) {
                    $pct = [int][Math]::Min(100, [Math]::Round(($done * 100.0) / $total))
                    & $OnProgress $pct
                }
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
}

function Expand-Zip {
    param([string]$ZipPath, [string]$DestDir)
    if (Test-Path -LiteralPath $DestDir) {
        Remove-Item -LiteralPath $DestDir -Recurse -Force
    }
    Expand-Archive -LiteralPath $ZipPath -DestinationPath $DestDir -Force
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
        [hashtable]$Manifest
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
    Show-BootstrapProgress -Title "Spotti Voice" -Status "Подготовка установки…" -Percent 2

    $stubPath = Join-Path $PluginDir "bootstrap-manifest.json"
    if (-not (Test-Path -LiteralPath $stubPath)) {
        throw "bootstrap-manifest.json missing"
    }
    $stub = Get-Content -LiteralPath $stubPath -Raw | ConvertFrom-Json
    $manifestUrl = [string]$stub.manifestUrl
    if (-not $manifestUrl) { throw "manifestUrl missing" }

    Show-BootstrapProgress -Title "Spotti Voice" -Status "Получаем данные с сервера…" -Percent 8
    $manifestJson = (New-Object System.Net.WebClient).DownloadString($manifestUrl)
    $manifest = $manifestJson | ConvertFrom-Json
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
    if (-not $needRuntime -and (Test-Path -LiteralPath $runtimeZip)) {
        $zipSha = Get-Sha256 $runtimeZip
        if ($zipSha -ne [string]$manifest.setupRuntime.sha256) {
            $needRuntime = $true
        }
    }

    if ($needRuntime) {
        Show-BootstrapProgress -Title "Spotti Voice" -Status "Загружаем мастер установки…" -Percent 12
        Download-File `
            -Url ([string]$manifest.setupRuntime.url) `
            -Dest $runtimeZip `
            -ExpectedSha256 ([string]$manifest.setupRuntime.sha256) `
            -OnProgress {
                param($pct)
                $mapped = 12 + [int]($pct * 0.55)
                Show-BootstrapProgress -Title "Spotti Voice" -Status "Загружаем мастер установки… $pct%" -Percent $mapped
            }

        Show-BootstrapProgress -Title "Spotti Voice" -Status "Распаковываем мастер установки…" -Percent 72
        if (Test-Path -LiteralPath $setupUiDir) {
            Remove-Item -LiteralPath $setupUiDir -Recurse -Force
        }
        New-Item -ItemType Directory -Path $setupUiDir -Force | Out-Null
        Expand-Zip -ZipPath $runtimeZip -DestDir $setupUiDir
    }

    Show-BootstrapProgress -Title "Spotti Voice" -Status "Устанавливаем зависимости…" -Percent 82
    Copy-VcRuntime -SourceDir (Join-Path $PluginDir "vc-runtime") -RuntimeDir $runtimeDir

    Write-SetupConfig -SetupUiDir $setupUiDir -CacheRoot $cacheRoot -Version $version -Manifest $manifest

    $launchExe = if (Test-Path -LiteralPath $setupExe) { $setupExe } else { $fallbackExe }
    if (-not (Test-Path -LiteralPath $launchExe)) {
        throw "setup runtime missing after extract"
    }

    Show-BootstrapProgress -Title "Spotti Voice" -Status "Запуск мастера установки…" -Percent 95
    Close-BootstrapProgress

    $proc = Start-Process -FilePath $launchExe -ArgumentList "`"$setupUiDir`"" -PassThru -Wait
    exit $proc.ExitCode
} catch {
    $msg = switch -Regex ($_.Exception.Message) {
        "checksum_mismatch" { "Файл с сервера повреждён. Повторите позже или скачайте установщик заново." }
        default { "Не удалось подготовить установку. Проверьте интернет и повторите.`n`n$($_.Exception.Message)" }
    }
    Show-BootstrapError -Message $msg
    exit 1
}
