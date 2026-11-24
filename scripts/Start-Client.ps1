#Requires -Version 7
[CmdletBinding()]
param([string]$Java = (Get-Command java.exe -ErrorAction Stop).Source)
$ErrorActionPreference = 'Stop'
$local = Join-Path (Split-Path $PSScriptRoot) 'local'
$instance = Join-Path $local 'instance'
$config = Get-Content -LiteralPath (Join-Path $instance 'config/mcpfabric.config.json') -Raw | ConvertFrom-Json
if ($config.host -ne '127.0.0.1' -or $config.port -ne 25639 -or $config.requireAuth -ne $true -or
    $config.writeDiscoveryFile -ne $false -or !$config.token) {
    throw 'Check the project-private bridge settings before launching.'
}
$listener = [Net.Sockets.TcpClient]::new()
try {
    $occupied = $false
    try { $listener.Connect('127.0.0.1',25639); $occupied=$true } catch [Net.Sockets.SocketException] {}
    if ($occupied) { throw 'Port 25639 already has a listener. Use the running instance or stop it first.' }
} finally { $listener.Dispose() }
$arguments = @('--main-dir',(Join-Path $local 'game'),'start','fabric:26.3:0.20.1','--mc-dir',$instance,
    '--jvm',$Java,'--jvm-arg=-Xmx4G','--username','WorldStudio','--uuid','e9561547-9212-401e-b04b-98f4341cb816',
    '--disable-multiplayer','--resolution','1280x720','--fetch-exclude-all')
if (Test-Path -LiteralPath (Join-Path $instance 'saves/WorldStudioLab/level.dat')) {
    $arguments += @('--join-world','WorldStudioLab')
}
Push-Location -LiteralPath $instance
try {
    & (Join-Path $local 'launcher/portablemc.exe') @arguments
    if ($LASTEXITCODE) {throw "PortableMC exited with code $LASTEXITCODE"}
} finally { Pop-Location }
