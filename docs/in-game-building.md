# Build with Codex from Minecraft chat

Open the disposable WorldStudioLab save as WorldStudio. In PowerShell 7, start the listener from the installed project directory. If Minecraft is closed, start it with `.\scripts\Start-Client.ps1` in another terminal. Resume the game until the HUD shows **Studio ready**.

```powershell
.\scripts\Start-Chat.ps1 -Background
```

### Try the hillside tower

1. Type `@studio make the hillside watchtower roof two blocks taller` in ordinary Minecraft chat. The listener surveys your aim and asks Codex to interpret the request. A particle outline shows the proposed base, eaves and peak. The reply gives the dimensions, count of editable cells, count of protected cells and a proposal ID.
2. Inspect it from the hill or the road. Type `@studio preview` to draw the short-lived outline again. Ask for a different height if desired. Each replacement has a new approval ID.
3. Type `@studio approve <id>` using the ID in the latest reply. Keep the game running in Creative. Read the applied, verified and preserved counts in the HUD.
4. Type `@studio undo` to reverse the latest confirmed Studio edit. A cell you changed to another material after commitment stays as you left it.

Aim at a ground block within 96 blocks and ask `@studio build a small watchtower here with 16-block walls and a 5-block roof` to start a separate tower. The ground hit locates the center one block above it. Existing terrain and player-placed blocks in the new footprint are protected. Survey an appropriate site yourself since this prototype does not level a base. Aim at a known tower to select it for a revision, or name the hillside tower. The tower supports wall height 12–40, base radius 5–10, taper 0–3, wall thickness 1–3 and roof height 4–16 blocks. Its north entrance, slit windows and palette are fixed.

| Chat | Effect |
| --- | --- |
| `@studio status` | Show the active job, pending proposal or help. |
| `@studio preview` | Repeat the pending proposal and its particle guide. |
| `@studio reject <id>` | Discard this proposal without writing blocks. |
| `@studio cancel` | Request cancellation, or discard a pending design while idle. A command already on the Minecraft thread may finish. |
| `@studio undo` | Reverse the latest receipt using current block states. Starting undo also dismisses an outstanding proposal. |

### Run, stop and reconnect

Use `.\scripts\Start-Chat.ps1` for foreground logs and Ctrl+C to stop. For the background listener, run `.\scripts\Start-Chat.ps1 -Stop`. A named pipe permits one listener per installation. After Minecraft restarts, resume the lab and wait for a fresh **Studio ready**. Send new requests after that message. Chat written during a disconnect is skipped. The listener has its own short conversation context. It starts an ephemeral signed-in Codex CLI turn for a design request. Approval, rejection, cancellation and undo are handled locally. Your request, recent request summaries, tower parameters, player position and view hit are supplied to Codex. This conversation is separate from any open Codex desktop thread.

Launch prerequisites are the Phase 1 installation, Node.js 22.16 or newer with SQLite, a signed-in Codex CLI on PATH with access to its model, and Creative mode in the singleplayer lab Overworld. The existing stock MCPFabric mod/stdio server and the private authenticated loopback connection do the Minecraft work. No new Minecraft endpoint is opened. The planner receives data in an empty temporary working directory. It returns a schema-constrained design with bounded integers. Only the listener constructs Minecraft commands.

### How approvals and recovery work

The listener computes old and proposed geometry using the checked-in tower skill in QuickJS, reads the candidate footprint including air, and records the exact eligible differences under the proposal ID. A particle guide represents massing. To commit, each grouped column first checks the expected materials and then writes in a single Minecraft command. If the precondition fails, remaining eligible cells are resurveyed. Undo reverses only acknowledged writes still matching their committed state. Match checks cannot attribute a manual edit that leaves the same final block state. A multi-column operation can be partially complete.

Private state under `local/chat-loop/` contains proposals, tower parameters, override spans, undo history and the short conversation history. The listener flushes a receipt before and after each grouped write. Following a disconnect or interruption, use `@studio undo` to recover confirmed writes if the listener reports a partial edit. A write whose acknowledgement was lost stays excluded from future builds. Inspect the reported coordinates manually. If replacing or restoring the disposable world, stop the listener and archive its corresponding state with the save before resuming. The save name alone does not distinguish two copies of the same lab.

The listener recognizes addressed chat from this installation's local player. Minecraft logs and background listener logs are private files on disk. Particle previews and Studio's receipt-based undo are independent of WorldEdit and Axiom histories. For a human check, substitute an Axiom edit for either marker change in the [playtest](chat-loop-playtest.md).
