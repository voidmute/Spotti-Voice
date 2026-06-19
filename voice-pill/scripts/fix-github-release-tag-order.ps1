# Fix GitHub Releases web list order for patch versions 0-9.
# GitHub web sorts tag names lexicographically (v0.1.0.9 > v0.1.0.18).
# Renames release tags to zero-padded form: v0.1.0.8 -> v0.1.0.08, etc.

param(
    [string]$Repo = "voidmute/Spotti-Voice",
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

function Get-PaddedTag([string]$Tag) {
    if ($Tag -match '^v0\.1\.0\.(\d)$') {
        return "v0.1.0.0$($matches[1])"
    }
    return $Tag
}

function Get-TagSha([string]$Tag) {
    try {
        return gh api "repos/$Repo/git/ref/tags/$Tag" -q .object.sha 2>$null
    } catch {
        return $null
    }
}

function Test-TagExists([string]$Tag) {
    return [bool](Get-TagSha $Tag)
}

$releases = gh api "repos/$Repo/releases" --paginate | ConvertFrom-Json
$targets = @($releases | Where-Object { $_.tag_name -match '^v0\.1\.0\.(\d)$' })

if ($targets.Count -eq 0) {
    Write-Host "[OK] No single-digit patch releases to fix."
    exit 0
}

foreach ($rel in ($targets | Sort-Object { [int]($_.tag_name -replace '^v0\.1\.0\.', '') })) {
    $oldTag = $rel.tag_name
    $newTag = Get-PaddedTag $oldTag
    if ($oldTag -eq $newTag) { continue }

    $sha = Get-TagSha $oldTag
    if (-not $sha) {
        Write-Warning "Skip $oldTag - missing git tag"
        continue
    }

    Write-Host "$oldTag -> $newTag ($sha)"

    if ($WhatIf) { continue }

    if (-not (Test-TagExists $newTag)) {
        gh api "repos/$Repo/git/refs" -f ref="refs/tags/$newTag" -f sha=$sha | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Warning "Failed to create tag $newTag"; continue }
    }

    gh release edit $oldTag --repo $Repo --tag $newTag --verify-tag
    if ($LASTEXITCODE -ne 0) { Write-Warning "Failed to retag release $oldTag"; continue }

    gh api -X DELETE "repos/$Repo/git/refs/tags/$oldTag" 2>$null | Out-Null
    Write-Host "  [OK] $newTag"
}

Write-Host "[OK] Tag padding complete. Re-run update-github-release-notes.ps1 to refresh notes URLs."
