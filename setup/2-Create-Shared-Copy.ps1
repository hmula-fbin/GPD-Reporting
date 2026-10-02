<#
  STEP 2 - the project owner only, once.
  Creates the team's shared copy of the project inside a OneDrive folder you share with the team,
  and connects your own working copy to it.

    pwsh .\setup\2-Create-Shared-Copy.ps1 -SharedFolder "$env:OneDriveCommercial\GPD Portfolio Hub (Team)"

  What it creates:  <SharedFolder>\gpd-portfolio-hub.git   (a git "bare" repository = the shared history)
  Nobody edits files in there. Everyone works in their own copy at C:\dev\gpd-portfolio-hub and
  sends / receives changes with git (or by asking Claude: /get-latest, /share-change).
  When GitHub access arrives, see docs/TEAM-GUIDE.md "Moving to GitHub" - it is a 3-command switch.
#>
param([Parameter(Mandatory)][string]$SharedFolder)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
if (-not (Test-Path $SharedFolder)) { New-Item -ItemType Directory -Path $SharedFolder | Out-Null }
if ($Root -like "*OneDrive*") { Write-Warning "Your working copy is inside OneDrive ($Root). Move it to C:\dev\gpd-portfolio-hub - OneDrive syncing node_modules and .git causes problems." }
$bare = Join-Path $SharedFolder 'gpd-portfolio-hub.git'
if (Test-Path $bare) { throw "$bare already exists. Teammates should run 3-Join-Project.ps1 instead." }

git init --bare --initial-branch=main "$bare" | Out-Null
git -C "$bare" config receive.denyNonFastForwards true   # nobody can overwrite shared history by accident
@"
DO NOT OPEN, EDIT, MOVE OR DELETE ANYTHING IN THIS FOLDER.
gpd-portfolio-hub.git is the team's shared project history (a git repository).
Work in your own copy (C:\dev\gpd-portfolio-hub). See docs/TEAM-GUIDE.md in the project.
Keep this folder set to "Always keep on this device" in OneDrive.
"@ | Set-Content -Path (Join-Path $SharedFolder 'READ ME FIRST.txt')

Copy-Item (Join-Path $PSScriptRoot '1-Install-Tools.ps1'), (Join-Path $PSScriptRoot '3-Join-Project.ps1') -Destination $SharedFolder -Force

if (git remote 2>$null | Select-String -SimpleMatch 'origin' -Quiet) { git remote set-url origin "$bare" } else { git remote add origin "$bare" }
git push -u origin main
git push origin --tags
Write-Host "`nShared copy created at $bare" -ForegroundColor Green
Write-Host "Next:"
Write-Host "  1. In OneDrive (browser), share the folder '$SharedFolder' with the team (Can edit)."
Write-Host "  2. Right-click the folder in File Explorer > OneDrive > 'Always keep on this device'."
Write-Host "  3. Each teammate opens the shared folder in OneDrive on the web, clicks 'Add shortcut to My files',"
Write-Host "     waits for it to sync, then runs 1-Install-Tools.ps1 and 3-Join-Project.ps1 from that folder."
