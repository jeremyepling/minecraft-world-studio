# Agent providers and conversation lifetime

In Minecraft type `@studio provider` to inspect the selection. Use `@studio provider codex` for the signed-in Codex runtime, `@studio provider mock` for offline input and HUD checks, or `@studio provider ollama MODEL` for an installed local model. A change of provider keeps Studio's markers, selections, local conversation context and edit receipts.

| Provider | Conversation and control | Images |
| --- | --- | --- |
| Codex App Server | One local stdio process serves successive turns. Studio saves its thread ID after opening the conversation and resumes it across listener restarts. Protocol events supply progress. Cancellation sends `turn/interrupt`. | An explicit view request can attach a PNG or JPEG of up to 8 MiB. The planner sends its contents to the configured Codex account as part of that turn. |
| Ollama | A local inference adapter posts Studio's supplied context and a strict output schema to a loopback `/api/chat` endpoint. It has no provider thread. Cancelling aborts the HTTP request. The model must be installed separately and support structured output. | This adapter advertises text only. |
| Mock | Deterministic local replies echo the request. Survey classification produces inspection. Use it to exercise the conversation path without credits or world writes. | Text only. |

Ollama defaults to `http://127.0.0.1:11434`. Its optional endpoint accepts a numeric loopback HTTP origin. The adapter sends neither tools nor account credentials. A local inference service is responsible for its own model execution and configuration. [Ollama chat API](https://docs.ollama.com/api/chat) · [Structured output support](https://docs.ollama.com/capabilities/structured-outputs)

## What persists

There are two distinct records. Studio owns the current world observations, edit history, and the conversation context it supplies to the selected provider. Codex owns the history of its design thread under the signed-in Codex installation. Studio records the world, player and thread ID in the private listener directory's `agent-session.json`. If the Codex thread was removed, the listener reports that it is starting from Studio context. Replacing the lab save calls for archiving its matching private Studio state. A plain save-folder name cannot distinguish cloned worlds.

The planner opens a dedicated thread for each blind survey classification and unsubscribes after the answer. These ephemeral threads receive only the survey request. The live block algorithm obtains its own observations independently. The normal design thread can receive spatial markers, the named selection, known objects, conversation context and an explicitly attached image.

## Execution boundary

The Codex child runs in a separate temporary directory. Minecraft bridge environment variables stay out of the child, and provider credentials stay outside Minecraft. The runtime negotiates a read-only sandbox with tool-network access disabled, turns off shell, desktop, plugins, hooks and app integrations, disables configured MCP servers for the planner, and verifies the effective MCP inventory before sending a request. The client rejects server-initiated tool and approval calls. Only the listener can apply checked Minecraft edits after validating a complete decision. Losing a process during a turn yields an error; there is no automatic replay of that turn. The following new request may reconnect and resume the saved thread.

If a turn times out or interruption cannot be confirmed promptly, the listener can close the owned child process. It discards interrupted results. An edit that already entered Minecraft execution has its own per-run cancellation and receipt behavior. [Edit recovery](in-game-building.md)

## Verification

Run the offline tests with `node --test scripts/studio-planner.test.mjs`. The Ollama transport test uses a temporary loopback test server. To exercise the signed-in Codex runtime, run `node scripts/check-agent-session.mjs`. This creates a disposable thread, checks recall after closing and reopening the process, classifies an isolated survey, interrupts a turn, checks recall again and submits a synthetic color image. It makes model requests but does not connect to Minecraft. The protocol in this implementation was exercised against Codex CLI 0.171.0-alpha.13. [Runtime source](../scripts/codex-runtime.mjs)
