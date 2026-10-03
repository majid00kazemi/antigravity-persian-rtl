# Antigravity Persian RTL Installer (Windows PowerShell)
$ErrorActionPreference = "Stop"

$repoUrl = "https://github.com/majidkarimi/antigravity-persian-rtl.git"
$targetDir = "$env:USERPROFILE\.gemini\config\plugins\persian-rtl"

Write-Host "Installing Antigravity Persian RTL Plugin..." -ForegroundColor Cyan

if (Test-Path "$targetDir\.git") {
    Write-Host "Updating existing plugin..." -ForegroundColor Yellow
    git -C $targetDir pull
} elseif (Test-Path $targetDir) {
    Write-Host "Backing up existing non-git directory..." -ForegroundColor Yellow
    Move-Item -Path $targetDir -Destination "$targetDir.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    git clone $repoUrl $targetDir
} else {
    $parentDir = Split-Path $targetDir -Parent
    if (!(Test-Path $parentDir)) {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    }
    git clone $repoUrl $targetDir
}

Write-Host "`nPlugin installed successfully! " -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Open or restart Antigravity."
Write-Host "2. Go to 'Customizations' (left sidebar) -> 'Installed' tab."
Write-Host "3. Toggle 'Persian RTL' to Enabled."
