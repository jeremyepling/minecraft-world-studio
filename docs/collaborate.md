# Collaborate inside Minecraft

Double-click **World Studio.cmd** in the installed project. Enter the disposable WorldStudioLab save in Creative and wait for **Studio ready**. You can also use `.\scripts\Start-Client.ps1 -WithChat` in PowerShell 7. Type requests in ordinary Minecraft chat with the `@studio` prefix.

### A first conversation

1. Aim at a block and type `@studio mark River Gate`. The HUD gives its coordinates. `@studio locate River Gate` briefly highlights the spot.
2. Ask `@studio Remember that I want the gate to feel quiet and sheltered.` Follow up with `@studio How would you express that with the materials here?`
3. Type `@studio look Does the roof stand out against the skyline?` to send the current Minecraft frame with a read-only question. Your normal camera stays in place.
4. Try `@studio voice on`, close chat, then hold **F8**, speak a short request and release. The HUD echoes the recognized words. For audible answers, use `@studio spoken on`. Both start off. [Voice configuration and controls](voice.md)
5. Ask `@studio status` while a job runs. Use `@studio redirect <new request>` to interrupt it and start the replacement when it settles. Use `@studio cancel` to stop. If a build has already written blocks, `@studio undo` reverses its confirmed writes where their states still match.

### Using the menu

Press **J** while looking around the lab. To change the shortcut, open **Options → Controls → Key Binds → World Studio → Open World Studio menu**.

* **Mark this block** remembers the block under your crosshair when you opened the menu, up to 96 blocks away. Enter a name and choose **Save marker**. A short burst of white end-rod sparkles appears just above the block. The name and coordinates persist after the sparkles fade.
* **Saved markers** lists your points by name. Pick one and choose **Locate** to replay its sparkles, **Use this point** to target it for builds, or **Move here** to assign it to the block you aimed at before opening the menu.
* For a bounded edit, pick a saved point, choose **Select region to…**, then pick the opposite corner. **Clear selection** returns to crosshair targeting.
* **Ask Studio…** opens chat with the prefix filled in. **Inspect view** sends the current view for critique. **Studio status** and **Cancel request** work while the agent is busy.

[Menu screenshot](../screenshots/studio-marker-menu.png) · [Marker sparkles above a riverbank](../screenshots/marker-sparkles.png)

### Reference locations

To connect two points, mark each bank independently and use **Ask Studio…** to say **“Build a curved stone bridge between West Bank and East Bank.”** Later, ask for a wider deck or a taller arch. [Bridge dimensions, previews and schematics](milestone-2.md)

| Chat | What happens |
| --- | --- |
| `@studio where` | Identify the block under the crosshair, its coordinates and the active selection. |
| `@studio mark River Gate` | Name the current ray hit (within 96 blocks). |
| `@studio markers` or `@studio markers 2` | List saved points in pages. |
| `@studio locate River Gate` | Show a burst of 32 white end-rod particles just above the point. |
| `@studio select River Gate` | Use that point as the working location for building requests. The edit resolves the current block at that position. |
| `@studio select North to South` | Use two saved markers as opposite corners of an inclusive region. A build crossing this boundary stops. Undo follows the recorded edit. |
| `@studio select clear` | Return to crosshair targeting. |
| `@studio move marker River Gate` or `@studio forget marker River Gate` | Reassign the name to the current hit or remove it. |

### Sessions, providers and voice

* `@studio session` reports the active provider, selection and saved message count while idle. `@studio history` shows recent conversation. Markers and conversation live under the project-private `local/chat-loop/` with the world, dimension and player identity. Archive these files with the matching world.
* `@studio provider codex` uses a signed-in Codex App Server session. The listener resumes the same thread across restarts. An explicit `@studio look <question>` attaches a framebuffer. Ordinary chat sends structured context. The live roof survey classifies its instruction separately, without previous designs or turns.
* `@studio provider mock` exercises the text path offline. `@studio provider ollama MODEL` uses an installed model in a local Ollama service. These adapters use text. Switching providers preserves Studio's conversation history and named points. Use `@studio provider codex` to return. [Agent capabilities](agent-providers.md)
* `@studio voice off` disables recognition. `@studio spoken off` disables spoken replies. The Windows helper handles the configured push-to-talk key only for the focused Studio client and requires the open lab to authorize the hold. Text chat still works with both off.
* `@studio help` lists commands in-game. For launch, recovery and the existing watchtower features see the [building guide](in-game-building.md). For the interactive hour trial see the [acceptance test](collaboration-session-test.md).
