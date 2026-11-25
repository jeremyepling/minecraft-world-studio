# Milestone 1 — In-game collaboration

**Implemented in the Windows Fabric 26.3 lab. Human acceptance is open.** Start **World Studio.cmd**, type `@studio help` and try an hour building in WorldStudioLab. The player decides whether the in-game conversation, pointing, speech and interruption are comfortable enough for regular use. [Player guide](collaborate.md) · [Hour-long acceptance case](collaboration-session-test.md)

| Experience | Implementation |
| --- | --- |
| Keep a conversation | Codex App Server keeps a dedicated thread. Studio resumes it across listener restarts. It also saves provider-independent messages and world references in private storage. |
| Refer to the world | Press **J** for the rebindable Studio menu. Save a crosshair target, locate it by its white sparkles, select a point or two corners, or attach the current framebuffer for a read-only critique. Chat commands remain available. |
| Control the work | Direct build requests retain checked writes and undo. Explicit previews are read-only. The HUD reports activity and block progress. Cancel or redirect an active turn from chat or recognized speech. |
| Choose input and output | Text is available throughout. F8 push-to-talk and spoken replies are independently opt-in. The Windows helper checks the focused Studio instance and lab authorization. |
| Choose an agent | Codex is the default. The mock adapter supports offline tests. The Ollama adapter accepts a compatible installed local model through loopback. Image-capable turns currently use Codex. |

## Evidence and remaining acceptance

* The combined automated suite passed 19 tests covering checked editing and recovery, provider contracts, durable markers and conversations, and speech lifecycle.
* A real Minecraft chat fixture placed and selected a marker at an independently raycast block, established a conversation, restarted the listener, then checked the same Codex thread and recalled phrase. The fixture restored the prior marker selection and checked all 2,700 roof and neighboring cells and the previous edit history. [Reproduce the test](collaboration-session-test.md)
* In the same lab, Codex described the tower and daylight sky from the attached framebuffer. Active turns were cancelled and redirected, the replacement returned the requested code, and the player switched from Codex to the mock adapter and back. A roof preview crossing a two-marker region was refused. The camera, selection, original provider, edit history and all surveyed blocks were restored.
* The installed Codex runtime passed a separate interruption, recovery, isolated-survey and image-input check. The local Windows speech engine recognized an in-memory synthesized sentence exactly. Ollama was exercised with a loopback API fixture. [Provider tests](agent-providers.md) · [Speech tests](voice.md)
* Physical microphone intelligibility, audible playback at the player's desk, a real Axiom edit during collaboration, and the one-hour comfort criterion remain human checks. Text, voice and provider support are documented separately from the historical Phase 1 trials. [Known limitations](known-limitations.md)

Milestone 2 covers building fluency. The broader SDK and regional planning work remain on the [roadmap](roadmap.md).
