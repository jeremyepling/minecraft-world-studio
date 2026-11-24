# Installing and using the local client

This evaluation uses Minecraft Java 26.3, Fabric Loader 0.20.1, Fabric API 0.167.0+26.3, MCPFabric 0.10.0+26.3, WorldEdit 7.4.6 and Axiom 6.1.5. All four mod files have published Fabric builds for 26.3, a current Frenchies target. The client log reports the versions and WorldEdit's Fabric platform registering. Axiom showed its welcome screen on first world entry. [Release URLs and SHA-512 hashes](../scripts/mods-26.3.json)

## Reproduce on Windows x64

Use PowerShell 7, Java 25 on PATH, and Node 22.16 or newer. At evaluation time the PATH resolved Java 25.0.1.8 from Eclipse Adoptium. Installed JDKs also included Adoptium 17/21 and Microsoft 21. JAVA_HOME pointed at JDK 21. Pass an explicit JDK 25 executable to both client scripts when necessary. The vanilla launcher, Modrinth and Gradle Loom already had Minecraft caches. Only ordinary game artifacts were reused as read-only download sources during initial setup. A fresh installation can download them with PortableMC. This project uses an offline local test identity named WorldStudio with a stable UUID. No Microsoft account session or existing save is needed for this singleplayer evaluation.

From the repository root run these commands.

```powershell
.\scripts\Install-Client.ps1
.\scripts\Install-Bridge.ps1
.\scripts\Start-Client.ps1
```

The installer verifies each mod digest and the PortableMC 5.0.6 Windows archive, and asks PortableMC to install Mojang/Fabric runtime files. Saves, options, agent data, bridge credentials and mod jars live under the ignored local directory. The separate launcher cache is local/game. The game directory is local/instance. Project instructions for the local stdio server and Codex configuration are in the [README](../README.md). [PortableMC release](https://github.com/theorzr/portablemc/releases/tag/v5.0.6)

On a fresh install choose **Singleplayer → Create New World** (an empty instance opens creation directly). Name it **WorldStudioLab**, select **Creative**, confirm **Allow Commands: ON** and choose **Create New World**. For the same terrain, select the **World** tab, retain the default world type and enter the seed `-8552018580008125303`. This value was read from the running save with the vanilla seed command. Choosing another seed changes the road and terrain results. Axiom's first-run welcome screen can pause the integrated server. Dismiss it before timing edits. Use this save exclusively for the tests. Subsequent launches request this save automatically.

Use **Esc → Save and Quit to Title → Quit Game** to stop. For a backup, close the client fully and copy the entire local/instance/saves/WorldStudioLab directory into a new private local/backups folder. Keep all dimension and player subdirectories. To verify restoration without affecting current work, copy the backup into a new, distinct save folder while the client is closed, then open that copy intentionally and check landmarks. A copy has a different MCPFabric world identity. The Studio evaluation scripts pin sp:WorldStudioLab.

## Bridge and permissions

The client listens on 127.0.0.1:25639. Only its local/instance/config/mcpfabric.config.json supplies this project's bearer credentials. Automatic discovery is disabled. Local files under local/ contain secrets and should stay private. After starting Codex in the project, ask for agent_brief and get_self and verify the disposable world and player before an edit. Restarting restores the same save identity and credentials. The creative command path has owner-level privileges. The players_admin approval group gates native player administration, including message_player and teleport_player. show_message displays a local notification without that gate. A vanilla command can independently perform administrative operations. Treat the fixed world/port and private token as the boundary for this disposable installation.

Generic UI automation and multiplayer are disabled by default. The server runs stdio under Codex. Leaving the world keeps the client bridge up at the title screen; closing the client removes its listener. Start the client again and reopen a project Codex session to rediscover the configured MCP server when needed. No Frenchies/other mod checkout or global launcher profile is needed.
