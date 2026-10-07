Set-StrictMode -Version Latest

function Get-ZeroHourDocker {
    $command = Get-Command docker -ErrorAction SilentlyContinue
    $candidates = @(
        $(if ($command) { $command.Source }),
        (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'),
        (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe')
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }
    if (!$candidates) { throw 'Docker Desktop was not found. Install it and select Linux containers.' }
    return @($candidates)[0]
}

function Get-ZeroHourLanAddress([string]$Address) {
    if ($Address) {
        $parsed = [System.Net.IPAddress]::Parse($Address)
        $bytes = $parsed.GetAddressBytes()
        if ($bytes.Length -ne 4 -or !(($bytes[0] -eq 10) -or ($bytes[0] -eq 192 -and $bytes[1] -eq 168) -or ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31))) {
            throw 'Choose this laptop''s private IPv4 LAN address.'
        }
        if (!(Get-NetIPAddress -AddressFamily IPv4 -IPAddress $Address -ErrorAction SilentlyContinue)) { throw 'That LAN address does not belong to this laptop.' }
        return $parsed.ToString()
    }
    $addresses = @(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | ForEach-Object { $_.IPv4Address.IPAddress })
    if ($addresses.Count -ne 1) { throw 'Multiple or no LAN adapters found. Specify -LanAddress with this laptop''s private IPv4 address.' }
    return Get-ZeroHourLanAddress $addresses[0]
}

function Invoke-ZeroHourCompose([string]$Docker, [string]$Root, [string[]]$Arguments) {
    $taskCompose = 'compose.streaming.yaml'
    $taskModeFile = Join-Path $Root '.local\streaming\host-mode'
    if ((Test-Path -LiteralPath $taskModeFile) -and (Get-Content -LiteralPath $taskModeFile -Raw).Trim() -eq 'wsl') { $taskCompose = 'compose.streaming.wsl.yaml' }
    & $Docker compose --project-name zero-hour-streaming --env-file (Join-Path $Root '.local\streaming\compose.env') --file (Join-Path $Root $taskCompose) @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Zero Hour streaming Compose command failed (exit $LASTEXITCODE)." }
}

function Write-ZeroHourTurnConfig([string]$Docker, [string]$Root, [string]$LanAddress) {
    $taskContainer = & $Docker compose --project-name zero-hour-streaming --env-file (Join-Path $Root '.local\streaming\compose.env') --file (Join-Path $Root 'compose.streaming.wsl.yaml') ps -q friend
    if ($LASTEXITCODE -ne 0 -or !$taskContainer) { throw 'The streaming browser container is not running; cannot configure the private TURN relay.' }
    $taskInternalAddress = (& $Docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $taskContainer).Trim()
    $taskParsedAddress = $null
    if (![System.Net.IPAddress]::TryParse($taskInternalAddress, [ref]$taskParsedAddress) -or $taskParsedAddress.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
        throw 'Docker did not report the streaming container IPv4 address required for TURN NAT mapping.'
    }
    $taskSecretPath = Join-Path $Root '.local\streaming\turn-secret'
    $taskSecret = (Get-Content -LiteralPath $taskSecretPath -Raw).Trim()
    $taskLines = @(
        'fingerprint', 'use-auth-secret', "static-auth-secret=$taskSecret", 'realm=zero-hour-web',
        "listening-ip=127.0.0.1", "listening-ip=$taskInternalAddress", "relay-ip=$taskInternalAddress", "external-ip=$LanAddress/$taskInternalAddress",
        "allowed-peer-ip=$LanAddress", "allowed-peer-ip=$taskInternalAddress",
        'listening-port=3478', 'min-port=21000', 'max-port=21063',
        'no-tcp', 'no-tls', 'no-tcp-relay', 'no-multicast-peers', 'stale-nonce=600', 'log-file=stdout'
    )
    $taskLines | Set-Content -LiteralPath (Join-Path $Root '.local\streaming\turnserver.conf') -Encoding ascii
}

function Set-ZeroHourTurnEnvironment([string]$Root, [string]$LanAddress, [switch]$Enable) {
    $taskEnvPath = Join-Path $Root '.local\streaming\compose.env'
    $taskLines = @(Get-Content -LiteralPath $taskEnvPath | Where-Object { $_ -notmatch '^ZH_STREAM_TURN_(URL|SECRET_FILE)=' })
    if ($Enable) {
        $taskLines += "ZH_STREAM_TURN_URL=turn:$($LanAddress):3478?transport=udp"
        $taskLines += 'ZH_STREAM_TURN_SECRET_FILE=/run/secrets/turn-secret'
    } else {
        $taskLines += 'ZH_STREAM_TURN_URL='
        $taskLines += 'ZH_STREAM_TURN_SECRET_FILE='
    }
    [IO.File]::WriteAllLines($taskEnvPath, $taskLines, [Text.UTF8Encoding]::new($false))
}

function Test-ZeroHourTurnDataChannel([string]$Docker, [string]$Root) {
    Invoke-ZeroHourCompose -Docker $Docker -Root $Root -Arguments @('exec','-T','friend','python3','/app/tools/streaming/verify-turn-allocation.py')
}

function Wait-ZeroHourChromium([string]$Docker, [string]$Root) {
    $taskDeadline = [DateTime]::UtcNow.AddSeconds(30)
    while ([DateTime]::UtcNow -lt $taskDeadline) {
        $taskContainer = & $Docker compose --project-name zero-hour-streaming --env-file (Join-Path $Root '.local\streaming\compose.env') --file (Join-Path $Root 'compose.streaming.wsl.yaml') ps -q friend
        if ($LASTEXITCODE -ne 0 -or !$taskContainer -or (& $Docker inspect --format '{{.State.Running}}' $taskContainer).Trim() -ne 'true') {
            throw 'The streamed browser container stopped before Chromium became ready.'
        }
        $taskReady = Invoke-ZeroHourCompose -Docker $Docker -Root $Root -Arguments @('exec','-T','friend','python3','/app/tools/streaming/chromium-ready.py')
        if (($taskReady -join '').Trim() -eq 'ready') { Write-Host 'Chromium browser readiness passed.'; return }
        Start-Sleep -Milliseconds 500
    }
    throw 'Chromium did not expose its local browser endpoint. Inspect the friend service logs.'
}
