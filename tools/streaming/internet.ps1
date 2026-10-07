function Get-ZeroHourTunnelProcess([string]$Root) {
    $taskSessionPath = Join-Path $Root '.local\streaming\internet-session.json'
    if (!(Test-Path -LiteralPath $taskSessionPath)) { return $null }
    $taskSaved = Get-Content -LiteralPath $taskSessionPath -Raw | ConvertFrom-Json
    $taskTracked = Get-Process -Id $taskSaved.pid -ErrorAction SilentlyContinue
    if ($taskTracked -and $taskTracked.StartTime.ToUniversalTime().Ticks -eq ([DateTime]$taskSaved.startedAt).ToUniversalTime().Ticks) { return $taskTracked }
    return $null
}

function Stop-ZeroHourInternetTunnel([string]$Root) {
    $taskTunnel = Get-ZeroHourTunnelProcess $Root
    if ($taskTunnel) { Stop-Process -InputObject $taskTunnel }
    $taskPath = Join-Path $Root '.local\streaming\internet-session.json'
    if (Test-Path -LiteralPath $taskPath) {
        $taskSession = Get-Content -LiteralPath $taskPath -Raw | ConvertFrom-Json
        $taskSession | Add-Member -NotePropertyName active -NotePropertyValue $false -Force
        $taskSession | ConvertTo-Json | Set-Content -LiteralPath $taskPath -Encoding UTF8
    }
}

function Get-ZeroHourCloudflared([string]$Root) {
    $taskCommand = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($taskCommand) { return $taskCommand.Source }
    $taskCached = Join-Path $Root '.local\preview-server\cloudflared.exe'
    if (Test-Path -LiteralPath $taskCached) {
        if ((Get-FileHash -LiteralPath $taskCached -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'f096265ec2fcbe9bb6e2d64268db167ced3fcbb83d894bdb9e2fcdb26f2ea7e2') { throw 'The cached Cloudflare connector does not match the verified copy.' }
        return $taskCached
    }
    throw 'Cloudflared is missing. Install the official Cloudflare connector, then run this launcher again.'
}

function Start-ZeroHourInternetTunnel([string]$Root) {
    $taskDirectory = Join-Path $Root '.local\streaming'
    $taskSessionPath = Join-Path $taskDirectory 'internet-session.json'
    $taskTracked = Get-ZeroHourTunnelProcess $Root
    if ($taskTracked) {
        $taskSession = Get-Content -LiteralPath $taskSessionPath -Raw | ConvertFrom-Json
        if ($taskSession.publicUrl) { return $taskSession.publicUrl }
        throw 'The previous streaming tunnel is still starting. Use Stop-Streaming.ps1 before retrying.'
    }
    $taskConnector = Get-ZeroHourCloudflared $Root
    $taskEmptyConfig = Join-Path $taskDirectory 'internet-tunnel.yml'
    '{}' | Set-Content -LiteralPath $taskEmptyConfig -Encoding ASCII
    $taskOutput = Join-Path $taskDirectory 'internet-tunnel.log'
    $taskErrors = Join-Path $taskDirectory 'internet-tunnel-errors.log'
    # This bypass applies only to the self-signed origin on Windows loopback.
    # The public connection still uses Cloudflare's trusted HTTPS certificate.
    $taskArguments = @('tunnel','--config',('"' + $taskEmptyConfig + '"'),'--url','https://127.0.0.1:3002','--no-tls-verify','--no-autoupdate','--protocol','http2','--edge-ip-version','4')
    $taskTunnel = Start-Process -FilePath $taskConnector -ArgumentList $taskArguments -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput $taskOutput -RedirectStandardError $taskErrors -PassThru
    $taskSession = [ordered]@{pid=$taskTunnel.Id;startedAt=$taskTunnel.StartTime.ToUniversalTime().ToString('o');publicUrl=$null;active=$true}
    $taskSession | ConvertTo-Json | Set-Content -LiteralPath $taskSessionPath -Encoding UTF8
    try {
        $taskDeadline = [DateTime]::UtcNow.AddSeconds(55)
        do {
            $taskTunnel.Refresh()
            if ($taskTunnel.HasExited) { throw "The streaming tunnel stopped. See $taskErrors" }
            $taskLog = (Get-Content -LiteralPath $taskOutput -Raw -ErrorAction SilentlyContinue) + (Get-Content -LiteralPath $taskErrors -Raw -ErrorAction SilentlyContinue)
            $taskMatch = [regex]::Match($taskLog,'https://[a-z0-9-]+\.trycloudflare\.com')
            if ($taskMatch.Success -and $taskLog -match 'Registered tunnel connection') {
                $taskPublicReady = $false
                try { Invoke-WebRequest -UseBasicParsing -Uri $taskMatch.Value -TimeoutSec 4 | Out-Null }
                catch {
                    $taskResponseProperty = $_.Exception.PSObject.Properties['Response']
                    if ($taskResponseProperty -and $taskResponseProperty.Value -and [int]$taskResponseProperty.Value.StatusCode -eq 401) { $taskPublicReady = $true }
                }
                if ($taskPublicReady) {
                    $taskSession.publicUrl = $taskMatch.Value
                    $taskSession | ConvertTo-Json | Set-Content -LiteralPath $taskSessionPath -Encoding UTF8
                    return $taskSession.publicUrl
                }
            }
            Start-Sleep -Milliseconds 500
        } while ([DateTime]::UtcNow -lt $taskDeadline)
        throw "The public stream did not become ready in 55 seconds. See $taskErrors"
    } catch { Stop-ZeroHourInternetTunnel $Root; throw }
}
