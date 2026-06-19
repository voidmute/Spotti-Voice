# Update GitHub release notes from CHANGELOG sections.
# Usage: .\voice-pill\scripts\update-github-release-notes.ps1 [-Repo voidmute/Spotti-Voice] [-LatestVersion v0.1.0.19]

param(
    [string]$Repo = "voidmute/Spotti-Voice",
    [string]$LatestVersion = "v0.1.0.19",
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

$pattern = '(?ms)^## (v[\d.]+)[^\r\n]*\r?\n(.*?)(?=^---|\z)'
$rxMatches = [regex]::Matches($raw, $pattern)
foreach ($m in $rxMatches) {
    $ver = $m.Groups[1].Value.Trim()
    $block = $m.Groups[2].Value
    $bullets = [regex]::Matches($block, '(?m)^- .+$') | ForEach-Object { $_.Value.Trim() }
    if ($bullets.Count -eq 0) { continue }
    $sections[$ver] = ($bullets -join "`n")
}

if ($sections.Count -eq 0) {
    Write-Error "No version sections found in CHANGELOG"
}

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$latestUrl = "https://github.com/$Repo/releases/tag/$LatestVersion"
$changelogUrl = "https://github.com/$Repo/blob/main/CHANGELOG.md"

function Format-ReleaseNotes {
    param([string]$Version, [string]$Body, [bool]$IsLatest)

    if ($IsLatest) {
        $badge = "![Current](https://img.shields.io/badge/status-current-22c55e?style=flat-square)"
        $banner = "**Recommended download** - latest stable installer."
    } else {
        $badge = "![Deprecated](https://img.shields.io/badge/status-deprecated-e11d48?style=flat-square)"
        $banner = "> **Deprecated** - do not use for new installs. Download [$LatestVersion]($latestUrl) instead."
    }

    $dlUrl = "https://github.com/$Repo/releases/download/$Version/SpottiVoice-Setup.exe"
    $notes = $badge + "`n`n" + $banner + "`n`n" + $Body + "`n`n"
    $notes += "**Files:** ``SpottiVoice-Setup.exe`` ([download]($dlUrl)) + ``SpottiVoice-Setup.sha256```n`n"
    $notes += "[Full changelog]($changelogUrl)"
    return $notes
}

foreach ($ver in $sections.Keys) {
    $isLatest = ($ver -eq $LatestVersion)
    $notes = Format-ReleaseNotes -Version $ver -Body $sections[$ver] -IsLatest $isLatest

    $tmp = Join-Path $env:TEMP "spotti-release-$ver.md"
    [System.IO.File]::WriteAllText($tmp, $notes, $utf8NoBom)

    Write-Host "Updating $ver (latest=$isLatest) ..."
    if ($isLatest) {
        gh release edit $ver --repo $Repo --notes-file $tmp --latest --prerelease=false
    } else {
        gh release edit $ver --repo $Repo --notes-file $tmp --prerelease
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Failed: $ver"
    }
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
}

Write-Host "[OK] Updated $($sections.Count) releases. Latest: $LatestVersion"
