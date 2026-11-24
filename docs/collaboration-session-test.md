# Milestone 1 collaboration checks

## Scripted player chat

**Case** `in-game-collaboration-session`. Run from the installed World Studio project on Windows with Fabric 26.3, Node 22.16+ and PowerShell 7 on PATH. Open the disposable `WorldStudioLab` in Creative, resume the Overworld, aim steadily at a solid block near the hillside tower and wait for **Studio ready**. Use a quiet interval with the listener idle and no other player requests in flight. The test sends its own messages through the normal player chat sender.

```powershell
node experiments/collaboration-session.mjs --restart
```

The full case performs a graceful listener stop and starts it again with the project's background launcher. The Minecraft client stays open. The shorter invocation, `node experiments/collaboration-session.mjs`, exercises the marker and conversation checks on the existing listener. Use the full invocation to verify real Codex thread resumption.

| Check | Observable success |
| --- | --- |
| Mark the pointed block | The in-game reply names the unique trial marker and gives the coordinates independently measured by a bridge raycast. Listing shows it, selection changes to it, and `@studio where` identifies the aim and selection. |
| Converse | The player introduces a random test code and later asks for it without including the code in the question. The answer in the Minecraft HUD contains the original code. |
| Reconnect | A fresh listener reports ready, discovers the saved marker and selection, and answers the follow-up with the same code. The saved Codex thread ID matches the one used before restart. |
| Restore the lab | The fixture restores the previous selection through chat and forgets only its trial marker. Its ending marker list and edit history match the baseline. All 2,700 sampled block states around the current roof match their before snapshot. |

A passing run prints `pass` and the private receipt path beneath `local/collaboration-tests/`. The receipt includes the messages sent, matched HUD replies, restart mode and unchanged-cell count. It excludes provider thread IDs. The test intentionally leaves the conversation exchanges in the session. A timeout or mismatched ray hit fails the run. If cleanup is interrupted, the receipt's marker name and steps identify the trial data for recovery.

## One hour in Minecraft

Use a disposable creative area and an actual participant for this check. Capture the build, listener version, enabled providers, and chosen push-to-talk key. Keep a short tally of repeated instructions, unwanted edits, operations needing a terminal, and interruptions that leave the player guessing.

1. **First 10 minutes.** From text chat mark a site, select it, and ask what the agent sees. Walk away and refer to the named site again. Confirm the answer distinguishes the selection from the current crosshair.
2. **Next 15 minutes.** Enable voice in game, hold the talk key for one ordinary request, then release. Confirm the transcript, progress and reply. Test an optional spoken reply, then return to text. Check that speech outside the hold interval or after switching away from Minecraft produces no turn.
3. **Next 15 minutes.** Ask for a preview, then request an edit. Cancel or redirect one request while it is visibly active. Record whether the HUD acknowledges interruption and how the journal reports any completed part.
4. **Next 10 minutes.** Make a distinctive manual edit using Axiom or normal blocks. Ask for a subsequent revision, then use checked undo. Inspect the distinctive block after both actions.
5. **Final 10 minutes.** Re-enter the lab, refer to a prior design decision and named marker, and continue the conversation. Note what the agent remembers, whether context refers to the right world, and whether the player would stay in Minecraft for another session.

Record which actions the participant actually performed. A synthetic recognizer test can validate a speech pipeline. Physical key feel, microphone intelligibility, audible speech and an enjoyable hour of building require human observation.
