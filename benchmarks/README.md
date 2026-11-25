# Block-edit trials

Integrated Minecraft 26.3 on this PC, MCPFabric 0.10.0, WorldEdit 7.4.6. Each timed operation placed light-blue stained glass into a preflighted, fully loaded, all-air cuboid. A separate scan read every cell after timing. The harness then conditionally cleared only the fixture material and verified an all-air footprint again. The 100,000-block case occupied 50 × 40 × 50. [Trial records](results/trials.jsonl)

| Backend | 1,000 blocks | 10,000 blocks | 100,000 blocks | Timed MCP requests / bridge calls |
| --- | ---: | ---: | ---: | --- |
| Individual `set_block` | 959 ms | 7,506 ms | Skipped | One of each per block |
| Grouped `fill_blocks` | 4.49 ms | 20.35 ms | 158.30 ms | 1 / 1, 1 / 1, 4 / 4 |
| Generated vanilla `/fill` | 3.97 ms | 17.84 ms | 156.16 ms | 1 / 1, 1 / 1, 4 / 4 |
| Player WorldEdit selection + set | 204.88 ms | 238.11 ms | 227.19 ms | 3 / 3 each |
| Console WorldEdit selection + set | 24.37 ms | 53.82 ms | 158.69 ms | 3 / 3 each |
| Native plan, `method=set` | 35,659 ms | Skipped | Skipped | 2 MCP requests at 1k. The plan job made at least 1,000 placement calls plus probes and player checks. Exact internal count uninstrumented. |
| Preloaded disk schematic, `//paste -o` | 74.22 ms | 75.95 ms | 74.45 ms | 1 / 1 each |

These are exploratory single observations per cell. Player WorldEdit command timings include acknowledgement observed in the client log, polled every 15 ms. Console WorldEdit timings use synchronous command feedback after explicitly binding the console session to the lab Overworld before the clock starts. Both set rows include the two selection commands. The schematic was copied, saved to disk, cleared from the clipboard and loaded again before timing the paste. The native plan time includes saving, executing and internal verification. The harness drove MCP programmatically, so actual LLM tool calls during each timed trial were zero. The last column gives the requests a model would issue for this exact unbatched sequence. The counts exclude setup, independent verification and cleanup. [Harness](run.mjs)

Choose a grouped fill for solid cuboids. The two fill paths both dispatch vanilla fill under the hood and their small differences do not establish a stable winner. For a complex repeated structure, the 100k schematic trial demonstrates an approximately 74 ms insertion from a prepared clipboard with WorldEdit history. Use a native plan when orientation, inventory or reachability checks matter. Its 1k trial already took 36 seconds. Larger plan and individual-write trials were omitted after confirming that their call growth dwarfs the bulk paths.

The raw records include `tick query` immediately before and after the edit. Its moving summary covers 100 ticks and can hide an isolated stall. Peak per-tick cost, OS memory attribution and client frame times were not instrumented. All timed trials finished, and the client continued answering the verification scans. No claim about hitch-free interactive rendering follows from these timings.

Each individual or grouped edit finishes as one or more commands. Stopping a loop leaves completed commands in the world. WorldEdit commits use the player's own undo history. Undoing one WorldEdit change can affect later edits to the same positions. The native plan supports job cancellation between steps. This harness verified direct conditional cleanup on successful trials. Keep a closed-world copy for whole-session recovery.

## Fresh structures and architectural revisions

Each method started with the same design and world state in a disposable Fabric 26.3 lab. The clock included surveying the site, preparing and applying the edit, and reading back all 9,234 cells in the test volume. The schematic path wrote a new file and loaded it into WorldEdit for each trial. An independent readback also checked each undo. [Raw results](results/architecture-backends.json)

| Workload | Changed blocks | Guarded fills | MCP calls | WorldEdit schematic | MCP calls |
| --- | ---: | ---: | ---: | ---: | ---: |
| Build a curved bridge | 172 | 8.77 s | 533 | 0.29 s | 13 |
| Widen the bridge from three to five blocks | 175 | 9.64 s | 585 | 1.49 s | 85 |
| Build a tower | 375 | 31.18 s | 639 | 0.64 s | 15 |
| Move the doorway to the opposite side | 27 | 3.39 s | 79 | 2.38 s | 53 |

Guarded fills check world, player and block state as the edit progresses. The WorldEdit path pastes changed solid blocks with `//paste -a -o` and handles intentional removals with separate guarded fills. Both methods excluded a manual edit present at planning time. After the edit, the fixture placed a lantern on a changed block. Studio undo preserved the lantern on both revision workloads. WorldEdit undo restored its previous block there.

Use a schematic for a fresh placement where the destination is clear. Use Studio's guarded editor for conversational revisions where the player may continue building. These are single measurements on one PC with zero model calls. The MCP counts include checks and readback. This run did not measure frame times, server tick duration or memory.

To reproduce, launch a disposable lab copy and run `node --experimental-strip-types benchmarks/bridge-backends.mjs --lab-root <copied-project>`. [Harness](bridge-backends.mjs)

## Reproduce one bulk-edit trial

Start the lab, close menus, load the benchmark chunks, and keep the single human player's WorldEdit selection and clipboard available for this test. In a fresh empty copy of the benchmark volume, from the repository root:

```powershell
$node = "$env:ProgramFiles/nodejs/node.exe"
& $node benchmarks/run.mjs fill 100000 48 230 45 sp:WorldStudioLab
& $node benchmarks/run.mjs worldedit 1000 48 230 45 sp:WorldStudioLab WorldStudio
& $node benchmarks/run.mjs console-we 1000 48 230 45 sp:WorldStudioLab
```

The final player-name argument is required for `worldedit` and `schematic` trials, which send slash commands as the local client player. `console-we` binds its separate actor to the lab and resets the override after the trial. A failed preflight stops before writing. After a partial runtime failure, inspect the recorded correct-block count and the footprint before clearing it or restoring a backup.
