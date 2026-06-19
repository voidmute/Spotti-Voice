# Update GitHub release notes from CHANGELOG sections.
# Usage: .\voice-pill\scripts\update-github-release-notes.ps1 [-Repo voidmute/Spotti-Voice]

param(
    [string]$Repo = "voidmute/Spotti-Voice",
    [string]$ChangelogPath = ""
)

$ErrorActionPreference = "Stop"

if (-not $ChangelogPath) {
    $monorepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    $ChangelogPath = Join-Path $monorepoRoot "scripts\migrate\spotti-voice-public\CHANGELOG.md"
}

if (-not (Test-Path -LiteralPath $ChangelogPath)) {
    Write-Error "Missing changelog: $ChangelogPath"
}

$raw = [System.IO.File]::ReadAllText($ChangelogPath, [System.Text.UTF8Encoding]::new($false))
$sections = [ordered]@{}

$matches = [regex]::Matches($raw, '(?ms)^## (v[\d.]+)\r?\n\r?\n(.*?)(?=^## v|\z)')
foreach ($m in $matches) {
    $ver = $m.Groups[1].Value.Trim()
    $body = $m.Groups[2].Value.Trim()
    $sections[$ver] = $body
}

if ($sections.Count -eq 0) {
    Write-Error "No version sections found in CHANGELOG"
}

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

foreach ($ver in $sections.Keys) {
    $notes = @(
        $sections[$ver],
        "",
        "**Files:** ``SpottiVoice-Setup.exe`` + ``SpottiVoice-Setup.sha256``",
        "",
        "[Full changelog](https://github.com/$Repo/blob/main/CHANGELOG.md)"
    ) -join "`n"

    $tmp = Join-Path $env:TEMP "spotti-release-$ver.md"
    [System.IO.File]::WriteAllText($tmp, $notes, $utf8NoBom)

    Write-Host "Updating $ver ..."
    gh release edit $ver --repo $Repo --notes-file $tmp
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Failed: $ver (release may not exist)"
    }
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
}

Write-Host "[OK] Updated $($sections.Count) release notes."
