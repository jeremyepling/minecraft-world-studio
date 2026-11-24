# Integrated-client evaluation

The primary client used Minecraft 26.3, Java 25, Fabric Loader 0.20.1, Fabric API 0.167.0, MCPFabric 0.10.0, WorldEdit 7.4.6 and Axiom 6.1.5. The Fabric startup log reported all mods. The test player WorldStudio created a new normal-terrain Creative save with commands enabled. The save folder, title and seed are documented in the [installation guide](installation.md). All coordinates below are in the Overworld.

## Functional results

| Check | Result | Observation |
| --- | --- | --- |
| A. Client and Codex lifecycle | Pass | The local bearer-authenticated client reported sp:WorldStudioLab. After a normal close, closed-file backup and fresh launch, the same save reopened and the stone landmark survived. A new Codex process invoked the bridge. [Client restart](restart-and-approval.json) · [Codex reconnect](codex-reconnect.json) |
| A. Multiple instances | Pass, with an identity collision | Two independently launched clients used separate game/config directories, tokens and loopback ports. Port 25640 controlled a restored copy. Both reported sp:WorldStudioLab. A lapis edit on 25640 left the original block stone on 25639. Separate agent data directories prevent same-name worlds from sharing stored context. The secondary client was closed. [Routing evidence](restore-and-routing.json) |
| B. Player, terrain and map | Pass | get_self returned pose and mode. A 96-block view ray from the spawn eye hit grass 56.5 blocks away, beyond hand reach. describe_scene reported no crosshair target on the later view. Nine downward rays at four-block spacing found grass, leaf litter and leaves between Y87 and Y97. observe found 785 log blocks in 25 chunks and water in a wider pass. map_view returned a 5×5 character map with one symbol per chunk. A top hit on leaves samples canopy height. Use a surface-material filter and denser ground sampling before grading a road here. [Spatial survey](spatial-survey.json) · [Water survey](water-survey.json) · [Road survey and build](experiments.md) |
| C. Rendered inspection | Pass for player camera; independent camera untested | Codex consumed the stock framebuffer. The gallery uses the player camera to capture reproducible views. screenshot alone did not require moving the player. Different viewpoints required moving or aiming that player. [Gallery and measurements](experiments.md) |
| D. Stock block tools | Pass | Actual block and blockstate readbacks cover platform, cube, hollow cuboid, openings, staircase orientation and multiple materials. [Readbacks](basic-readback.json) |
| E. WorldEdit | Pass | Explicit console and player actors both executed edits, with separate selection and undo history. Shapes, masks, rotation and actual disk round-trip are detailed below. |
| F. Construction plans | Partial pass | Serialized plan, palette/layers, rotation, explicit origins, material counts and verify are covered in the live trial. The revision and conflict behavior required by the proposed object model remains outside these operations. [Plan observations](plan-and-chat.json) |
| G. Scripts and reusable skills | Pass for prototype | Saved parameterized programs generated and revised actual structures and survived reconnection. Script errors, timeouts and disconnects can leave earlier writes in place. [Script contract](script-contract.json) · [Failure readbacks](recovery.json) · [Creative experiments](experiments.md) |
| H. Communication | Partial pass | Native chat, HUD messages and targeted player messaging were exercised. The final installed players_admin approval gate covers message_player; local show_message remains available. We observed an in-game request/deny action. Unsolicited inbound initiation of a Codex conversation remains unverified. [Live communication](plan-and-chat.json) · [Player decision](restart-and-approval.json) |
| I. Manual collaboration | Partial pass | Axiom loaded and showed its first-use UI. A waxed-copper marker placed through another tool survived three revisions and a closed-world restore. The human Axiom gesture has a short test at the actual gate. [Human validation steps](experiments.md) · [Saved gate override](restore-and-routing.json) |
| J. Approval and recovery | Pass for explicit denial, partial failure, scoped undo and restored backup | The player received a request to switch to Survival, pressed N in the game and stayed in Creative. The event stream contains a matching request ID and approved=false. WorldEdit undo reverted only its actor's latest edit. A direct MCPFabric write survived undo of a subsequent WorldEdit change. A failed script left earlier work in place. [Denial](restart-and-approval.json) · [Undo readback](console-worldedit.json) · [Script recovery](recovery.json) |

