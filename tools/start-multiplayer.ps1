param([switch]$Quiet)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$sessionDirectory = Join-Path $projectRoot '.local\preview-server'
$sessionPath = Join-Path $sessionDirectory 'session.json'
$localUrl = 'http://127.0.0.1:8096'
$runtime = '3ccaa0e9-compiled-combined-v6-rf1'
$tunnelLog = Join-Path $sessionDirectory 'tunnel.log'
$tunnelErrorLog = Join-Path $sessionDirectory 'tunnel-error.log'

function Normalize-ProcessEnvironment {
    # CMD sometimes supplies both Path and PATH; Start-Process rejects duplicates.
    $processEnvironment = [Environment]::GetEnvironmentVariables('Process')
    $groups = $processEnvironment.Keys | Group-Object { $_.ToUpperInvariant() } | Where-Object { $_.Count -gt 1 }
    foreach ($group in $groups) {
        $variableName = [string]$group.Group[0]
        $variableValue = [string]$processEnvironment[$variableName]
        foreach ($duplicate in $group.Group) { [Environment]::SetEnvironmentVariable([string]$duplicate, $null, 'Process') }
        [Environment]::SetEnvironmentVariable($variableName, $variableValue, 'Process')
    }
}

function Test-LocalServer {
    try {
        $config = (Invoke-WebRequest -UseBasicParsing -Uri "$localUrl/network-config.json" -TimeoutSec 2).Content | ConvertFrom-Json
        return ($config.runtime -eq $runtime -and $config.rooms -eq '/rooms' -and $config.signaling -eq '/nostr')
    } catch { return $false }
}

function Test-WebsiteOrigin {
    $socket = New-Object System.Net.WebSockets.ClientWebSocket
    $cancellation = New-Object System.Threading.CancellationTokenSource
    try {
        $socket.Options.SetRequestHeader('Origin', 'https://mustafamarroun-glitch.github.io')
        $cancellation.CancelAfter(4000)
        $socket.ConnectAsync([Uri]'ws://127.0.0.1:8096/rooms', $cancellation.Token).GetAwaiter().GetResult()
        return ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open)
    } catch { return $false }
    finally { $socket.Abort(); $socket.Dispose(); $cancellation.Dispose() }
}

function Get-TrackedProcess($processId, $startedAt) {
    if (!$processId -or !$startedAt) { return $null }
    $tracked = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($tracked -and $tracked.StartTime.ToUniversalTime().Ticks -eq ([DateTime]$startedAt).ToUniversalTime().Ticks) { return $tracked }
    return $null
}

