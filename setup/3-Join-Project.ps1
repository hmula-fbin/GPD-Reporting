<#
  STEP 3 - every teammate, once (the owner already has a working copy).
  Makes your own working copy from the team's shared OneDrive copy and opens it in VS Code.

    pwsh .\3-Join-Project.ps1 -SharedFolder "$env:OneDriveCommercial\GPD Portfolio Hub (Team)"

  Before running: in OneDrive on the web, open the shared folder and click "Add shortcut to My files",
  then wait until File Explorer shows it synced (green tick). Right-click it > "Always keep on this device".
#>
param(
  [Parameter(Mandatory)][string]$SharedFolder,
  [string]$Into = 'C:\dev\gpd-portfolio-hub'
)
$ErrorActionPreference = 'Stop'
$bare = Join-Path $SharedFolder 'gpd-portfolio-hub.git'
if (-not (Test-Path (Join-Path $bare 'HEAD'))) { throw "Can't find the shared copy at $bare. Is the OneDrive shortcut added and fully synced?" }
if (Test-Path $Into) { throw "$Into already exists. You have already joined - open it in VS Code instead (code `"$Into`")." }

if (-not (git config --global user.name)) { git config --global user.name (Read-Host 'Your name (shown on your changes), e.g. Jane Smith') }
if (-not (git config --global user.email)) { git config --global user.email (Read-Host 'Your work email') }
git config --global pull.rebase false
git config --global init.defaultBranch main

New-Item -ItemType Directory -Force -Path (Split-Path $Into) | Out-Null
git clone "$bare" "$Into"
Set-Location $Into
Write-Host "`nInstalling project tools (a minute or two)..." -ForegroundColor Cyan
npm install
npx playwright install chromium
Write-Host "`nRunning the tests to prove everything works..." -ForegroundColor Cyan
npm test
Write-Host "`nAll set. Opening VS Code..." -ForegroundColor Green
code "$Into"
