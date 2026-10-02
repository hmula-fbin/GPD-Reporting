<#
.SYNOPSIS
  One-time setup: installs PnP.PowerShell and registers the Entra ID app it signs in with.
  PnP.PowerShell no longer ships a shared multi-tenant app, so each tenant registers its own.

  Run once per machine (install) and once per tenant (app). The app registration may need a
  Global/Application admin to grant consent - if you are not one, send IT the output of this
  script or ask them to run the Register step for you.

.EXAMPLE
  ./deploy/Setup-PnPApp.ps1 -Tenant fbinportal.onmicrosoft.com
#>
param(
  [Parameter(Mandatory)][string]$Tenant,
  [string]$AppName = 'GPD Portfolio Hub Deploy'
)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'PnP.PowerShell 2.x needs PowerShell 7+. Install it: winget install Microsoft.PowerShell' }
if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) {
  Write-Host 'Installing PnP.PowerShell for the current user...'
  Install-Module PnP.PowerShell -Scope CurrentUser -Force
}
Import-Module PnP.PowerShell
Write-Host "Registering '$AppName' in $Tenant (a browser window opens for sign-in and consent)..."
$app = Register-PnPEntraIDAppForInteractiveLogin -ApplicationName $AppName -Tenant $Tenant -SharePointDelegatePermissions 'AllSites.Write'
$id = $app.'AzureAppId/ClientId'
if (-not $id) { $id = ($app | Out-String) }
Write-Host "`nClient ID: $id" -ForegroundColor Green
Write-Host 'Put this value in "pnpClientId" in config/dev.json, config/test.json and config/prod.json.'