try {
    New-Item -ItemType Directory -Path $sessionDirectory -Force | Out-Null
    Normalize-ProcessEnvironment
    $session = @{ serverPid = $null; serverStartedAt = $null; tunnelPid = $null; tunnelStartedAt = $null; publicUrl = $null }
    if (Test-Path -LiteralPath $sessionPath) {
        $saved = Get-Content -LiteralPath $sessionPath -Raw | ConvertFrom-Json
        foreach ($key in @($session.Keys)) { $session[$key] = $saved.$key }
    }

    if (!(Test-LocalServer)) {
        Write-Output 'Starting Zero Hour room and signaling server on port 8096...'
        $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
        $nodePath = if ($nodeCommand) { $nodeCommand.Source } else { $null }
        if (!$nodePath) {
            $nodePath = @(
                (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
                (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
            ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
        }
        if (!$nodePath) { throw 'Node.js was not found. Install Node.js 22 or newer.' }
        $env:HOST = '127.0.0.1'
        $env:PORT = '8096'
        $env:SITE_ROOT = Join-Path $projectRoot 'public'
        $env:ALLOWED_ORIGINS = 'https://mustafamarroun-glitch.github.io,http://localhost:8096,http://127.0.0.1:8096,http://localhost:8093,http://127.0.0.1:8093'
        $env:ROOMS_URL = '/rooms'
        $env:SIGNALING_URL = '/nostr'
        $server = Start-Process -FilePath $nodePath -ArgumentList 'tools/server.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $sessionDirectory 'server.log') -RedirectStandardError (Join-Path $sessionDirectory 'server-error.log') -PassThru
        $session.serverPid = $server.Id
        $session.serverStartedAt = $server.StartTime.ToUniversalTime().ToString('o')
        $session | ConvertTo-Json | Set-Content -LiteralPath $sessionPath -Encoding UTF8
        $deadline = (Get-Date).AddSeconds(20)
        while (!(Test-LocalServer)) {
            $server.Refresh()
            if ($server.HasExited) { throw "Server startup failed. See $sessionDirectory\server-error.log" }
            if ((Get-Date) -ge $deadline) { throw 'The local server did not respond within 20 seconds.' }
            Start-Sleep -Milliseconds 300
        }
    }
    if (!(Test-WebsiteOrigin)) { throw 'Port 8096 is running, but it does not accept the GitHub website. Close the server window using port 8096, then run this launcher again.' }
    Write-Output 'Local server is responding and accepts the GitHub website.'

    $tunnel = Get-TrackedProcess $session.tunnelPid $session.tunnelStartedAt
    if (!$tunnel) {
        $connector = Join-Path $sessionDirectory 'cloudflared.exe'
        if (!(Test-Path -LiteralPath $connector)) { throw "Cloudflare connector is missing: $connector" }
        if ((Get-FileHash -LiteralPath $connector -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'f096265ec2fcbe9bb6e2d64268db167ced3fcbb83d894bdb9e2fcdb26f2ea7e2') { throw 'Cloudflare connector checksum does not match the verified copy.' }
        Write-Output 'Starting public Cloudflare tunnel. This can take up to a minute...'
        $emptyConfig = Join-Path $sessionDirectory 'tunnel-config.yml'
        Set-Content -LiteralPath $emptyConfig -Value '{}' -Encoding ASCII
        $arguments = @('tunnel', '--config', ('"' + $emptyConfig + '"'), '--url', $localUrl, '--no-autoupdate', '--protocol', 'http2', '--edge-ip-version', '4')
        $tunnel = Start-Process -FilePath $connector -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $tunnelLog -RedirectStandardError $tunnelErrorLog -PassThru
        $session.tunnelPid = $tunnel.Id
        $session.tunnelStartedAt = $tunnel.StartTime.ToUniversalTime().ToString('o')
        $session.publicUrl = $null
        $session | ConvertTo-Json | Set-Content -LiteralPath $sessionPath -Encoding UTF8
    }

    $deadline = (Get-Date).AddSeconds(60)
    $registered = $false
    do {
        $tunnel.Refresh()
        if ($tunnel.HasExited) { throw "Cloudflare tunnel stopped. See $tunnelErrorLog" }
        $log = (Get-Content -LiteralPath $tunnelErrorLog -Raw -ErrorAction SilentlyContinue) + (Get-Content -LiteralPath $tunnelLog -Raw -ErrorAction SilentlyContinue)
        $urlMatch = [regex]::Match($log, 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($urlMatch.Success) { $session.publicUrl = $urlMatch.Value }
        $registered = $log -match 'Registered tunnel connection'
        if ($session.publicUrl -and $registered) { break }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)
    $session | ConvertTo-Json | Set-Content -LiteralPath $sessionPath -Encoding UTF8
    if (!$session.publicUrl -or !$registered) { throw "The public tunnel has not connected yet. It is still retrying in the background. Run this launcher again to check it. Logs: $tunnelErrorLog" }

    $websocketUrl = $session.publicUrl -replace '^https:', 'wss:'
    $publicConfig = [ordered]@{ temporaryService = $true; runtime = $runtime; rooms = "$websocketUrl/rooms"; iceServers = @(); signaling = "$websocketUrl/nostr"; yuriRelay = $websocketUrl }
    $configPath = Join-Path $sessionDirectory 'network-config.json'
    $publicConfig | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
    $infoPath = Join-Path $sessionDirectory 'READ-ME.txt'
    $info = @"
Zero Hour and Yuri preview multiplayer service and public tunnel are running.

Public address: $($session.publicUrl)
Local game: http://localhost:8096/

FOR THE GITHUB WEBSITE:
Open https://github.com/mustafamarroun-glitch/zero-hour-web/edit/main/public/network-config.json
Replace its contents with the nearby network-config.json, commit to main,
wait for GitHub Actions to finish, then reload the game website.
This launcher does not publish changes to GitHub.

The temporary address changes when a new tunnel is created.
Both background processes must stay running and this PC must stay awake.
Closing the launcher window keeps the server and tunnel running.
Local readiness and tunnel registration do not prove a completed multiplayer match.
Logs and process details: $sessionDirectory
"@
    Set-Content -LiteralPath $infoPath -Value $info -Encoding UTF8
    Write-Output "`nServer and tunnel are running in the background."
    Write-Output "Public address: $($session.publicUrl)"
    Write-Output "`nPaste this configuration into GitHub's public/network-config.json:"
    Write-Output ($publicConfig | ConvertTo-Json)
    Write-Output "`nSaved configuration: $configPath"
    Write-Output "Instructions: $infoPath"
    Write-Output 'You can close this window; both background processes will keep running.'
} catch {
    $message = "Could not complete multiplayer startup: $($_.Exception.Message)"
    Set-Content -LiteralPath (Join-Path $sessionDirectory 'startup-error.log') -Value $message -Encoding UTF8 -ErrorAction SilentlyContinue
    [Console]::Error.WriteLine($message)
    if (!$Quiet) { Write-Output "Logs: $sessionDirectory" }
    exit 1
}
