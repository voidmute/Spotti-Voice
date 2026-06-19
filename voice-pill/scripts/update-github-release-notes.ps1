# Update GitHub release notes from CHANGELOG sections.
# Usage: .\voice-pill\scripts\update-github-release-notes.ps1 [-Repo voidmute/Spotti-Voice] [-LatestVersion v0.1.0.21]

param(
    [string]$Repo = "voidmute/Spotti-Voice",
    [string]$LatestVersion = "v0.1.0.21",
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
    param([string]$Version, [string]$ReleaseTag, [string]$Body, [bool]$IsLatest)

    if ($IsLatest) {
        $badge = "![Current](https://img.shields.io/badge/status-current-22c55e?style=flat-square)"
        $banner = "**Recommended download** - latest stable installer."
    } else {
        $badge = "![Deprecated](https://img.shields.io/badge/status-deprecated-e11d48?style=flat-square)"
        $banner = "> **Deprecated** - do not use for new installs. Download [$LatestVersion]($latestUrl) instead."
    }

    $dlUrl = "https://github.com/$Repo/releases/download/$ReleaseTag/SpottiVoice-Setup.exe"
    $notes = $badge + "`n`n" + $banner + "`n`n" + $Body + "`n`n"
    $notes += "**Files:** ``SpottiVoice-Setup.exe`` ([download]($dlUrl)) + ``SpottiVoice-Setup.sha256```n`n"
    $notes += "[Full changelog]($changelogUrl)"
    return $notes
}

function Get-SemVer([string]$Tag) {
    $normalized = $Tag.TrimStart('v') -replace '^(\d+\.\d+\.\d+)\.0(\d)$', '$1.$2'
    return [version]$normalized
}

# GitHub web sorts tag names lexicographically (v0.1.0.9 > v0.1.0.18). Use padded tags on GitHub.
function Get-GitHubReleaseTag([string]$Version) {
    if ($Version -match '^v0\.1\.0\.(\d)$') {
        return "v0.1.0.0$($matches[1])"
    }
    return $Version
}

# GitHub lists releases by published_at (newest edit first). Edit OLDEST first so v0.1.0.19
# is touched last and stays on top; v0.1.0.21 above v0.1.0.20, etc.
$orderedVersions = @($sections.Keys | Sort-Object { Get-SemVer $_ })

foreach ($ver in $orderedVersions) {
    $releaseTag = Get-GitHubReleaseTag $ver
    $isLatest = ($ver -eq $LatestVersion)
    $notes = Format-ReleaseNotes -Version $ver -ReleaseTag $releaseTag -Body $sections[$ver] -IsLatest $isLatest

    $tmp = Join-Path $env:TEMP "spotti-release-$ver.md"
    [System.IO.File]::WriteAllText($tmp, $notes, $utf8NoBom)

    $label = if ($releaseTag -ne $ver) { "$ver -> $releaseTag" } else { $ver }
    Write-Host "Updating $label (latest=$isLatest) ..."
    if ($isLatest) {
        gh release edit $releaseTag --repo $Repo --notes-file $tmp --latest --prerelease=false
    } else {
        gh release edit $releaseTag --repo $Repo --notes-file $tmp --prerelease
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Failed: $ver"
    }
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
}

Write-Host "[OK] Updated $($sections.Count) releases. Latest: $LatestVersion"
