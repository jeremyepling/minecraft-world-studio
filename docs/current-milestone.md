# Milestone 1 — In-game collaboration

**In progress.** Success is a human spending an hour comfortably building with the AI inside Minecraft. An automated roof edit proves the request path works. The hour-long human session remains an open acceptance check.

| Experience | Current baseline | Milestone goal |
| --- | --- | --- |
| Talk in Minecraft | Addressed player chat reaches the local listener. Codex interprets a request and the listener replies in the HUD. | Carry on a persistent conversation, interrupt or redirect work, and recover the session after reconnecting. |
| Refer to the world | View ray, known towers, bounded surveys and framebuffer captures. An independent survey identified the hillside roof from live blocks without consulting its recipe. | Attach relevant spatial context, named markers and selections to turns. Let the player see which location the agent understood. |
| Control a build | Direct instructions apply checked edits. Explicit previews are read-only. The player can inspect status, cancel, and undo confirmed writes. | Keep progress and interruption understandable while the player continues building manually. |
| Choose how to communicate | The working agent path uses Codex CLI. The listener stores a short turn history locally. | Support configurable agent capabilities, text, push-to-talk and optional spoken responses. Configure recognition and synthesis independently. Keep credentials outside the mod. |
| Develop and test | A disposable Fabric lab, offline checks, real chat fixtures and independent block readback are available. | Make collaboration behavior repeatable across restarts. Exercise the human controls and record where the player had to leave Minecraft or repeat context. |

The detailed Milestone 1 implementation brief is forthcoming. The goals above come from the product vision. Record implementation order and accepted changes here when the brief arrives. The next milestone covers composable geometry and execution backends. [Product vision](product-vision.md) · [Roadmap](roadmap.md)

For the baseline, start with the working chat instructions and the relevant test fixture. The survey example used two opposite camera positions and restored the player afterward. [Chat guide](in-game-building.md) · [Testing](testing.md) · [Northwest roof detail](../screenshots/survey-roof-northwest-detail.png)
