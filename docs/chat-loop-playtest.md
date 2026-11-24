# In-game request loop playtest

The live fixture uses the default local account `WorldStudio` in the disposable `sp:WorldStudioLab` Overworld on Minecraft 26.3, Fabric Loader 0.20.1 and MCPFabric 0.10.0. The starting lab revision was `f15bdbc`. The client was already in Creative facing the hillside tower.

## Chat and targeting controls

One ordinary player chat submission produced two bridge events. Event 20 contained the server's player name and UUID. Event 21 contained the client's decorated message, `sender=WorldStudio`, `kind=chat` and `self=true`. The Minecraft log recorded the player submission. These events came from a real integrated client via MCPFabric's player chat sender.

From `(-16.5, 96, 51.5)`, the player's view ray hit stone bricks at `(6, 110, 81)` after 39.92 blocks. The tower under test is centered at `(9, 96, 86)`.

## Hillside roof revision

On November 24, 2026, the player asked for a two-block increase in roof height while retaining every other tower parameter. The listener launched an actual Codex CLI design turn. Minecraft displayed proposal `aef9f050` about five seconds after the request. It kept the 30-block walls, tapered radius of 7 to 5, and wall thickness of 2. It proposed 107 changed cells and identified 68 protected cells.

| Check | Result in the disposable world |
| --- | --- |
| Preview | All 4,624 block states in the roof survey matched the original after the proposal appeared. |
| Edit during approval | The fixture placed a diamond block at `(9, 137, 86)` after preview. Approval sent in the same second as the proposal succeeded. All 106 remaining cells changed as predicted. The diamond remained. |
| Edit during undo | The fixture placed lapis at `(9, 136, 86)` after the commit. Undo restored all 105 eligible cells. Lapis and diamond both remained. |
| Cleanup | After conditionally removing the two fixtures, the entire roof survey matched the starting snapshot. A separate readback of 18,411 states from `(0, 95, 77)` through `(18, 145, 95)` matched the pre-test SHA-256 digest `3419be20977826e25d1400384b65d9b3c5d8b5ececddfcb280048266e435f1f5`. |

The HUD reported completion approximately 20 seconds after the approval and 20 seconds after the undo request. The first exploratory run had needed a second approval because the listener was still drawing the preview when it announced the proposal. The repeat above accepted the first approval. The final listener also releases the busy state before publishing the completion message. The pointed-site trial below ran with this final source.

The [repeatable scenario](../experiments/chat-loop.mjs) contains the independent expected roof calculation and region assertions. Run `node experiments/chat-loop.mjs` with the original hillside tower in the loaded lab and the ordinary listener stopped. It starts its own listener, sends player chat, reads actual in-game replies from the Minecraft render log and writes a private receipt under `local/chat-loop-test-scenario-*/fixture-result.json`. The passing receipt for this run is in the directory ending in `4ba97e09-7c6c-44d8-a468-aca9818c3fa0`.

## Pointed site and rejection

The player's view ray hit grass at `(-16, 94, 52)`. An addressed request produced proposal `afe2d907` one block above it, for a radius-5 tower with 12-block walls and a 4-block copper roof. The HUD showed 464 editable cells and 18 protected cells.

1. Approving a different ID elicited “That proposal ID is not current.”
2. Asking for status returned the original proposal and its ID.
3. Rejecting the current ID displayed “Rejected afe2d907. No blocks changed.”
4. Approving that ID after rejection elicited the same stale-ID response.

All 29,624 block states in the 23 × 56 × 23 survey matched before and after, with SHA-256 `d83e86796ad95ff6d789072511ca03cf22631ef25bb9fa4a6f6bfe6d145ce1db`. The fixture restored the original view angles. The private transcript and hashes are in `local/chat-loop-playtest/reject.json`.

## Coverage limits

The automation submitted chat through the local player's normal Minecraft chat path. It used conditional game commands to stand in for two human block edits. A human typing, using Axiom, and judging the particle outline visually remains a separate acceptance check. These runs exercised the private singleplayer lab and one tower shape.
