param([string]$Image = 'zero-hour-wsl-stream:local', [switch]$LegacySelkies)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'tools\streaming\common.ps1')
$taskDocker = Get-ZeroHourDocker
$taskState = Join-Path $PSScriptRoot '.local\streaming'
New-Item -ItemType Directory -Force -Path $taskState | Out-Null
$taskInfo = & $taskDocker info --format '{{.OSType}}' 2>$null
if ($LASTEXITCODE -ne 0 -or $taskInfo.Trim() -ne 'linux') { throw 'Start Docker Desktop and wait for its Linux engine, then retry.' }
# Use the exact local image ID for this probe; a tag changing during a later
# start cannot substitute a different pipeline for the one that passed.
$taskImageId = & $taskDocker image inspect $Image --format '{{.Id}}' 2>$null
if ($LASTEXITCODE -ne 0) { throw "Image $Image is not cached. Run docker pull $Image, then retry." }
$taskImageId = $taskImageId.Trim()
$taskProbePath = (Join-Path $PSScriptRoot 'tools\streaming').Replace('\', '/')
if (!$LegacySelkies) {
    $taskChecks = @('wsl-gpu-probe.py','chromium-gpu-probe.py','nvenc.py')
    $taskProof = @()
    foreach ($taskCheck in $taskChecks) {
        $taskOutput = Join-Path $taskState "$taskCheck.json"
        $taskDiagnostics = Join-Path $taskState "$taskCheck.stderr.log"
        $taskPreviousPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & $taskDocker run --rm --network none --gpus all --env NVIDIA_DRIVER_CAPABILITIES=all --device /dev/dxg --mount type=bind,source=/usr/lib/wsl/lib,target=/usr/lib/wsl/lib,readonly --mount type=bind,source=/usr/lib/wsl/drivers,target=/usr/lib/wsl/drivers,readonly --mount "type=bind,source=$taskProbePath,target=/probe,readonly" --env LD_LIBRARY_PATH=/usr/lib/wsl/lib --env GALLIUM_DRIVER=d3d12 --env MESA_LOADER_DRIVER_OVERRIDE=d3d12 --env MESA_D3D12_DEFAULT_ADAPTER_NAME=NVIDIA --entrypoint python3 $taskImageId "/probe/$taskCheck" 1>$taskOutput 2>$taskDiagnostics
            $taskExit = $LASTEXITCODE
        } finally { $ErrorActionPreference = $taskPreviousPreference }
        $taskResult = Get-Content -LiteralPath $taskOutput -Raw | ConvertFrom-Json
        if ($taskExit -ne 0 -or !$taskResult.passed) { throw "WSL GPU check $taskCheck failed. No session started. Inspect $taskOutput and $taskDiagnostics." }
        $taskProof += $taskResult
    }
    @{status='capability-passed'; mode='wsl'; imageId=$taskImageId; scope='Hardware capability only; game, stream and Mac 60 FPS acceptance pending'; checks=$taskProof} | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath (Join-Path $taskState 'wsl-capability.json') -Encoding UTF8
    Write-Host 'WSL NVIDIA rendering, independent Chromium WebGL and the bridge NVENC encoder passed.'
    Write-Host 'Actual game performance, LAN playback and input latency still require acceptance testing.'
    return
}
$taskOutputPath = Join-Path $taskState 'gpu-probe.json'
$taskErrorPath = Join-Path $taskState 'gpu-probe-stderr.log'
# Windows PowerShell treats native stderr as ErrorRecords even with redirection.
# Capture its diagnostics and inspect the actual exit code on both PS 5.1/7.
$taskPreviousPreference = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    & $taskDocker run --rm --network none --gpus all --env NVIDIA_DRIVER_CAPABILITIES=all --mount "type=bind,source=$taskProbePath,target=/probe,readonly" --entrypoint python3 $taskImageId /probe/gpu-probe.py 1>$taskOutputPath 2>$taskErrorPath
    $taskExit = $LASTEXITCODE
} finally { $ErrorActionPreference = $taskPreviousPreference }
if (!(Test-Path -LiteralPath $taskOutputPath) -or !(Get-Item -LiteralPath $taskOutputPath).Length) { throw "GPU probe could not run. Inspect $taskErrorPath" }
try { $taskReport = Get-Content -LiteralPath $taskOutputPath -Raw | ConvertFrom-Json } catch { throw "GPU probe did not return valid JSON. Inspect $taskErrorPath" }
$taskReport | Add-Member -NotePropertyName imageId -NotePropertyValue $taskImageId -Force
$taskReport | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $taskOutputPath -Encoding UTF8
if ($taskExit -ne 0 -or $taskReport.status -ne 'capability-passed') {
    Write-Host 'GPU streaming is blocked. No friend session was started.'
    foreach ($blocker in $taskReport.blockers) { Write-Host "- $blocker" }
    Write-Host "Evidence: $taskOutputPath"
    Write-Host "Native encoder diagnostics: $taskErrorPath"
    throw 'Hardware rendering and NVENC must both pass; software fallback is disabled.'
}
Write-Host 'Selkies hardware rendering and NVENC H.264 capability passed.'
Write-Host 'Actual 60 FPS game performance and Mac playback still require acceptance testing.'
