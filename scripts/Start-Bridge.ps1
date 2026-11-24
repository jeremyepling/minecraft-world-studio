param([ValidateSet('studio', 'all', 'build')] [string]$Profile = 'studio')
$ErrorActionPreference = 'Stop'
$node = @("$env:ProgramFiles/nodejs/node.exe", (Get-Command node.exe).Source) | Where-Object {
    if (Test-Path -LiteralPath $_) { [version]((& $_ --version).TrimStart('v')) -ge [version]'22.16.0' }
} | Select-Object -First 1
if (!$node) { throw 'Install Node.js 22.16 or later with node:sqlite support.' }
& $node (Join-Path $PSScriptRoot 'bridge.mjs') $Profile
exit $LASTEXITCODE
