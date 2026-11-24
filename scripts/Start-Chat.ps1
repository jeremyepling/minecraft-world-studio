#Requires -Version 7
[CmdletBinding(DefaultParameterSetName='Foreground')]
param(
    [Parameter(ParameterSetName='Background')][switch]$Background,
    [Parameter(ParameterSetName='Stop')][switch]$Stop
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
$stateDir = Join-Path $root 'local/chat-loop'
if ($Stop) {
    if (Test-Path -LiteralPath $stateDir) {
        [IO.File]::WriteAllText((Join-Path $stateDir 'stop.request'), '')
        Write-Output 'Requested a graceful stop of the Studio listener.'
    }
    return
}
$node = @("$env:ProgramFiles/nodejs/node.exe", (Get-Command node.exe -ErrorAction SilentlyContinue).Source) |
    Where-Object { $_ -and (Test-Path -LiteralPath $_) -and [version]((& $_ --version).TrimStart('v')) -ge [version]'22.16.0' } |
    Select-Object -First 1
if (!$node) { throw 'The Studio listener needs Node.js 22.16 or newer.' }
$null = Get-Command codex.exe -ErrorAction Stop
$listener = Join-Path $PSScriptRoot 'chat-loop.mjs'
if (!$Background) {
    & $node $listener
    exit $LASTEXITCODE
}
$null = [IO.Directory]::CreateDirectory($stateDir)
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-ffff'
$stdout = Join-Path $stateDir "listener-$stamp.log"
$stderr = Join-Path $stateDir "listener-$stamp.err"
$process = Start-Process -FilePath $node -ArgumentList ('"' + $listener + '"') -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
for ($i=0; $i -lt 35; $i++) {
    if ($process.HasExited) { throw ("Studio listener exited. " + (Get-Content -LiteralPath $stderr -Raw)) }
    if (Select-String -LiteralPath $stdout -Pattern '^Studio ready' -Quiet) {
        Write-Output "Studio ready in Minecraft. Listener PID $($process.Id)."
        return
    }
    Start-Sleep -Milliseconds 200
}
Write-Output "Listener PID $($process.Id) is waiting for WorldStudioLab. Log $stdout"
