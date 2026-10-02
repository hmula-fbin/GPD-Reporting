<#
.SYNOPSIS
  Build and deploy the GPD Portfolio Hub pages to one SharePoint environment (dev, test or prod).

.DESCRIPTION
  1. Checks the environment config (config/<env>.json).
  2. Prod only: the git tree must be clean, HEAD must carry the tag v<version>, the same version
     must already be on Test, and you must type the confirmation phrase.
  3. Builds dist/<env>/ (unless -SkipBuild).
  4. Signs in to SharePoint as you (PnP.PowerShell, interactive browser sign-in).
  5. Backs up the pages currently on the site to backups/<env>/<timestamp>/.
  6. Uploads Home.aspx and Portfolio_Scorecard.aspx to the pages library and checks the sizes.
  7. Writes a line to deploy/deployments.log.

.EXAMPLE
  ./deploy/Deploy-Portfolio.ps1 -Env dev
  ./deploy/Deploy-Portfolio.ps1 -Env test
  ./deploy/Deploy-Portfolio.ps1 -Env prod
  ./deploy/Deploy-Portfolio.ps1 -Env dev -UploadData "data/Pipeline Data.xlsx"   # seed a dev/test data file
  ./deploy/Deploy-Portfolio.ps1 -Env prod -Rollback 20261002-141500               # put a backup back
  ./deploy/Deploy-Portfolio.ps1 -Env test -WhatIf                                 # show what would happen
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('dev', 'test', 'prod')][string]$Env,
  [switch]$SkipBuild,
  [string]$Rollback,
  [string]$UploadData,
  [switch]$WhatIf
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Fail($msg) { Write-Host "STOPPED: $msg" -ForegroundColor Red; exit 1 }
function Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }

# ---------- 1. config ----------
$cfgPath = Join-Path $Root "config/$Env.json"
if (-not (Test-Path $cfgPath)) { Fail "No config/$Env.json" }
$cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
$pkg = Get-Content (Join-Path $Root 'package.json') -Raw | ConvertFrom-Json
$version = $pkg.version
if ($cfg.sitePath -match 'CHANGE-ME') { Fail "config/$Env.json still has a CHANGE-ME site path. Put the real site in first." }
if (-not $cfg.pnpClientId) { Fail "config/$Env.json has no pnpClientId. Run ./deploy/Setup-PnPApp.ps1 once (see docs/RELEASE.md)." }
$siteUrl = $cfg.tenantUrl.TrimEnd('/') + $cfg.sitePath
$pages = @('Home.aspx', 'Portfolio_Scorecard.aspx')
$logFile = Join-Path $PSScriptRoot 'deployments.log'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$commit = (git rev-parse --short HEAD 2>$null)
if (-not $commit) { $commit = 'no-git' }

Write-Host "GPD Portfolio Hub deploy" -ForegroundColor White
Write-Host ("  Environment : {0} ({1})" -f $cfg.label, $Env)
Write-Host ("  Site        : {0}" -f $siteUrl)
Write-Host ("  Library     : {0}" -f $cfg.pagesLibrary)
Write-Host ("  Version     : {0}  commit {1}" -f $version, $commit)

# ---------- 2. production gates ----------
if ($Env -eq 'prod' -and -not $Rollback) {
  Step 'Production checks'
  $dirty = git status --porcelain
  if ($dirty) { Fail "Uncommitted changes. Commit or stash them first:`n$dirty" }
  $tags = git tag --points-at HEAD
  if ($tags -notcontains "v$version") { Fail "HEAD is not tagged v$version. Tag the release: git tag -a v$version -m 'Release v$version'" }
  $onTest = (Test-Path $logFile) -and (Select-String -Path $logFile -SimpleMatch "`ttest`t$version`t$commit`t" -Quiet)
  if (-not $onTest) { Fail "v$version (commit $commit) has not been deployed to Test yet. Deploy to test and sign off first." }
  Write-Host "  clean tree, tag v$version, already on Test - OK" -ForegroundColor Green
  $answer = Read-Host "Type DEPLOY PROD to publish v$version to $siteUrl"
  if ($answer -cne 'DEPLOY PROD') { Fail 'Not confirmed.' }
}

if ($Env -eq 'prod' -and $Rollback) {
  $answer = Read-Host "Type ROLLBACK PROD to put backup $Rollback back on $siteUrl"
  if ($answer -cne 'ROLLBACK PROD') { Fail 'Not confirmed.' }
}

