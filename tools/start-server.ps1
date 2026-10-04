param([switch]$Quiet)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$serverUrl = 'http://localhost:8093/'
$logDirectory = Join-Path $projectRoot '.local\server'
$outputLog = Join-Path $logDirectory 'stdout.log'
$errorLog = Join-Path $logDirectory 'stderr.log'

function Test-ServerReady {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8093/network-config.json' -TimeoutSec 2
        $config = $response.Content | ConvertFrom-Json
        return ($response.StatusCode -eq 200 -and $config.rooms -eq '/rooms' -and $config.signaling -eq '/nostr' -and $config.runtime -eq '3ccaa0e9-compiled-combined-v6')
    } catch { return $false }
}

try {
    if (!(Test-ServerReady)) {
        $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
        $nodePath = if ($nodeCommand) { $nodeCommand.Source } else { $null }
        if (!$nodePath) {
            $candidates = @(
                (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
                (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
            )
            $nodePath = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
        }
        if (!$nodePath) { throw 'Node.js was not found. Install Node.js 22 or newer and try again.' }
        New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
        $env:HOST = '127.0.0.1'
        $env:PORT = '8093'
        $env:SITE_ROOT = Join-Path $projectRoot 'public'
        # CMD can pass differently cased copies of an environment variable.
        # Windows PowerShell's Start-Process rejects those duplicate keys.
        $processEnvironment = [Environment]::GetEnvironmentVariables('Process')
        $duplicateGroups = $processEnvironment.Keys | Group-Object { $_.ToUpperInvariant() } | Where-Object { $_.Count -gt 1 }
        foreach ($group in $duplicateGroups) {
            $variableName = [string]$group.Group[0]
            $variableValue = [string]$processEnvironment[$variableName]
            foreach ($duplicateName in $group.Group) { [Environment]::SetEnvironmentVariable([string]$duplicateName, $null, 'Process') }
            [Environment]::SetEnvironmentVariable($variableName, $variableValue, 'Process')
        }
        $serverProcess = Start-Process -FilePath $nodePath -ArgumentList 'tools/server.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -PassThru
        $deadline = (Get-Date).AddSeconds(20)
        do {
            if (Test-ServerReady) { break }
            $serverProcess.Refresh()
            if ($serverProcess.HasExited) {
                $details = if (Test-Path -LiteralPath $errorLog) { Get-Content -LiteralPath $errorLog -Raw } else { '' }
                throw "The server exited during startup.`n$details"
            }
            Start-Sleep -Milliseconds 300
        } while ((Get-Date) -lt $deadline)
        if (!(Test-ServerReady)) { throw "The server did not respond within 20 seconds. Check $errorLog" }
        Set-Content -LiteralPath (Join-Path $logDirectory 'server.pid') -Value $serverProcess.Id
    }
    Write-Output "Zero Hour server is running at $serverUrl"
} catch {
    $message = "Could not start the Zero Hour server.`n`n$($_.Exception.Message)"
    try {
        New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $logDirectory 'startup-error.log') -Value $message
    } catch { }
    if (!$Quiet) {
        $popup = New-Object -ComObject WScript.Shell
        $popup.Popup($message, 0, 'Zero Hour Server', 16) | Out-Null
    }
    [Console]::Error.WriteLine($message)
    exit 1
}
