# Working in Minecraft World Studio

Use the standalone Fabric 26.3 client and the project-scoped worldstudio MCP server. Read README.md and docs/installation.md for launch details. The lab has its own game directory, local Minecraft identity, bridge credentials and memory database.

Before modifying blocks, identify the active world and dimension, and check the proposed footprint. Evaluation fixtures belong in the disposable sp:WorldStudioLab Overworld. Coordinate tests that share the player's camera, selection, clipboard, or undo history. If the player pauses an operation, wait for them to resume.

Use direct structured operations. Generate repetitive geometry deterministically, compare the live footprint with the previous design, and verify the result. Check command feedback and actual cells before declaring success. Acknowledging a chat command only means it was sent.

Keep human references, executable skills, evidence and private runtime state distinct. Commit scripts, test results, small reference captures and documentation. Keep local/, .codex/, credentials, game saves and backups out of Git.