# ---------- 3. build ----------
$dist = Join-Path $Root "dist/$Env"
if ($Rollback) {
  $dist = Join-Path $Root "backups/$Env/$Rollback"
  if (-not (Test-Path $dist)) { Fail "No backup at backups/$Env/$Rollback" }
  Write-Host "  Rolling back to backup $Rollback" -ForegroundColor Yellow
}
elseif (-not $SkipBuild) {
  Step 'Build'
  node build/build.mjs --env $Env
  if ($LASTEXITCODE -ne 0) { Fail 'Build failed.' }
}
foreach ($p in $pages) { if (-not (Test-Path (Join-Path $dist $p))) { Fail "Missing $p in $dist" } }

if ($WhatIf) {
  Step 'WhatIf - nothing uploaded'
  foreach ($p in $pages) { Write-Host ("  would upload {0} ({1:N0} KB) -> {2}/{3}" -f $p, ((Get-Item (Join-Path $dist $p)).Length / 1KB), $cfg.pagesLibrary, $p) }
  if ($UploadData) { Write-Host "  would upload data file $UploadData -> $($cfg.dataLibrary)/$($cfg.dataFileName)" }
  exit 0
}

# ---------- 4. sign in ----------
Step 'Sign in to SharePoint'
if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) { Fail 'PnP.PowerShell is not installed. Run: Install-Module PnP.PowerShell -Scope CurrentUser' }
Import-Module PnP.PowerShell
Connect-PnPOnline -Url $siteUrl -Interactive -ClientId $cfg.pnpClientId
$web = Get-PnPWeb
Write-Host "  connected to '$($web.Title)'" -ForegroundColor Green
$libRel = $cfg.sitePath + '/' + $cfg.pagesLibrary

# ---------- 5. backup ----------
Step 'Back up current pages'
$bk = Join-Path $Root "backups/$Env/$stamp"
New-Item -ItemType Directory -Force -Path $bk | Out-Null
foreach ($p in $pages) {
  try { Get-PnPFile -Url "$libRel/$p" -Path $bk -FileName $p -AsFile -Force -ErrorAction Stop; Write-Host "  saved $p" }
  catch { Write-Host "  $p not on the site yet (first deploy)" -ForegroundColor DarkGray }
}

# ---------- 6. upload ----------
Step 'Upload'
foreach ($p in $pages) {
  $local = Join-Path $dist $p
  $f = Add-PnPFile -Path $local -Folder $cfg.pagesLibrary
  $want = (Get-Item $local).Length
  try {
    $item = Get-PnPFile -Url "$libRel/$p" -AsListItem
    $got = [long]$item['File_x0020_Size']
    if ($got -ne $want) { Write-Host ("  WARNING {0}: site size {1} <> local {2}" -f $p, $got, $want) -ForegroundColor Yellow }
    else { Write-Host ("  {0} uploaded ({1:N0} KB, verified)" -f $p, ($want / 1KB)) -ForegroundColor Green }
  }
  catch { Write-Host "  $p uploaded (size check skipped: $($_.Exception.Message))" -ForegroundColor Yellow }
}

if ($UploadData) {
  if ($Env -eq 'prod') { Fail 'Data uploads are for dev/test only. Production data is maintained by its owners.' }
  if (-not (Test-Path $UploadData)) { Fail "No file $UploadData" }
  Step 'Upload data file'
  Add-PnPFile -Path $UploadData -Folder $cfg.dataLibrary -NewFileName $cfg.dataFileName | Out-Null
  Write-Host "  $($cfg.dataFileName) -> $($cfg.dataLibrary)" -ForegroundColor Green
}

# ---------- 7. log ----------
$what = if ($Rollback) { "rollback:$Rollback" } else { 'deploy' }
$who = [Environment]::UserName
"{0}`t{1}`t{2}`t{3}`t{4}`t{5}`t{6}" -f (Get-Date -Format 's'), $Env, $version, $commit, $what, $who, $stamp | Add-Content -Path $logFile
Step 'Done'
Write-Host "  Home       $($cfg.tenantUrl)$($cfg.sitePath)/$([uri]::EscapeUriString($cfg.pagesLibrary))/Home.aspx"
Write-Host "  Scorecard  $($cfg.tenantUrl)$($cfg.sitePath)/$([uri]::EscapeUriString($cfg.pagesLibrary))/Portfolio_Scorecard.aspx"
Write-Host "  Backup     backups/$Env/$stamp  (roll back with -Rollback $stamp)"
Disconnect-PnPOnline
