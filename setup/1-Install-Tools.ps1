<#
  STEP 1 - everyone, once per computer.
  Installs Git, Node.js (LTS) and PowerShell 7 with winget, then the PnP.PowerShell module.
  Run it in Windows PowerShell:   powershell -ExecutionPolicy Bypass -File .\setup\1-Install-Tools.ps1

  If winget is blocked on your laptop, install the same three tools from Software Center / IT
  (Git for Windows, Node.js LTS, PowerShell 7) and re-run this script - it skips what is already there.
#>
$ErrorActionPreference = 'Continue'
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Get-Tool($id, $cmd, $name) {
  if (Have $cmd) { Write-Host "  [ok] $name is installed" -ForegroundColor Green; return }
  if (-not (Have 'winget')) { Write-Host "  [!!] $name is missing and winget is not available - ask IT to install $name" -ForegroundColor Red; return }
  Write-Host "  installing $name ..."
  winget install --id $id -e --source winget --accept-package-agreements --accept-source-agreements --silent
}
Write-Host "GPD Portfolio Hub - installing tools" -ForegroundColor Cyan
Get-Tool 'Git.Git' 'git' 'Git'
Get-Tool 'OpenJS.NodeJS.LTS' 'node' 'Node.js LTS'
Get-Tool 'Microsoft.PowerShell' 'pwsh' 'PowerShell 7'
if (-not (Have 'code')) { Write-Host "  [!!] VS Code command 'code' not found. Install VS Code (or re-open this window after installing)." -ForegroundColor Yellow }
else { Write-Host "  [ok] VS Code is installed" -ForegroundColor Green }

# refresh PATH for this window so the new tools are found
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
if (Have 'pwsh') {
  Write-Host "  installing PnP.PowerShell (SharePoint deploy module) for your user ..."
  pwsh -NoProfile -Command "if (-not (Get-Module -ListAvailable PnP.PowerShell)) { Set-PSRepository PSGallery -InstallationPolicy Trusted; Install-Module PnP.PowerShell -Scope CurrentUser -Force }; 'PnP.PowerShell ' + (Get-Module -ListAvailable PnP.PowerShell | Select-Object -First 1).Version"
}
if (Have 'code') {
  Write-Host "  installing the Claude Code extension for VS Code ..."
  code --install-extension anthropic.claude-code --force | Out-Null
}
# files from a downloaded zip are marked "from the internet"; unblock the project's scripts
$proj = Split-Path -Parent $PSScriptRoot
if (Test-Path (Join-Path $proj 'package.json')) { Get-ChildItem -Path $proj -Recurse -Filter *.ps1 | Unblock-File }
Get-ChildItem -Path $PSScriptRoot -Filter *.ps1 | Unblock-File

Write-Host "`nDone. CLOSE this window and open a new one so Windows picks up the new tools." -ForegroundColor Cyan
Write-Host "Check with:  git --version ; node --version ; pwsh --version"
