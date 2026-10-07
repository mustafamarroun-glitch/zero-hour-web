param(
    [string]$GameDirectory = 'C:\Program Files (x86)\DODI-Repacks\Generals Zero Hour\Data',
    [string]$LanAddress,
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'tools\streaming\common.ps1')
. (Join-Path $PSScriptRoot 'tools\streaming\internet.ps1')
Get-ZeroHourCloudflared $PSScriptRoot | Out-Null
if (!$CheckOnly) { Stop-ZeroHourInternetTunnel $PSScriptRoot }
& (Join-Path $PSScriptRoot 'Start-Streaming.ps1') -GameDirectory $GameDirectory -LanAddress $LanAddress -CheckOnly:$CheckOnly
if ($CheckOnly) { Write-Host 'Internet connector and streaming preflight passed. No public tunnel started.'; return }
$taskDocker = Get-ZeroHourDocker
Invoke-ZeroHourCompose -Docker $taskDocker -Root $PSScriptRoot -Arguments @('exec','-T','--user','1000','friend','python3','/app/tools/streaming/test-internet-encoder.py')
$taskUrl = Start-ZeroHourInternetTunnel $PSScriptRoot
$taskInvite = 'https://mustafamarroun-glitch.github.io/zero-hour-web/stream/?host=' + [Uri]::EscapeDataString($taskUrl)
$taskPasswordPath = Join-Path $PSScriptRoot '.local\streaming\password'
$taskInfoPath = Join-Path $PSScriptRoot '.local\streaming\INTERNET-INVITE.txt'
$taskPassword = (Get-Content -LiteralPath $taskPasswordPath -Raw).Trim()
@("Stream invite: $taskInvite", "Direct stream: $taskUrl", 'Username: saddam', "Password: $taskPassword", '', 'Share this privately. The host laptop and Docker must remain on.', 'Choose Internet / HTTPS on the receiver, then Connect.', 'Stop-Streaming.ps1 closes this public tunnel and the streaming services.', 'A new launch creates a new invite address. Files, profiles and saves stay on the host.') | Set-Content -LiteralPath $taskInfoPath -Encoding UTF8
Write-Host 'Internet stream started. Keep the laptop plugged in and awake.'
Write-Host "Friend invite: $taskInvite"
Write-Host "Private login and invite file: $taskInfoPath"
Write-Host 'You play locally at http://localhost:8098/. The friend controls the separate streamed game.'
Write-Host 'Outside-network gameplay and latency still need a real remote-device test.'
