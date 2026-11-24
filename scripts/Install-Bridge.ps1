$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
$local = Join-Path $root 'local'
$bundle = Join-Path $local 'server.mcpb'
$server = Join-Path $local 'server'
$sha = 'FA72ACFB810259D3BB91CA1FDE0080C53648F858F8B40781EA00807CCF523681'
New-Item -ItemType Directory -Force -Path $local | Out-Null
& (Join-Path $PSScriptRoot 'Protect-Local.ps1')
if (!(Test-Path -LiteralPath $bundle)) {
    Invoke-WebRequest 'https://github.com/denfry/mcpfabric/releases/download/v0.10.0/mcpfabric-0.10.0.mcpb' -OutFile $bundle
}
if ((Get-FileHash $bundle).Hash -ne $sha) { throw 'Unexpected MCPFabric release hash. Inspect local/server.mcpb.' }
if (!(Test-Path -LiteralPath $server)) {
    Expand-Archive -LiteralPath $bundle -DestinationPath $server
}
if (!(Test-Path -LiteralPath (Join-Path $server 'server/index.js'))) { throw 'Incomplete server extraction.' }
$node = @("$env:ProgramFiles/nodejs/node.exe", (Get-Command node.exe).Source) | Where-Object {
    if (Test-Path -LiteralPath $_) { [version]((& $_ --version).TrimStart('v')) -ge [version]'22.16.0' }
} | Select-Object -First 1
if (!$node) { throw 'Install Node.js 22.16 or newer.' }
$configDir = Join-Path $root '.codex'
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
$config = Join-Path $configDir 'config.toml'
$section = "[mcp_servers.worldstudio]"
$entry = @"
$section
command = '$node'
args = ['$(Join-Path $PSScriptRoot 'bridge.mjs')', 'studio']
tool_timeout_sec = 330
startup_timeout_sec = 30
enabled_tools = ['agent_brief', 'get_status', 'list_capabilities', 'get_self', 'look_at', 'raycast', 'describe_scene', 'get_block', 'get_blocks_region', 'find_blocks', 'map_view', 'observe', 'surroundings', 'screenshot', 'set_block', 'fill_blocks', 'run_command', 'build_plan', 'build_structure', 'build_verify', 'send_chat', 'show_message', 'message_player', 'get_recent_chat', 'poll_events', 'run_script', 'save_skill', 'run_skill', 'list_skills', 'remember', 'recall', 'memory_update', 'job_status', 'job_cancel']
"@
if (Test-Path -LiteralPath $config) {
    $old = [IO.File]::ReadAllText($config)
    if ($old.Contains($entry)) { return }
    if ($old -match '(?m)^\s*\[mcp_servers\.worldstudio[.\]]') { throw 'An existing worldstudio entry needs review.' }
    Copy-Item -LiteralPath $config -Destination "$config.$([DateTime]::UtcNow.ToString('yyyyMMddHHmmssffff')).bak"
}
Add-Content -LiteralPath $config -Value ("`n" + $entry) -Encoding utf8
