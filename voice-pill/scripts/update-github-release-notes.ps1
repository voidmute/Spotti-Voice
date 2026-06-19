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

$raw = Get-Content -LiteralPath $ChangelogPath -Raw -Encoding UTF8
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

foreach ($ver in $sections.Keys) {
    $tag = $ver
    $notes = @(
        "# $tag",
        "",
        $sections[$ver],
        "",
        "Скачать: ``SpottiVoice-Setup.exe`` + ``SpottiVoice-Setup.sha256``",
        "",
        "[Полный changelog](https://github.com/$Repo/blob/main/CHANGELOG.md)"
    ) -join "`n"

    $tmp = Join-Path $env:TEMP "spotti-release-$tag.md"
    Set-Content -LiteralPath $tmp -Value $notes -Encoding UTF8 -NoNewline

    Write-Host "Updating $tag ..."
    gh release edit $tag --repo $Repo --notes-file $tmp
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Failed: $tag (release may not exist)"
    }
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
}

Write-Host "[OK] Updated $($sections.Count) release notes."
