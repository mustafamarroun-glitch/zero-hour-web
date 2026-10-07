param(
    [string]$GameDirectory = 'C:\Program Files (x86)\DODI-Repacks\Generals Zero Hour\Data',
    [string]$LanAddress,
    [string]$Image = 'zero-hour-wsl-stream:local',
    [string]$SiteImage = 'online-games-zeroh:local',
    [string]$TurnImage = 'ghcr.io/coturn/coturn:4.18.0-r0',
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'tools\streaming\common.ps1')
$taskDocker = Get-ZeroHourDocker
$taskLan = Get-ZeroHourLanAddress $LanAddress
if (!(Test-Path -LiteralPath $GameDirectory -PathType Container)) { throw 'Choose the local Zero Hour Data folder with -GameDirectory.' }
if (!(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules\ws\package.json'))) { throw 'Project dependencies are missing. Run npm ci first.' }
$taskState = Join-Path $PSScriptRoot '.local\streaming'
New-Item -ItemType Directory -Force -Path $taskState | Out-Null
& $taskDocker info --format '{{.OSType}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop and wait for its Linux engine.' }
$taskBase = & $taskDocker image inspect 'lscr.io/linuxserver/chromium:latest' --format '{{.Id}}' 2>$null
if ($LASTEXITCODE -ne 0) { throw 'The Chromium base image is missing. Pull lscr.io/linuxserver/chromium:latest first.' }
& $taskDocker build --pull=false --tag $Image --file (Join-Path $PSScriptRoot 'tools\streaming\Dockerfile.wsl-probe') (Join-Path $PSScriptRoot 'tools\streaming')
if ($LASTEXITCODE -ne 0) { throw 'The WSL streaming image build failed.' }
# Every launch retests the actual pipeline. A stale saved report never authorizes
# a session, and a failing check returns before Compose creates any services.
& (Join-Path $PSScriptRoot 'Test-StreamingGPU.ps1') -Image $Image
$taskReport = Get-Content -LiteralPath (Join-Path $taskState 'wsl-capability.json') -Raw | ConvertFrom-Json
$taskNodeImage = & $taskDocker image inspect $SiteImage --format '{{.Id}}' 2>$null
if ($LASTEXITCODE -ne 0) { throw "Image $SiteImage is not cached. Run docker pull $SiteImage, then retry." }
$taskTurnCachedImage = & $taskDocker image ls --quiet $TurnImage
if (!$taskTurnCachedImage) {
    & $taskDocker pull $TurnImage
    if ($LASTEXITCODE -ne 0) { throw "Could not pull the official Coturn image $TurnImage." }
}
$taskTurnImageId = & $taskDocker image inspect $TurnImage --format '{{.Id}}'
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the official Coturn image.' }
$taskPinnedImage = "zero-hour-stream:$($taskReport.imageId.Substring(7,12))"
& $taskDocker image tag $taskReport.imageId $taskPinnedImage
if ($LASTEXITCODE -ne 0) { throw 'Could not pin the tested streaming image to its local session tag.' }
$taskPinnedTurnImage = "zero-hour-turn:$($taskTurnImageId.Trim().Substring(7,12))"
& $taskDocker image tag $TurnImage $taskPinnedTurnImage
if ($LASTEXITCODE -ne 0) { throw 'Could not pin the official Coturn image to its local session tag.' }
$taskPasswordPath = Join-Path $taskState 'password'
if (!$CheckOnly) {
    New-Item -ItemType Directory -Force -Path (Join-Path $taskState 'friend') | Out-Null
    if (!(Test-Path -LiteralPath $taskPasswordPath) -or (Get-Content -LiteralPath $taskPasswordPath -Raw).Trim().Length -lt 24) {
        $taskPasswordBytes = New-Object byte[] 24
        $taskPasswordRng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $taskPasswordRng.GetBytes($taskPasswordBytes) } finally { $taskPasswordRng.Dispose() }
        [IO.File]::WriteAllText($taskPasswordPath, [Convert]::ToBase64String($taskPasswordBytes).Replace('+','-').Replace('/','_'), [Text.UTF8Encoding]::new($false))
    }
}
$taskTurnSecretPath = Join-Path $taskState 'turn-secret'
if (!(Test-Path -LiteralPath $taskTurnSecretPath)) {
    $taskBytes = New-Object byte[] 48
    $taskRng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $taskRng.GetBytes($taskBytes) } finally { $taskRng.Dispose() }
    [IO.File]::WriteAllText($taskTurnSecretPath, [Convert]::ToBase64String($taskBytes).TrimEnd('=').Replace('+','-').Replace('/','_'), [Text.UTF8Encoding]::new($false))
}
$taskTurnConfigPath = Join-Path $taskState 'turnserver.conf'
if (!(Test-Path -LiteralPath $taskTurnConfigPath)) {
    @('fingerprint','use-auth-secret','static-auth-secret=not-started','realm=zero-hour-web','listening-ip=127.0.0.1','relay-ip=127.0.0.1','external-ip=127.0.0.1/127.0.0.1','listening-port=3478','min-port=21000','max-port=21063','no-tcp','no-tls','no-tcp-relay','no-multicast-peers','log-file=stdout') | Set-Content -LiteralPath $taskTurnConfigPath -Encoding ascii
}
$taskGame = (Resolve-Path -LiteralPath $GameDirectory).Path.Replace('\','/')
if ($taskGame.Contains("'") -or $taskGame.Contains("`n") -or $taskGame.Contains("`r")) { throw 'The game directory cannot contain quotes or line breaks.' }
@("ZH_STREAM_IMAGE=$taskPinnedImage", "ZH_STREAM_SITE_IMAGE=$SiteImage", "ZH_STREAM_TURN_IMAGE=$taskPinnedTurnImage", "ZH_STREAM_LAN_IP=$taskLan", 'ZH_STREAM_TURN_URL=', 'ZH_STREAM_TURN_SECRET_FILE=', "ZH_STREAM_GAME_DIR='$taskGame'") | Set-Content -LiteralPath (Join-Path $taskState 'compose.env') -Encoding UTF8
'wsl' | Set-Content -LiteralPath (Join-Path $taskState 'host-mode') -Encoding UTF8
Invoke-ZeroHourCompose -Docker $taskDocker -Root $PSScriptRoot -Arguments @('config','--quiet')
if ($CheckOnly) { Write-Host 'GPU and Compose preflight passed. No friend session started.'; return }
Invoke-ZeroHourCompose -Docker $taskDocker -Root $PSScriptRoot -Arguments @('up','-d','--force-recreate','friend','site')
Write-ZeroHourTurnConfig -Docker $taskDocker -Root $PSScriptRoot -LanAddress $taskLan
Invoke-ZeroHourCompose -Docker $taskDocker -Root $PSScriptRoot -Arguments @('up','-d','--force-recreate','turn')
$taskTurnContainer = & $taskDocker compose --project-name zero-hour-streaming --env-file (Join-Path $taskState 'compose.env') --file (Join-Path $PSScriptRoot 'compose.streaming.wsl.yaml') ps -q turn
if (!$taskTurnContainer -or (& $taskDocker inspect --format '{{.State.Running}}' $taskTurnContainer).Trim() -ne 'true') {
    throw 'The local TURN relay did not stay running. Inspect it with: docker compose --project-name zero-hour-streaming --env-file .local/streaming/compose.env --file compose.streaming.wsl.yaml logs turn'
}
Set-ZeroHourTurnEnvironment -Root $PSScriptRoot -LanAddress $taskLan -Enable
Invoke-ZeroHourCompose -Docker $taskDocker -Root $PSScriptRoot -Arguments @('up','-d','--force-recreate','site')
Test-ZeroHourTurnDataChannel -Docker $taskDocker -Root $PSScriptRoot
Wait-ZeroHourChromium -Docker $taskDocker -Root $PSScriptRoot
Write-Host 'Zero Hour streaming services started; gameplay performance is not yet verified.'
Write-Host 'You: open http://localhost:8098/ in your Windows browser.'
Write-Host "Friend: open https://${taskLan}:3001/ on the same Wi-Fi. Username: saddam. Read the private password file below."
Write-Host "Private password file: $taskPasswordPath"
Write-Host 'Inside the streamed browser, import /mnt/zero-hour once. Both players use matching game files and join the same room.'
Write-Host 'Select 1280 x 720 in both game sessions to match the low-latency stream. Check Mac decoded/displayed FPS and RTT during a real match.'
Write-Host 'Stop with Stop-Streaming.ps1; saves and profiles are retained.'
