# Build with Codex from Minecraft chat

Double-click **World Studio.cmd** in the installed project and resume WorldStudioLab until the HUD shows **Studio ready**. For a client that is already running, the following PowerShell command starts the background listener. [Session, voice and marker controls](collaborate.md)

```powershell
.\scripts\Start-Chat.ps1 -Background
```

### Try the hillside tower

1. Type `@studio make the hillside watchtower roof two blocks taller`. The listener surveys the tower, applies the change and reports how many blocks it verified.
2. Type `@studio undo` to reverse that edit. Blocks you changed to another material after the edit stay as you left them.

For a look before building, type `@studio preview make the hillside watchtower roof two blocks taller`. The particle outline shows the proposed massing and the HUD reports how many blocks would change. To build it, repeat the request without the word `preview`.

Aim at a ground block within 96 blocks and ask `@studio build a small watchtower here with 16-block walls and a 5-block roof` to start a separate tower. The ground hit locates the center one block above it. Existing terrain and player-placed blocks in the new footprint are protected. Survey an appropriate site yourself since this prototype does not level a base. Aim at a known tower to select it for a revision, or name the hillside tower. The tower supports wall height 12–40, base radius 5–10, taper 0–3, wall thickness 1–3 and roof height 4–16 blocks. For a material revision, try `@studio Make the hillside roof black at the eaves and grey at the tip`. The finish blends polished blackstone and deepslate into polished andesite and follows later changes to the roof dimensions. Ask for weathered copper to restore the green finish.

| Chat | Effect |
| --- | --- |
| `@studio status` | Show the active job or help. |
| `@studio preview` | Redraw the last explicit preview from this listener session. |
| `@studio preview <request>` | Draw a particle guide and report the proposed edit without writing blocks. |
| `@studio cancel` | Stop the active job or clear the last preview while idle. A command already on the Minecraft thread may finish. |
| `@studio undo` | Reverse the latest receipt using current block states. |

### Run, stop and reconnect

For an independent selection, face the tower and type `@studio survey the roof using live blocks only. Make it dark brown at the bottom and light brown at the top.` This path starts from the view ray and samples the upper silhouette. It uses live block states for its checked writes and undo. It does not update the tower recipe. The survey is intended for a distinct, tapered roof above an identifiable shaft. It stops if it cannot isolate that shape.

Use `.\scripts\Start-Chat.ps1` for foreground logs and Ctrl+C to stop. For the background listener use `.\scripts\Start-Chat.ps1 -Stop`. A named pipe permits one listener per installation. After reconnect, wait for **Studio ready** before sending new input. Codex resumes its private app-server thread. Studio retains local conversation and spatial state across provider switches. The `look` command also sends an image to the chosen vision-capable provider.

Use the installed lab, Node.js 22.16 or newer with SQLite, and the model runtime selected in chat. The default Codex adapter needs a signed-in Codex CLI. MCPFabric runs on the authenticated private loopback connection. Studio validates structured model output and constructs all Minecraft commands locally.

### How edits and recovery work

The listener computes old and proposed geometry using the checked-in tower skill in QuickJS, reads the candidate footprint including air, and records the exact eligible differences under the edit ID. To commit, each grouped column first checks the expected materials and then writes in a single Minecraft command. If the precondition fails, remaining eligible cells are resurveyed. Undo reverses only acknowledged writes still matching their committed state. Match checks cannot attribute a manual edit that leaves the same final block state. A multi-column operation can be partially complete.

Private state under `local/chat-loop/` contains tower parameters, override spans, undo history, markers, voice settings and conversation. The listener flushes receipts before and after grouped writes. After a partial edit, use `@studio undo` to recover confirmed writes. Inspect any reported unacknowledged column manually. When replacing or restoring a world, stop the listener and archive its matching state with the save.

The listener recognizes addressed chat from this installation's local player. Minecraft logs and background listener logs are private files on disk. Particle previews and Studio's receipt-based undo are independent of WorldEdit and Axiom histories. For a human check, place a distinctive block in the edited area before running undo.
