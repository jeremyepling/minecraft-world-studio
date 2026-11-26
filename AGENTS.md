# Working in Minecraft World Studio

Read the [product vision](docs/product-vision.md) for the long-term direction and the [current milestone](docs/current-milestone.md) for active scope and acceptance. Keep the vision stable. When implementation changes, update the milestone, [technical decisions](docs/decisions.md), [known limitations](docs/known-limitations.md) and [testing procedures](docs/testing.md) where affected.

Use the [architecture](docs/architecture.md) and [roadmap](docs/roadmap.md) to distinguish work needed now, next-milestone requirements, long-term compatibility needs and speculative ideas. Document a decision's tradeoff when it diverges from the vision. Keep agent and speech credentials outside Minecraft, store world knowledge independently of provider sessions, and distinguish agent-facing tools, deterministic algorithms and artistic skills.

Use the standalone Fabric 26.3 client and the project-scoped worldstudio MCP server. Read README.md and docs/installation.md for launch details. The lab has its own game directory, local Minecraft identity, bridge credentials and memory database.

Before modifying blocks, identify the active world and dimension, and check the proposed footprint. Evaluation fixtures belong in the disposable sp:WorldStudioLab Overworld. Coordinate tests that share the player's camera, selection, clipboard, or undo history. If the player pauses an operation, wait for them to resume.

Use direct structured operations. Generate repetitive geometry deterministically, compare the live footprint with the previous design, and verify the result. Check command feedback and actual cells before declaring success. Acknowledging a chat command only means it was sent.

For artistic design, painting, critique or revisions to an object with saved art direction, use the [artistic building skill](skills/minecraft-artistic-building/SKILL.md) and its relevant study notes. The [player and engineering guide](docs/painterly-building.md) records executable scope, intent persistence and benchmarks.

Keep human references, executable skills, evidence and private runtime state distinct. Commit scripts, test results, small reference captures and documentation. Keep local/, .codex/, credentials, game saves and backups out of Git.
