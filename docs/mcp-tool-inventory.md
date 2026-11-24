# Installed MCPFabric tools

The MCPFabric 0.10.0 release bundle returned **105 entries** in a real stdio `tools/list` request using its full profile. The stock `build` profile returned **17**. The Studio server profile returned **85**, of which the local Codex project configuration selects **34**. Two full-profile entries are MCP Apps panel actions. Tool discovery and individual calls have separate evidence. [Full response with descriptions and JSON Schemas](tools-all.json) · [Stock build names](tools-build.json) · [Studio names](tools-studio.json) · [Project Codex allowlist](../scripts/Install-Bridge.ps1)

The **Tool** link in every row points to its exact installed declaration. Input names ending in `?` are optional. The linked schema supplies types, nested objects, enums, ranges, defaults and exact upstream descriptions. **Visibility** gives the narrowest of the Studio/Codex/full evaluation configurations containing that entry. For the independent stock build configuration, use the 17-name capture above. The server profile is `build,player,operator,agent,script,events`. These lists control discovery. Minecraft checks actual authorization separately. [Server profile](../scripts/bridge.mjs) · [Upstream toolset definitions](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/mcp-server/src/toolsets.ts)

### Reading results and privileges

- Ordinary bridge results carry JSON as both `structuredContent` and text. Rows marked **Game text under `data`** use `{untrusted:true, notice, data}`. “Ack” denotes a result object with `ok` and a short `message`. “Command result” denotes `{command,success,resultValue,output[]}`. Inspect the inner success and actual blocks. A successful MCP response can carry a failed command. Errors generally carry `isError:true` and text. Screenshots, dashboard panels, agent and script tools have the distinct result formats described below. The installed catalog declares input schemas. The result summaries below describe implementation fields, including conditional ones, and are not machine-enforced output schemas. [Result adapters](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/mcp-server/src/index.ts#L41) · [Untrusted game text](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/mcp-server/src/untrusted.ts) · [Command result](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/main/java/dev/mcpfabric/handlers/support/CommandRunner.java#L84)
- **Bridge** requires the authenticated connection. **Server** requires an integrated or dedicated server for that instance. **Client** requires the client side and ordinarily an active local player. Read RPCs on Java's allowlist can use the read token. Other direct RPCs require the full token. **Control**, **Vision**, **UI**, **Write**, **Commands** and **Supervision** refer to the Java config flags for player input, observation, GUI control (also Control), server world writes, server commands and opt-in supervised actions. Ordinary mutating tools are subject to any configured approval group. **Agent** requires the Node agent runtime/SQLite, **Script** the QuickJS tool group. Their component calls retain their own privilege checks. A local DB mutation can succeed independently of world-write permission. [Java allowlist](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/main/java/dev/mcpfabric/bridge/ReadAccess.java) · [Java defaults](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/main/java/dev/mcpfabric/config/McpConfig.java) · [Agent and script registration](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/mcp-server/src/index.ts#L325)
- Agent and script tools normally return human-readable text in `content[]`. A background agent job returns an ID and status with progress/outcome as available. The launch response alone does not verify the world. A supervised receipt normally includes `actionId,operation,target,outcome` plus optional reason, note and action details. A pending or uncertain action needs reconciliation. [Agent jobs](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/mcp-server/src/agent/jobs.ts) · [Supervised receipts](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/main/java/dev/mcpfabric/handlers/support/SupervisedCalls.java#L103)

## 1. Player and spatial context

[LocalPlayerHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/client/java/dev/mcpfabric/client/handlers/LocalPlayerHandlers.java) · [ControlHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/client/java/dev/mcpfabric/client/handlers/ControlHandlers.java) · [NavHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/client/java/dev/mcpfabric/client/handlers/NavHandlers.java) · [PlayerAdminHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/main/java/dev/mcpfabric/handlers/PlayerAdminHandlers.java) · [WorldHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/main/java/dev/mcpfabric/handlers/WorldHandlers.java)

| Tool and description | Inputs | Effect and privileges | Result, building use and constraints | Visibility |
| --- | --- | --- | --- | --- |
| [`get_self`](tools-all.json#L1153)<br>Get local player state | `{}` | Read · Client | Position x/y/z, yaw/pitch, motion, vitals, selectedSlot, dimension and gameMode. Establish the origin of a survey. | Codex |
| [`get_player`](tools-all.json#L774)<br>Get player details | `player` | Read · Server | Named player's position, yaw/pitch, dimension, health, food, mode, ping and XP. Resolve a collaborator by name or UUID. | Studio |
| [`list_players`](tools-all.json#L755)<br>List online players | `{}` | Read · Server | count and players[] with player descriptions. Establish who occupies the test area. | Studio |
| [`look`](tools-all.json#L1289)<br>Set/adjust look angles | `yaw?, pitch?, deltaYaw?, deltaPitch?` | Player · Control | yaw and pitch after clamped rotation. Uses the human camera, including relative angles. | Studio |
| [`look_at`](tools-all.json#L1325)<br>Look at a point | `x, y, z` | Player · Control | yaw and pitch after pointing the player's eye at a world point. Frame a façade from a known position. | Codex |
| [`raycast`](tools-all.json#L288)<br>Raycast from a point | `origin, direction?, yaw?, pitch?, maxDistance?, includeFluids?, includeEntities?, dimension?` | Read · Server | Game text under `data`. hitType, dimension, distance and optional hitPos, face, block or entity. Supply an explicit origin/direction or yaw/pitch. | Codex |
| [`set_movement`](tools-all.json#L1229)<br>Set movement input | `forward?, back?, left?, right?, jump?, sneak?, sprint?` | Player · Control | Ack. Holds the selected inputs across ticks. Stop before the human takes over. | Studio |
| [`stop_movement`](tools-all.json#L1270)<br>Release all movement | `{}` | Player · Client/full | Ack. Releases bot movement. No rollback of position. | Studio |
| [`jump`](tools-all.json#L1362)<br>Jump once | `{}` | Player · Control | Ack. Single jump request, little value for deterministic construction. | Studio |
| [`navigate_to`](tools-all.json#L1808)<br>Navigate to a position | `x, y, z, reachRadius?, sprint?, timeoutSeconds?, allowDig?, allowPillar?, allowSwim?` | Player and possibly blocks · Control | started, pathLength, moves and goal. Digging and pillaring default on, so disable both on surveyed architecture. | Studio |
| [`navigation_status`](tools-all.json#L1877)<br>Navigation status | `{}` | Read · Client | active, state, stuck and optional target, move, distance and remainingNodes. Inspect path progress before moving the camera. | Studio |
| [`stop_navigation`](tools-all.json#L1896)<br>Stop navigation | `{}` | Player · Client/full | Ack. Stops the path and releases movement. | Studio |
| [`travel_to`](tools-all.json#L3229)<br>Travel to a position (job) | `x?, y?, z?, place?, reach?, sprint?, allowDig?, allowPillar?, allowSwim?, waitSeconds?` | Job, player and possibly blocks · Agent + Control | Job report with ID, state/progress and eventual outcome. Can target coordinates or a remembered site. Disable dig/pillar to preserve intervening terrain. | Studio |

## 2. World inspection

[WorldHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/main/java/dev/mcpfabric/handlers/WorldHandlers.java) · [EntityHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/main/java/dev/mcpfabric/handlers/EntityHandlers.java)

| Tool and description | Inputs | Effect and privileges | Result, building use and constraints | Visibility |
| --- | --- | --- | --- | --- |
| [`get_block`](tools-all.json#L41)<br>Get block at position | `x, y, z, dimension?` | Read · Server | Coordinates, id, optional properties, air, liquid, light, hardness and dimension. Read the actual block after a modification. | Codex |
| [`get_blocks_region`](tools-all.json#L82)<br>Scan a cuboid region | `from, to, includeAir?, includeState?, maxBlocks?, dimension?` | Read · Server | dimension, volume, count, truncated and blocks[] with coordinates/id and optional state. Inclusive box, air omitted by default. Check truncation before computing a diff. | Codex |
| [`find_blocks`](tools-all.json#L172)<br>Find nearby blocks by id | `center, radius, blockIds, maxResults?, dimension?` | Read · Server | matches[] with coordinates/id/distance, totalFound, returned, truncated, searchedRadius and dimension. Loaded chunks only. Useful for a bounded water or vegetation survey. | Codex |
| [`list_dimensions`](tools-all.json#L269)<br>List dimensions | `{}` | Read · Server | dimensions[], players[] and optionally playerDimension. Establish the edit dimension explicitly. | Studio |
| [`get_time_and_weather`](tools-all.json#L245)<br>Time & weather | `dimension?` | Read · Server | dimension, dayTime, gameTime, day, raining and thundering. Record conditions when comparing wall samples. | Studio |
| [`query_entities`](tools-all.json#L576)<br>Query entities | `center?, radius?, types?, includePlayers?, onlyLiving?, maxResults?, dimension?` | Read · Server | Game text under `data`. center, centerSource, dimension, total, returned, entities[]. Check inhabitants of an edit box before replacing blocks. | All |
| [`get_entity`](tools-all.json#L651)<br>Get entity details | `uuid` | Read · Server | Game text under `data`. Named entity by UUID with coordinates, type, dimension, motion and optional equipment/vitals. Check a decoration or display entity. | All |

## 3. Mapping and terrain analysis

[AgentTools](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/mcp-server/src/agent/tools.ts) · [PerceptionHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/client/java/dev/mcpfabric/client/handlers/PerceptionHandlers.java) · [WorldMap](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/mcp-server/src/agent/worldmap.ts)

| Tool and description | Inputs | Effect and privileges | Result, building use and constraints | Visibility |
| --- | --- | --- | --- | --- |
| [`observe`](tools-all.json#L2447)<br>Observe surroundings | `radius?, find?` | Read + DB write · Agent + Vision | Text scan with nearby features and changes folded into persistent memory/map. Samples loaded chunks around the player. | Codex |
| [`map_view`](tools-all.json#L2481)<br>Show the explored map | `radius?` | Read · Agent/client | North-up ASCII grid, coordinates and legend. Each glyph represents a chunk, too coarse alone for grading a road. | Codex |
| [`surroundings`](tools-all.json#L2508)<br>What is around me, relative to my view | `radius?, find?, limit?` | Read · Agent + Vision | Text with relative bearings, distances and coordinates for nearby entities, points and requested blocks. Helps disambiguate “on this side.” | Codex |
| [`explore_next`](tools-all.json#L3002)<br>Suggest where to explore | `count?` | Read · Agent/client | Ranked frontier chunks, nearby known approach and distance. Requires previously observed chunks. | Studio |
| [`explore`](tools-all.json#L3295)<br>Explore (job) | `legs?, waitSeconds?` | Job, player + map · Agent + Control + Vision | Job ID/progress and exploration report. Moves the shared player and samples chunks. Prefer observe for a stationary survey. | Studio |

## 4. Screenshots and visual observation

[VisionHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/client/java/dev/mcpfabric/client/handlers/VisionHandlers.java) · [Dashboard](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/mcp-server/src/dashboard/register.ts)

| Tool and description | Inputs | Effect and privileges | Result, building use and constraints | Visibility |
| --- | --- | --- | --- | --- |
| [`screenshot`](tools-all.json#L1746)<br>Capture screenshot | `marks?` | Read · Vision | MCP image and dimension/format text; optional numbered entity legend. Current client framebuffer, including its HUD. Capture needs no player movement. | Codex |
| [`describe_scene`](tools-all.json#L1770)<br>Describe visible scene | `maxDistance?, rayColumns?, rayRows?` | Read · Vision | Game text under `data`. eye, yaw, pitch, lookingAt, ray samples and entities[]. Useful for the block under the crosshair without interpreting pixels. | Codex |
| [`open_dashboard`](tools-all.json#L3747)<br>Open the agent dashboard | `{}` | Read · Agent/client | Text summary plus structured dashboard snapshot. A host with MCP Apps can display map, goals, job and inventory. | Studio |
| [`dashboard_state`](tools-all.json#L3772)<br>Dashboard state | `{}` | Read · Agent/client, app only | Dashboard snapshot with world, at, vitals, goals, job, map, inventory and takenAt. Exposed to the app panel. | Studio |

## 5. Block placement

[WorldHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/main/java/dev/mcpfabric/handlers/WorldHandlers.java) · [InteractHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/client/java/dev/mcpfabric/client/handlers/InteractHandlers.java)

| Tool and description | Inputs | Effect and privileges | Result, building use and constraints | Visibility |
| --- | --- | --- | --- | --- |
| [`set_block`](tools-all.json#L386)<br>Set a block | `x, y, z, blockId, dimension?` | Blocks · Write | Command result plus read-back state. One coordinate per call. Accepts a block state; block data requires Commands. | Codex |
| [`break_block`](tools-all.json#L1419)<br>Break a block | `x, y, z, mode?` | Blocks/player · Control | Mode-dependent broke/started, method or note and possible serverBlock. Operates within player reach and normal breaking rules. | Studio |
| [`place_block`](tools-all.json#L1464)<br>Place held block | `x, y, z, face?` | Blocks/player · Control | Interaction result and placement/target feedback, including server state where available. Clicks a face with the held block. | Studio |
| [`place_block_at`](tools-all.json#L1513)<br>Place held block with a given state | `x, y, z, state` | Blocks/player · Control | Placement prediction/click details and possible matches/serverState. Uses the held item, support and player reach to orient a block. | Studio |

## 6. Bulk editing and commands

[WorldHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/main/java/dev/mcpfabric/handlers/WorldHandlers.java) · [CommandHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/main/java/dev/mcpfabric/handlers/CommandHandlers.java) · [ClientChatHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/client/java/dev/mcpfabric/client/handlers/ClientChatHandlers.java)

| Tool and description | Inputs | Effect and privileges | Result, building use and constraints | Visibility |
| --- | --- | --- | --- | --- |
| [`fill_blocks`](tools-all.json#L432)<br>Fill a region with a block | `from, to, blockId, dimension?` | Blocks · Write | Command result for one inclusive cuboid. Vanilla command limit applies. Verification requires a separate readback. | Codex |
| [`run_command`](tools-all.json#L1041)<br>Run a server command | `command` | Operator · Commands | Game text under `data`. Command result with captured feedback. Uses an entityless source at spawn. Evaluate actor-sensitive WorldEdit operations through player chat. | Codex |

## 7. Construction plans

[AgentTools](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/mcp-server/src/agent/tools.ts) · [Plans](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/mcp-server/src/agent/build.ts) · [BuildJobs](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/mcp-server/src/agent/skills.ts)

| Tool and description | Inputs | Effect and privileges | Result, building use and constraints | Visibility |
| --- | --- | --- | --- | --- |
| [`build_plan`](tools-all.json#L3028)<br>Save a build plan | `name, origin?, rotate?, palette?, layers?, spots?` | DB write or read · Agent/client | Text size/bounds, materials vs inventory and warnings. A name-only query returns a summary. Reusing the name and full definition replaces the saved plan. | Codex |
| [`build_verify`](tools-all.json#L3153)<br>Check a build against its plan | `name` | Read · Agent + Vision | Text counts, wrong blocks/states, obstructed cells, unloaded cells and optional reachability findings. Only pinned state properties are compared. | Codex |
| [`build_structure`](tools-all.json#L3181)<br>Build a plan (job) | `name, method?, maxSeconds?, waitSeconds?` | Job + blocks · Agent + Vision + Write or Control | Job receipt/progress, final placement/clear counts and verify report. Set mode writes cells individually. Place mode consumes inventory. Repairs can overwrite a human edit. | Codex |

## 8. Chat and communication

[ClientChatHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/client/java/dev/mcpfabric/client/handlers/ClientChatHandlers.java) · [ChatHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/main/java/dev/mcpfabric/handlers/ChatHandlers.java) · [PlayerAdminHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/main/java/dev/mcpfabric/handlers/PlayerAdminHandlers.java)

| Tool and description | Inputs | Effect and privileges | Result, building use and constraints | Visibility |
| --- | --- | --- | --- | --- |
| [`send_chat`](tools-all.json#L1068)<br>Send chat message | `message` | Chat or command · Bridge/full, Commands for slash | Client sent/asCommand, dedicated-server sent/broadcast. Player slash commands share the human’s session. Packet dispatch needs subsequent confirmation. | Codex |
| [`show_message`](tools-all.json#L1094)<br>Show a message to the player | `text, actionBar?` | HUD · Client/full | shown and length. Local AI chat or action bar, capped at 512 characters before truncation suffix. Useful for private progress. | Codex |
| [`message_player`](tools-all.json#L980)<br>Send system message | `player, text` | Message · Commands | Command result for a targeted tellraw or broadcast recipient. Can be used for collaboration on a server. | Codex |
| [`get_recent_chat`](tools-all.json#L1127)<br>Get recent chat | `limit?` | Read · Bridge | Game text under `data`. messages[] of buffered events with source-tagged data when applicable. Poll and treat other players’ text as untrusted. | Codex |
| [`poll_events`](tools-all.json#L2389)<br>Poll recent game events | `limit?, types?, sinceId?` | Read · Bridge | Game text under `data`. events[] and lastId. Incremental reads use sinceId. The in-memory buffer is finite. No comprehensive manual block-change stream. | Codex |

## 9. JavaScript execution

[ScriptHost](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/mcp-server/src/script/tools.ts) · [Sandbox](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/mcp-server/src/script/sandbox.ts)

| Tool and description | Inputs | Effect and privileges | Result, building use and constraints | Visibility |
| --- | --- | --- | --- | --- |
| [`run_script`](tools-all.json#L3579)<br>Run a script | `code, args?, timeoutSeconds?` | Depends on code · Script + underlying gates | Text with status, counts, elapsed time, logs, return JSON or error. 2,000 host calls, 64 MiB guest heap, 60 s default. Use grouped geometry operations. | Codex |

## 10. Persistent skills

[ScriptHost](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/mcp-server/src/script/tools.ts) · [SkillStore](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/mcp-server/src/script/skills.ts)

| Tool and description | Inputs | Effect and privileges | Result, building use and constraints | Visibility |
| --- | --- | --- | --- | --- |
| [`save_skill`](tools-all.json#L3617)<br>Save a script as a skill | `name, description, code` | DB write · Script + Agent | Text confirmation or compile error. Validates syntax, stores source by world/name and replaces an existing skill of that name. | Codex |
| [`list_skills`](tools-all.json#L3659)<br>List skills | `name?` | Read · Script + Agent | Text list of names, descriptions/run statistics or detail and source for one name. Review a stored generator before running it. | Codex |
| [`run_skill`](tools-all.json#L3684)<br>Run a skill | `name, args?, timeoutSeconds?` | Depends on code + DB · Script + Agent + underlying gates | Text run report as for run_script, with skill attribution. Accepts JSON args per invocation and updates execution metadata. | Codex |
| [`delete_skill`](tools-all.json#L3720)<br>Delete a skill | `name` | DB write · Script + Agent | Text deletion or missing-name status. Removes the saved program from this world's store. | Studio |

## 11. Memory and project tracking

[AgentTools](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/mcp-server/src/agent/tools.ts) · [Database](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/mcp-server/src/agent/db.ts)

| Tool and description | Inputs | Effect and privileges | Result, building use and constraints | Visibility |
| --- | --- | --- | --- | --- |
| [`agent_brief`](tools-all.json#L2428)<br>Agent brief (resume here) | `{}` | Read · Agent/client | Text summary with world ID, location, vitals, map, job, goals and local memories. Useful for resuming a build. | Codex |
| [`remember`](tools-all.json#L2550)<br>Remember something | `kind?, title, body?, tags?, here?, x?, y?, z?, dimension?, importance?` | DB write · Agent | Text with new entry ID, title, type and optional position. Use for palette preferences or named sites. | Codex |
| [`recall`](tools-all.json#L2623)<br>Search memory | `query?, kind?, tags?, radius?, limit?, ids?, includeGone?, fresh?` | Read · Agent | Ranked text entries, IDs, tags and possible chunk resources. Session deduplication skips repeated details unless fresh is requested. | Codex |
| [`memory_update`](tools-all.json#L2691)<br>Edit or delete a memory | `id, title?, body?, tags?, importance?, status?, delete?` | DB write · Agent | Updated memory text, deletion or missing ID. Edits the note, independent of Minecraft blocks. | Codex |
| [`memory_verify`](tools-all.json#L2751)<br>Verify remembered places | `ids?, radius?` | Read + DB write · Agent + Vision | Checked/invalid counts and per-entry verdicts. Updates validity or observation state for checkable entries. | Studio |
| [`goal_add`](tools-all.json#L2785)<br>Add a goal | `title, parent?, detail?, doneWhen?, priority?, activate?` | DB write · Agent | Text with new goal ID, status, title and optional next item. Supports parent-child plans. | Studio |
| [`goal_update`](tools-all.json#L2838)<br>Update a goal | `id, status?, outcome?, title?, detail?, doneWhen?, priority?, parent?, delete?` | DB write · Agent | Updated goal/deletion and next action text. A planning record carries no ownership over generated cells. | Studio |
| [`goal_list`](tools-all.json#L2916)<br>List goals | `all?` | Read · Agent | Text goal tree and details. Summarize outstanding building tasks. | Studio |

## 12. Safety and supervised execution

[SupervisedHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/main/java/dev/mcpfabric/handlers/SupervisedHandlers.java) · [SupervisedClientHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/client/java/dev/mcpfabric/client/handlers/SupervisedClientHandlers.java) · [SupervisedCalls](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/main/java/dev/mcpfabric/handlers/support/SupervisedCalls.java) · [AgentTools](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/mcp-server/src/agent/tools.ts) · [Dashboard](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/mcp-server/src/dashboard/register.ts)

| Tool and description | Inputs | Effect and privileges | Result, building use and constraints | Visibility |
| --- | --- | --- | --- | --- |
| [`supervised_status`](tools-all.json#L2098)<br>Supervised mode status | `{}` | Read · Supervision | enabled, availability, session, operations, open/recent actions and limits. Check whether supervised mode is actually enabled. | All |
| [`supervised_stop`](tools-all.json#L2117)<br>Stop supervised actions | `{}` | Authority · Bridge/full | Ack. Invalidates existing grants and releases supervised inputs. Already admitted edits can persist. | All |
| [`supervised_input`](tools-all.json#L2136)<br>One supervised input sample | `direction, ticks?` | Player · Supervision/client | Receipt, with ticksHeld and positions when available. One bounded directional sample. | All |
| [`supervised_read_block`](tools-all.json#L2175)<br>Supervised block readback | `x, y, z, dimension?` | Read + action ledger · Supervision/server | Receipt with block details when applied. Requires a full token for the supervised action/session even though the world operation is a read. | All |
| [`supervised_set_block`](tools-all.json#L2219)<br>Supervised block change | `x, y, z, dimension?, block, expect` | Blocks + ledger · Supervision/server | Receipt with before/after IDs and possible output. Expected base block ID is checked game-side. This guard does not detect every block-state change. | All |
| [`supervised_command`](tools-all.json#L2275)<br>Supervised command | `command` | Command + ledger · Supervision/server | Game text under `data`. Receipt, resultValue and output. Restricted to configured command roots and argument policy. | All |
| [`supervised_enter_world`](tools-all.json#L2303)<br>Enter an approved save | `worldId` | Session + ledger · Supervision/client | Receipt, may be pending while opening. The world ID must identify an approved disposable save. | All |
| [`supervised_leave_world`](tools-all.json#L2330)<br>Save and leave the world | `worldId` | Session/save + ledger · Supervision/client | Receipt, may be pending until the save closes. Requires the expected active singleplayer world. | All |
| [`supervised_reconcile`](tools-all.json#L2357)<br>Reconcile a supervised action | `actionId, acknowledge?` | Ledger · Supervision | Receipt with current/rechecked outcome, possibly a reason or note. Acknowledgement can accept an unresolved result without undoing it. | All |
| [`job_status`](tools-all.json#L3427)<br>Job status | `id?, waitSeconds?` | Read · Agent | Text job status, progress, end result/error or no job. Optional bounded wait, scoped to the calling MCP session. | Codex |
| [`job_cancel`](tools-all.json#L3458)<br>Cancel the job | `id?` | Job/player · Agent | Text job cancellation/status. Applies to an owned agent job. Completed world edits persist. | Codex |
| [`dashboard_stop`](tools-all.json#L3800)<br>Stop the agent | `{}` | Job/player · Agent, app only | Text status with possible cleanup failures. Panel cancels job and releases nav/mining/held/supervised inputs. It is not the QuickJS script cancellation API. | Studio |

## 13. Gameplay and inventory

[InventoryHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/client/java/dev/mcpfabric/client/handlers/InventoryHandlers.java) · [InteractHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/client/java/dev/mcpfabric/client/handlers/InteractHandlers.java) · [AgentTools](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/mcp-server/src/agent/tools.ts) · [EntityHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/main/java/dev/mcpfabric/handlers/EntityHandlers.java)

| Tool and description | Inputs | Effect and privileges | Result, building use and constraints | Visibility |
| --- | --- | --- | --- | --- |
| [`get_inventory`](tools-all.json#L1172)<br>Get inventory | `{}` | Read · Client | Game text under `data`. selectedSlot, hotbar, main inventory, armor and offhand with stack IDs/counts. Check the palette before player-style placement. | Studio |
| [`get_equipment`](tools-all.json#L1191)<br>Get equipment | `{}` | Read · Client | Game text under `data`. mainHand, offHand and four armor slot objects. Inspect held construction equipment. | Studio |
| [`get_status_effects`](tools-all.json#L1210)<br>Get active effects | `{}` | Read · Client | effects[] with id, amplifier, durationTicks, ambient, visible. May explain altered demonstration visuals. | Studio |
| [`start_using_item`](tools-all.json#L1381)<br>Start using held item | `{}` | Player/item · Control | Ack. Holds use input. Actual behavior depends on the equipped item. | Studio |
| [`stop_using_item`](tools-all.json#L1400)<br>Stop using held item | `{}` | Player · Client/full | Ack. Releases the use key and stops use. | Studio |
| [`use_item`](tools-all.json#L1556)<br>Use item / right-click | `{}` | Player/world · Control | target and interaction result. Acts in the current context, so inspect the held item and target first. | Studio |
| [`attack_entity`](tools-all.json#L1575)<br>Attack entity | `uuid` | Entity/player · Control | Game text under `data`. Attack/readback fields, optional removed, damaged, serverHealth or reach failure. Low creative value. | Studio |
| [`use_entity`](tools-all.json#L1601)<br>Interact with entity | `uuid` | Entity/player · Control | Game text under `data`. Interaction result or out-of-reach note. Can mount, trade or otherwise act on a targeted entity. | Studio |
| [`drop_held_item`](tools-all.json#L1627)<br>Drop held item | `wholeStack?` | Items/world · Control | Ack. Drops one item or the held stack. Avoid during palette planning. | Studio |
| [`select_hotbar_slot`](tools-all.json#L1651)<br>Select hotbar slot | `slot` | Player · Control | Ack. Selects slot 0–8 for a subsequent placement. | Studio |
| [`drop_slot`](tools-all.json#L1679)<br>Drop a specific slot | `slot, wholeStack?` | Items/world · Control | Ack. Uses inventory slot 0–40. Can drop the entire stack. | Studio |
| [`swap_slots`](tools-all.json#L1712)<br>Swap two inventory slots | `slotA, slotB` | Inventory · Control | Ack. Swaps two slots through inventory menu interactions. | Studio |
| [`plan_craft`](tools-all.json#L2939)<br>Plan a craft | `item, count?, knownOnly?` | Read · Agent/client | Text bill of materials, inventory and steps or missing ingredients. Useful for Survival-oriented palette budgeting. | Studio |
| [`get_recipes`](tools-all.json#L2976)<br>Get recipes for an item | `item` | Read · Agent/client | Text recipes with station/type, result count and ingredient alternatives. Availability depends on server/client recipe data. | Studio |
| [`collect_blocks`](tools-all.json#L3328)<br>Collect blocks (job) | `blocks, count, radius?, maxSeconds?, dig?, waitSeconds?` | Job + blocks/items · Agent + Control + Vision | Job report and eventual collected items/failure. May mine terrain, so keep away from finished work. | Studio |
| [`craft_item`](tools-all.json#L3389)<br>Craft an item (job) | `item, count?, waitSeconds?` | Job + items · Agent + Control | Job state and eventual crafted count/failure. Consumes ingredients and requires suitable recipes/stations. | Studio |
| [`open_container`](tools-all.json#L3483)<br>Open a container | `x, y, z` | Player + DB · Agent + Control + Vision | Text contents, size and memory ID. Opens the in-range container and records it in memory. | Studio |
| [`container_transfer`](tools-all.json#L3520)<br>Move items in/out of the open container | `direction, item?, count?` | Inventory + DB · Agent + Control | Text moved items and current contents. Works against the open container. Can refresh its saved contents. | Studio |
| [`close_container`](tools-all.json#L3560)<br>Close the open container | `{}` | Player · Agent + Control | Text closure acknowledgement. Releases the open container screen. | Studio |
| [`give_item`](tools-all.json#L890)<br>Give item to player | `player, itemId, count?, nbt?` | Items · Commands | Command result. Supply a known material to a test player. | Studio |
| [`apply_effect`](tools-all.json#L932)<br>Apply status effect | `player, effectId, durationSeconds?, amplifier?, showParticles?` | Player · Commands | Command result. Changes a target’s active effects, e.g. for controlled observation. | Studio |
| [`summon_entity`](tools-all.json#L678)<br>Summon entity | `type, x, y, z, nbt?, dimension?` | Entities · Write | Command result. Creates the entity in the specified dimension; custom data requires Commands. | All |
| [`remove_entity`](tools-all.json#L728)<br>Remove entity | `uuid` | Entities · Write | removed and uuid. Refuses a player entity; UUID must resolve. | All |

## 14. Server administration

[InfoHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/main/java/dev/mcpfabric/handlers/InfoHandlers.java) · [SessionScreenHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/client/java/dev/mcpfabric/client/handlers/SessionScreenHandlers.java) · [UiHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/client/java/dev/mcpfabric/client/handlers/UiHandlers.java) · [PlayerAdminHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/main/java/dev/mcpfabric/handlers/PlayerAdminHandlers.java) · [WorldHandlers](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/src/main/java/dev/mcpfabric/handlers/WorldHandlers.java)

| Tool and description | Inputs | Effect and privileges | Result, building use and constraints | Visibility |
| --- | --- | --- | --- | --- |
| [`get_status`](tools-all.json#L3)<br>Server/client status | `{}` | Read · Bridge | Mod/game versions, side, serverPresent, integratedServer, playerCount, aiPaused, requireApproval, capabilities and methods. Verifies bridge liveness independently of world entry. | Codex |
| [`list_capabilities`](tools-all.json#L22)<br>List capabilities | `{}` | Read · Bridge | groups object with booleans by capability. Distinguish registration from active availability. | Codex |
| [`set_time`](tools-all.json#L509)<br>Set time of day | `time` | World · Write | Command result. Standardize lighting between screenshot samples. | Studio |
| [`set_weather`](tools-all.json#L538)<br>Set weather | `weather, durationSeconds?` | World · Write | Command result. Choose clear, rain or thunder. Useful for controlled weather comparisons. | Studio |
| [`teleport_player`](tools-all.json#L801)<br>Teleport player | `player, x, y, z, yaw?, pitch?, dimension?` | Player · Commands | Command result. Affects player position, dimension and optionally orientation. Coordinate camera moves with the human. | Studio |
| [`set_gamemode`](tools-all.json#L853)<br>Set player game mode | `player, mode` | Player · Commands | Command result. Set the disposable player's creative or spectator mode. | Studio |
| [`kick_player`](tools-all.json#L1011)<br>Kick player | `player, reason?` | Server/player · Commands | Command result. Disconnects the named player. Irrelevant in the singleplayer lab. | Studio |
| [`get_screen`](tools-all.json#L1915)<br>Current screen | `{}` | Read · Control | Game text under `data`. inWorld, screen, paused, canJoin and optional title/lastWorldId. Can be called at the title screen. | All |
| [`close_screen`](tools-all.json#L1934)<br>Close the open screen | `{}` | Session · Control | Ack. Behavior depends on screen, including respawn from death. Use only in the isolated instance. | All |
| [`list_worlds`](tools-all.json#L1953)<br>List worlds and servers | `{}` | Read · Control | singleplayer[] and multiplayer[] and optional lastWorldId. Lists the running instance's saves/server list. | All |
| [`join_world`](tools-all.json#L1972)<br>Join a world or server | `worldId?` | Session · Control | joining and note. Opens the selected existing save/server from an appropriate screen. Wait and identify the actual loaded world. | All |
| [`get_ui`](tools-all.json#L1996)<br>List the widgets of the open screen | `{}` | Read · UI | Game text under `data`. screen, widgets[] and optional title, width, height, truncated. Current screen only. Low value for structured building. | All |
| [`click_widget`](tools-all.json#L2015)<br>Click a widget | `widget, fraction?` | UI/session · UI | Game text under `data`. Post-action screen/title. Acts on a widget from the latest screen. Can affect game settings. | All |
| [`set_text_field`](tools-all.json#L2057)<br>Type into a text field | `widget, text` | UI/session · UI | Game text under `data`. Post-action screen/title and field value. Edits a widget, not a stable Axiom integration. | All |

## Example calls

These are argument objects for the named MCP tools. Coordinates are examples and require a loaded survey area.

| Tool | Arguments | What to check |
| --- | --- | --- |
| `get_self` | `{}` | Dimension, coordinates, yaw and pitch before a raycast. |
| `get_blocks_region` | `{"from":{"x":0,"y":80,"z":0},"to":{"x":3,"y":81,"z":3},"includeAir":true,"includeState":true,"maxBlocks":32}` | Expected coordinates, state representation and completeness. |
| `run_script` | `{"args":{"radius":7},"code":"return {diameter: 2 * mc.args.radius + 1};"}` | Parameter passing without any bridge writes. |
| `send_chat` | `{"message":"//size"}` | Local-player dispatch, then read chat for WorldEdit's selection size or missing-selection message. |
| `show_message` | `{"text":"The outline is ready for review.","actionBar":true}` | Private local progress indication. |

All preliminary names in the brief appear in the full installed catalog. `perception.scan` and `session.info` are examples of lower-level RPC methods used internally. They are absent as raw top-level MCP tool names. The installed `build` profile omits agent plans, scripts and the operator group. The project-specific configuration adds these deliberately. [Bridge catalog](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/mcp-server/src/tools.ts) · [Agent tools](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/mcp-server/src/agent/tools.ts) · [Script tools](https://github.com/denfry/mcpfabric/blob/54af200d845b4def8216167d2a0d41775e9b621d/mcp-server/src/script/tools.ts)