## Choosing the WorldEdit actor

**A separate AI editing session works through run_command.** On this release MCPFabric and the Minecraft command executor each consume a leading slash. Give run_command a triple slash for WorldEdit double-slash commands. Initialize its console context once per session with the WorldEdit world ID. In the installed jar, CoreMcWorld.id() joins the level name and registry dimension with an underscore. The dimension alone returned an invalid-world error. These commands were exercised through the stock TypeScript MCP server.

```text
run_command {"command":"///world WorldStudioLab_minecraft:overworld"}
run_command {"command":"///pos1 -35,166,-35"}
run_command {"command":"///pos2 -34,166,-35"}
run_command {"command":"///set quartz_block"}
```

WorldEdit reported two changed blocks and readback found two quartz blocks. A second operation applied an andesite mask to two mixed input cells. Only the matching cell changed to tuff; undo restored that cell to andesite and left the other quartz. run_command returned success=true and resultValue=0 both for successful edits and for a WorldEdit message explaining a missing world. Inspect the captured feedback and verify the cells. [Successful console path](console-worldedit.json) · [Negative control](console-worldedit-control.json)

**Use send_chat to share the player's WorldEdit session.** Send normal player syntax such as `{"message":"//pos1 -35,170,-35"}`, then the second corner and edit command. Its sent/asCommand fields acknowledge sending the packet. Allow the server to process the command before inspecting the affected region. A direct comparison left two sandstone cells in the console selection and three bricks in a separate player selection. Console undo removed only the sandstone. Player undo then removed the bricks. This proves independent selections and histories. Clipboard rotation, loading and pasting were separately verified in the player session. Cross-actor clipboard isolation was not independently asserted. [Actor comparison](worldedit-identities.json)

| Player-session operation | World-state evidence |
| --- | --- |
| Cuboid fill, undo, redo | 4×2×2 box had 16 stone, then zero occupied cells, then 16 stone again. |
| Random pattern | 50% andesite, 50% tuff produced 10 andesite and 6 tuff in this run. |
| Generation | After setting /toggleplace to position 1, the radius-2, height-3 hollow cylinder had 36 cobblestone cells. A radius-2 sphere had 81 tuff cells and a radius-2, height-4 cone had 28 brick cells. The generator feedback counted more placements than the number of unique occupied cells read from the world. |
| Mathematical generation | The expression x*x+z*z<=0.5 in a 5×3×5 selection produced 27 smooth-stone cells. |
| Clipboard | Rotating a copied 4×2×2 box 90° gave 16 stone in the rotated footprint. |
| Schematic | WorldEdit wrote a 289-byte Sponge schematic under the instance's config/worldedit/schematics directory. Omitting the extension in the initial load returned a usage error. Clearing the clipboard, loading the full .schem filename, clearing all 16 source cells, then pasting with -o restored the original 16 coordinates. |

[Generation readbacks](worldedit-results.json) · [Disk round-trip with all coordinates](schematic-readback.json) · [WorldEdit command documentation](https://worldedit.enginehub.org/en/latest/commands/)

## Limits of the test

The sampled 5×5 map rendered almost entirely as the same rare-ore symbol. It did not resolve slope, road endpoints or exposed water. The terrain experiment used explicit collocated column samples for those decisions. The water-specific search located water around Y59; finding water at depth does not establish a surface shoreline.

The snapshot contained 38 files totaling 13,082,654 bytes when the primary client was fully closed. Its restored copy had both the stone landmark and the waxed-copper override. The later hillside showcase postdates this snapshot. A save reopened with the same folder name in a different game directory produces the same singleplayer memory key. Changing a save's folder name changes that key. Use distinct persistence directories and verify both world and dimension before writing.

No human Axiom edit has yet been observed in this evaluation. The repeatable pending test, screenshots, creative workload counts and benchmark limitations are recorded in the [experiment report](experiments.md) and [performance report](../benchmarks/README.md).
