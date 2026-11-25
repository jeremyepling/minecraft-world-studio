# Testing the collaboration loop

Use the standalone Fabric 26.3 lab for live checks. The tower geometry and adapter tests run directly from a checkout, including before Minecraft is installed. Run from the repository root with Node.js 22.16 or newer.

```powershell
node --experimental-strip-types --test packages/geometry/tower.test.mjs scripts/tower.test.mjs scripts/studio-state.test.mjs scripts/studio-session.test.mjs scripts/studio-planner.test.mjs scripts/studio-voice.test.mjs
```

These tests exercise deterministic tower edits, material revisions, guarded writes, conflicts, lost acknowledgements, restart recovery and undo receipts. They can run with Minecraft closed.

## Direct chat fixture

### Parametric tower revisions

Start the listener and game in a disposable Studio copy with its own authenticated loopback port and a clear selection. Run `node experiments/parametric-tower.mjs --lab-root <copied-project>`. The fixture uses addressed chat to build a small copper tower, raises its roof by four blocks, moves the entrance to the south, and undoes the revisions. It checks each state against an independent shape calculation, including a hand-placed sea lantern in the roof and air around the building. The private receipt contains the chat text, verified edit counts and timings.

### Hillside roof revision

Use a disposable lab copy at the expected baseline with its matching listener state. This fixture requires the original 10-block hillside roof in copper or its registered black-to-grey finish, a clear cell above the crown, Creative mode in the Overworld, the normal listener running, and the game unpaused with no menu open. The later brown survey roof is a different starting state. Preserve the active creative build when preparing a fixture. [Installation and backup](installation.md) · [Chat setup](in-game-building.md)

```powershell
node experiments/chat-loop.mjs
```

The fixture sends a preview and checks that the full survey and undo history are unchanged. It then sends one build request, checks the revised roof and journal entry, sends undo, and compares the world and previous history with their baseline. Inspect the reported phase and private receipt before calling the run a pass. The earlier approval-based trial is historical evidence. [Current fixture](../experiments/chat-loop.mjs) · [Earlier trial](chat-loop-playtest.md)

## Milestone 1 sessions and speech

Run the no-block-edit collaboration case with the normal listener active: `node experiments/collaboration-session.mjs --restart`. It checks addressed chat, ray-hit markers, selections, conversation recall, thread resumption and unchanged world state. For component checks, `node --experimental-strip-types scripts/check-agent-session.mjs` uses a disposable signed-in Codex thread; `node scripts/check-voice.mjs` exercises the Windows speech engine using synthesized audio. [Fixture and required starting conditions](collaboration-session-test.md)

## Native marker menu

To check the menu, use a disposable Studio installation with its own listener and aim at solid ground in Creative. Run `node experiments/marker-menu.mjs --lab-root <copied-project>`. Press the bound menu key at each of its two prompts. The fixture operates the native widgets, compares the saved point to an independent raycast, selects it, captures the screens and restores the previous marker state.

The Fabric 26.3 run passed on November 24, 2026. Two J keypresses opened the menu. Saving created a point at the independently measured block `(-34, 115, 40)`. Picking **Use this point** set the listener's selection to that marker. Cleanup restored the previous marker list and selection. [In-game menu capture](../screenshots/studio-marker-menu.png)

## Human acceptance

For Milestone 1, record an hour of actual building from the player's perspective. Note where the agent loses a referenced location, where the player needs a terminal, whether progress and interruption are understandable, and whether returning to the world restores the right context. Include a real manual edit followed by an agent revision. Record the game/loader version, revision, requested action, observed result and any untested steps. [Milestone 1](milestone-1.md) · [Integrated-client checks](playtest.md)
