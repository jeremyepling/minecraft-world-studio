#Requires -Version 7
[CmdletBinding()]
param([string]$Java = (Get-Command java.exe -ErrorAction Stop).Source)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
$local = Join-Path $root 'local'
$game = Join-Path $local 'game'
$mods = Join-Path $local 'instance/mods'
$client = Join-Path $game 'versions/26.3/26.3.jar'
$manifest = Get-Content -Raw (Join-Path $PSScriptRoot 'mods-26.3.json') | ConvertFrom-Json
$apiMod = $manifest | Where-Object project -eq 'fabric-api'
$apiJar = Join-Path $mods $apiMod.file
if (!(Test-Path -LiteralPath $client) -or !(Test-Path -LiteralPath $apiJar)) {
    throw 'Run Install-Client.ps1 first to install the Minecraft 26.3 and Fabric dependencies.'
}

$jdk = Split-Path (Get-Command $Java -ErrorAction Stop).Source
$javac = Join-Path $jdk 'javac.exe'
$jar = Join-Path $jdk 'jar.exe'
if (!(Test-Path -LiteralPath $javac) -or !(Test-Path -LiteralPath $jar)) {
    throw 'Pass -Java with the path to java.exe in a JDK 25 installation.'
}
$sources = @(Get-ChildItem -LiteralPath (Join-Path $root 'client/src/main/java') -Filter '*.java' -File -Recurse)
$resources = Join-Path $root 'client/src/main/resources'
$stage = Join-Path $local ('menu-build-' + [guid]::NewGuid().ToString('N'))
$classes = Join-Path $stage 'classes'
$api = Join-Path $stage 'api'
New-Item -ItemType Directory -Path $classes,$api -Force | Out-Null
try {
    # Fabric ships its API modules as nested jars. Keep them on the compiler
    # classpath only. Fabric Loader already provides these modules in game.
    $archive = [IO.Compression.ZipFile]::OpenRead($apiJar)
    try {
        foreach ($entry in $archive.Entries) {
            if ($entry.FullName -match '^META-INF/jars/[^/]+\.jar$') {
                [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $api $entry.Name))
            }
        }
    } finally { $archive.Dispose() }
    $libraries = @(Get-ChildItem -LiteralPath (Join-Path $game 'libraries') -Filter '*.jar' -File -Recurse)
    $classpath = (@($client, (Join-Path $api '*')) + $libraries.FullName) -join [IO.Path]::PathSeparator
    & $javac --release 25 -proc:none -encoding UTF-8 -classpath $classpath -d $classes $sources.FullName
    if ($LASTEXITCODE) { throw "World Studio menu compilation failed with exit $LASTEXITCODE." }
    $built = Join-Path $stage 'worldstudio-menu.jar'
    & $jar --create --file $built --date=2026-01-01T00:00:00Z -C $classes . -C $resources .
    if ($LASTEXITCODE) { throw "World Studio menu packaging failed with exit $LASTEXITCODE." }
    $destination = Join-Path $mods 'worldstudio-menu.jar'
    if ((Test-Path -LiteralPath $destination) -and
        (Get-FileHash -LiteralPath $destination).Hash -eq (Get-FileHash -LiteralPath $built).Hash) {
        Write-Output "Already installed $destination"
        return
    }
    [IO.File]::Move($built, $destination, $true)
    Write-Output "Installed $destination"
} finally {
    $resolvedStage = (Resolve-Path -LiteralPath $stage).Path
    if ((Split-Path $resolvedStage) -eq (Resolve-Path -LiteralPath $local).Path -and
        (Split-Path $resolvedStage -Leaf) -match '^menu-build-[0-9a-f]{32}$') {
        Remove-Item -LiteralPath $resolvedStage -Force -Recurse
    }
}
