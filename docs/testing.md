# Testing the collaboration loop

Use the standalone Fabric 26.3 lab for live checks. The offline tests use its installed Node dependencies and QuickJS runtime. Run from the repository root with Node.js 22.16 or newer.

```powershell
node --test scripts/tower.test.mjs scripts/studio-state.test.mjs
```

These tests exercise deterministic tower edits, material revisions, guarded writes, conflicts, lost acknowledgements, restart recovery and undo receipts. They can run with Minecraft closed.

## Direct chat fixture

Use a disposable lab copy at the expected baseline with its matching listener state. This fixture requires the original 10-block hillside roof in copper or its registered black-to-grey finish, a clear cell above the crown, Creative mode in the Overworld, the normal listener running, and the game unpaused with no menu open. The later brown survey roof is a different starting state. Preserve the active creative build when preparing a fixture. [Installation and backup](installation.md) · [Chat setup](in-game-building.md)

```powershell
node experiments/chat-loop.mjs
```

The fixture sends a preview and checks that the full survey and undo history are unchanged. It then sends one build request, checks the revised roof and journal entry, sends undo, and compares the world and previous history with their baseline. Inspect the reported phase and private receipt before calling the run a pass. The earlier approval-based trial is historical evidence. [Current fixture](../experiments/chat-loop.mjs) · [Earlier trial](chat-loop-playtest.md)

## Human acceptance

For Milestone 1, record an hour of actual building from the player's perspective. Note where the agent loses a referenced location, where the player needs a terminal, whether progress and interruption are understandable, and whether returning to the world restores the right context. Include a real manual edit followed by an agent revision. Record the game/loader version, revision, requested action, observed result and any untested steps. [Current milestone](current-milestone.md) · [Integrated-client checks](playtest.md)
