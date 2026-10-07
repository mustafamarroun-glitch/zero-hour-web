$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'tools\streaming\common.ps1')
. (Join-Path $PSScriptRoot 'tools\streaming\internet.ps1')
Stop-ZeroHourInternetTunnel $PSScriptRoot
if (!(Test-Path -LiteralPath (Join-Path $PSScriptRoot '.local\streaming\compose.env'))) { Write-Host 'No Zero Hour streaming configuration has been created.'; return }
Invoke-ZeroHourCompose -Docker (Get-ZeroHourDocker) -Root $PSScriptRoot -Arguments @('stop','--timeout','20')
Write-Host 'Only the Zero Hour streaming services were stopped. Profiles and saves were retained.'
