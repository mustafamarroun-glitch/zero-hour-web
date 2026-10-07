$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'tools\streaming\common.ps1')

$taskState = Join-Path $PSScriptRoot '.local\streaming'
$taskEnvPath = Join-Path $taskState 'compose.env'
if (!(Test-Path -LiteralPath $taskEnvPath -PathType Leaf)) { throw 'No existing streaming session was found. Start it with Start-Streaming.ps1 first.' }
$taskModePath = Join-Path $taskState 'host-mode'
if (!(Test-Path -LiteralPath $taskModePath) -or (Get-Content -LiteralPath $taskModePath -Raw).Trim() -ne 'wsl') {
    throw 'This helper updates an existing Windows/WSL Docker stream. On native Linux, stop the session and start it again with Start-Streaming.sh.'
}

$taskDocker = Get-ZeroHourDocker
$taskLanLine = Get-Content -LiteralPath $taskEnvPath | Where-Object { $_ -match '^ZH_STREAM_LAN_IP=' } | Select-Object -Last 1
if (!$taskLanLine) { throw 'The streaming configuration has no selected private LAN address.' }
$taskLan = Get-ZeroHourLanAddress ($taskLanLine.Substring('ZH_STREAM_LAN_IP='.Length).Trim().Trim("'`""))
$taskTurnImage = 'ghcr.io/coturn/coturn:4.18.0-r0'

$taskCachedImage = & $taskDocker image ls --quiet $taskTurnImage
if (!$taskCachedImage) {
    & $taskDocker pull $taskTurnImage
    if ($LASTEXITCODE -ne 0) { throw "Could not pull the official Coturn image $taskTurnImage." }
}
$taskImageId = & $taskDocker image inspect $taskTurnImage --format '{{.Id}}'
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the official Coturn image.' }
$taskPinnedImage = "zero-hour-turn:$($taskImageId.Trim().Substring(7,12))"
& $taskDocker image tag $taskTurnImage $taskPinnedImage
if ($LASTEXITCODE -ne 0) { throw 'Could not pin the Coturn image to its downloaded image ID.' }

New-Item -ItemType Directory -Force -Path $taskState | Out-Null
$taskSecretPath = Join-Path $taskState 'turn-secret'
if (!(Test-Path -LiteralPath $taskSecretPath)) {
    $taskBytes = New-Object byte[] 48
    $taskRng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $taskRng.GetBytes($taskBytes) } finally { $taskRng.Dispose() }
    [IO.File]::WriteAllText($taskSecretPath, [Convert]::ToBase64String($taskBytes).TrimEnd('=').Replace('+','-').Replace('/','_'), [Text.UTF8Encoding]::new($false))
}
if ((Get-Content -LiteralPath $taskSecretPath -Raw).Trim().Length -lt 32) { throw 'The private TURN secret is missing or too short.' }

$taskEnvLines = @(Get-Content -LiteralPath $taskEnvPath | Where-Object { $_ -notmatch '^ZH_STREAM_(TURN_IMAGE|TURN_URL|TURN_SECRET_FILE)=' })
$taskEnvLines += "ZH_STREAM_TURN_IMAGE=$taskPinnedImage"
$taskEnvLines += 'ZH_STREAM_TURN_URL='
$taskEnvLines += 'ZH_STREAM_TURN_SECRET_FILE='
[IO.File]::WriteAllLines($taskEnvPath, $taskEnvLines, [Text.UTF8Encoding]::new($false))

$taskConfigPath = Join-Path $taskState 'turnserver.conf'
if (!(Test-Path -LiteralPath $taskConfigPath)) {
    @('fingerprint','use-auth-secret','static-auth-secret=not-started','realm=zero-hour-web','listening-ip=127.0.0.1','relay-ip=127.0.0.1','external-ip=127.0.0.1/127.0.0.1','listening-port=3478','min-port=21000','max-port=21063','no-tcp','no-tls','no-tcp-relay','no-multicast-peers','log-file=stdout') | Set-Content -LiteralPath $taskConfigPath -Encoding ascii
}
Invoke-ZeroHourCompose -Docker $taskDocker -Root $PSScriptRoot -Arguments @('config','--quiet')
if (!(Test-Path -LiteralPath (Join-Path $taskState 'password'))) { throw 'The private streaming password is missing. Run Start-Streaming.ps1.' }
Write-Host 'Updating the stream container to publish the laptop-local UDP relay ports; your friend will need to reconnect.'
Invoke-ZeroHourCompose -Docker $taskDocker -Root $PSScriptRoot -Arguments @('up','-d','--force-recreate','friend','site')
Write-ZeroHourTurnConfig -Docker $taskDocker -Root $PSScriptRoot -LanAddress $taskLan
Invoke-ZeroHourCompose -Docker $taskDocker -Root $PSScriptRoot -Arguments @('up','-d','--force-recreate','turn')
$taskTurnContainer = & $taskDocker compose --project-name zero-hour-streaming --env-file $taskEnvPath --file (Join-Path $PSScriptRoot 'compose.streaming.wsl.yaml') ps -q turn
if (!$taskTurnContainer -or (& $taskDocker inspect --format '{{.State.Running}}' $taskTurnContainer).Trim() -ne 'true') {
    throw 'Coturn exited during startup. Inspect it with: docker compose --project-name zero-hour-streaming --env-file .local/streaming/compose.env --file compose.streaming.wsl.yaml logs turn'
}
Set-ZeroHourTurnEnvironment -Root $PSScriptRoot -LanAddress $taskLan -Enable
Invoke-ZeroHourCompose -Docker $taskDocker -Root $PSScriptRoot -Arguments @('up','-d','--force-recreate','site')

$taskDeadline = [DateTime]::UtcNow.AddSeconds(20)
$taskNetwork = $null
while ([DateTime]::UtcNow -lt $taskDeadline) {
    try {
        $taskNetwork = Invoke-RestMethod -Uri 'http://127.0.0.1:8098/network-config.json' -TimeoutSec 2
        if ($taskNetwork.runtime -eq '3ccaa0e9-compiled-combined-v6' -and @($taskNetwork.iceServers | Where-Object { $_.urls -match '^turn:' }).Count -gt 0) { break }
    } catch { }
    Start-Sleep -Milliseconds 400
}
if (!$taskNetwork -or !@($taskNetwork.iceServers | Where-Object { $_.urls -match '^turn:' }).Count) {
    throw 'The web game server did not publish its private TURN configuration. Inspect the site and turn logs before retrying.'
}
Test-ZeroHourTurnDataChannel -Docker $taskDocker -Root $PSScriptRoot
Wait-ZeroHourChromium -Docker $taskDocker -Root $PSScriptRoot
Write-Host 'Private LAN game relay is ready.'
Write-Host 'Reload the Windows game tab, re-import /mnt/zero-hour once in the new streamed profile, create a fresh web room, and join it from both clients.'
Write-Host 'This relay is limited to your laptop and private Wi-Fi; no router forwarding or Windows Firewall rule was added.'
