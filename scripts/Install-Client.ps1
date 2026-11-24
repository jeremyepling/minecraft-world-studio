#Requires -Version 7
[CmdletBinding()]
param([string]$Java = (Get-Command java.exe -ErrorAction Stop).Source)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
$local = Join-Path $root 'local'
$instance = Join-Path $local 'instance'
$game = Join-Path $local 'game'
$launcher = Join-Path $local 'launcher'
$mods = Join-Path $instance 'mods'
$configDir = Join-Path $instance 'config'
New-Item -ItemType Directory -Force -Path $local | Out-Null
& (Join-Path $PSScriptRoot 'Protect-Local.ps1')
New-Item -ItemType Directory -Force -Path $mods,$configDir,$game,$launcher | Out-Null

function Get-VerifiedFile($url, $destination, $algorithm, $digest) {
    if (!(Test-Path -LiteralPath $destination)) {
        $temp = "$destination.$([guid]::NewGuid().ToString('N')).part"
        try {
            Invoke-WebRequest -Uri $url -OutFile $temp
            if ((Get-FileHash -LiteralPath $temp -Algorithm $algorithm).Hash -ne $digest) {
                throw "Downloaded checksum mismatch for $destination"
            }
            Move-Item -LiteralPath $temp -Destination $destination
        } finally {
            if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp }
        }
    }
    if ((Get-FileHash -LiteralPath $destination -Algorithm $algorithm).Hash -ne $digest) {
        throw "Existing checksum mismatch for $destination. Inspect the file before replacing it."
    }
}
foreach ($mod in (Get-Content -Raw (Join-Path $PSScriptRoot 'mods-26.3.json') | ConvertFrom-Json)) {
    Get-VerifiedFile $mod.url (Join-Path $mods $mod.file) 'SHA512' $mod.sha512
}
$archive = Join-Path $local 'portablemc.zip'
Get-VerifiedFile 'https://github.com/theorzr/portablemc/releases/download/v5.0.6/portablemc-5.0.6-windows-x86_64-msvc.zip' $archive 'SHA256' 'e693a0d05bbf87411ae5c0967e04c2f461ec2005cbbdf6536e4195ff3fafac89'
$exe = Join-Path $launcher 'portablemc.exe'
if (!(Test-Path -LiteralPath $exe)) { Expand-Archive -LiteralPath $archive -DestinationPath $launcher }
$config = Join-Path $configDir 'mcpfabric.config.json'
if (!(Test-Path -LiteralPath $config)) {
    @{
        host='127.0.0.1'; port=25639; requireAuth=$true; writeDiscoveryFile=$false; auditLog=$true
        requireApproval=@('players_admin')
        token=[guid]::NewGuid().ToString('N'); readToken=[guid]::NewGuid().ToString('N')
        worldIdKey=[guid]::NewGuid().ToString('N')
    } | ConvertTo-Json | Set-Content -LiteralPath $config
}
$options = Join-Path $instance 'options.txt'
if (!(Test-Path -LiteralPath $options)) {
    @('onboardAccessibility:false','pauseOnLostFocus:false','tutorialStep:none',
      'renderDistance:8','simulationDistance:6','lang:en_us','maxFps:60') | Set-Content -LiteralPath $options
}
& $exe --main-dir $game start fabric:26.3:0.20.1 --dry --mc-dir $instance --jvm $Java --username WorldStudio --disable-multiplayer
if ($LASTEXITCODE) {throw "PortableMC installation failed with exit $LASTEXITCODE"}
