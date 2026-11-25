# From a prototype to a building partner

The first useful loop is to point at a hill, request a build there, walk around it and request one revision. The player should be able to place a custom block between those steps and find it still there afterward.

## One collaboration loop

1. Bind a request to this world, dimension, player, eye ray and selected bounds. Read terrain and the affected cells. Report an entrance facing and a proposed footprint the player can identify.
2. Generate massing locally from a few parameters. Show a slice, dimensions and material counts. A temporary, separate staging plot or external schematic viewer is enough for a first visual preview. A command-generated change to the real site is a commit.
3. For a build request, re-read the footprint and compare it with the survey. Apply a bounded difference with a recorded seed and before-state. Check the changed cells and one ring of untouched neighbors. Keep an uncertain or interrupted operation pending until readback resolves it.
4. Reply in the game with the location and a short description. For an edit request, reuse the geometry parameters, survey again, and present any human changes before modifying the same cells.

Addressed chat reaches a local listener and a persistent agent runtime. The listener saves the transcript and spatial references, validates agent decisions, and issues conditional Minecraft writes per column. Read-only visual turns can include the current framebuffer. [Collaboration controls](collaborate.md) · [Implementation and limits](in-game-building.md)

## Boundaries for Milestone 1

The native client menu submits addressed chat from the lab player. For a new marker it includes the block under the crosshair when the menu opened. The listener checks the world, range and live block before saving the point. The picker reads the scoped Studio session when opened. Menu, typed and spoken requests share the same dispatcher, edit receipts and HUD replies. WorldEdit uses its own history. [Current milestone](current-milestone.md) · [Technical decisions](decisions.md)

| Responsibility | Direction as the collaboration loop grows |
| --- | --- |
| Minecraft client | Carry the request, player context, markers, selections, progress and interruption. Introduce native Fabric input or rendering when an in-game interaction needs it. Keep provider credentials and runtime-specific logic in the local process. |
| Local orchestration | The persistent Codex App Server adapter resumes a thread per lab/player, interrupts turns and accepts images. Ollama supplies text inference through loopback, and a mock adapter exercises the listener offline. The listener selects features from runtime capabilities. |
| Speech | The opt-in Windows helper authorizes each push-to-talk hold against the focused lab. The transcript uses the same request handler as chat. Recognition and synthesis can be enabled independently. [Speech controls](voice.md) |
| World knowledge | Keep stable world and dimension references, spatial observations, creative preferences and edit receipts in Studio-owned storage. A provider thread ID can point to a conversation. The world plan must survive replacing that provider. |
| Building and artistic knowledge | Tools expose operations such as surveying or committing a difference. Algorithms compute geometry and materials reproducibly. Agent skills explain when to use those operations and how to judge the result from multiple viewpoints. |

These are responsibilities within the evolving product. Split a package or process when the working interaction needs that boundary. [Product vision](product-vision.md) · [Future roadmap](roadmap.md)

The initial proposal for asynchronous in-game requests was a **local listener** that reads addressed messages from the known player, tracks the event cursor, and submits one turn to a dedicated Codex thread. Persist the cursor and request ID to prevent replays on reconnect. Handle interrupt separately from undo. Keep the local player in charge of applying changes, especially following cancellation or a stale survey. This runner could use Codex app-server's documented thread and turn methods with the same MCP registration. A chat message becomes input data. It should never grant more game or filesystem permissions. [Codex app-server](https://developers.openai.com/codex/app-server/) · [MCB prompt queue](https://github.com/Gasased/mcb) · [ACP example](https://github.com/emil28092005/minecraft-builder-mcp)

## Standalone geometry SDK

The tower uses two circular lofts sampled in local integer coordinates, with world +X east, +Y up and +Z south. The wall and cap have independent shell thicknesses. Subtractive predicates cut the openings before material assignment. The adapter translates emitted occupied cells by the tower origin. A cell removed from the old design proposes a guarded air write. Air outside both designs receives no write. The original QuickJS experiment remains a compatibility reference. [Geometry](../packages/geometry/voxels.ts) · [Adapter](../scripts/tower.mjs)

Start with integer coordinates, a bounded sparse voxel field, immutable transforms, cylinder/profile sampling, hollowing and subtraction. Add explicit air and a distinct untouched cell. Make materials a second pass over positions, normals or exposed faces, height, nearby water and a fixed seed. Preserve full block states, including orientation and waterlogging, in the Minecraft adapter. Define the coordinate convention once and test a rotated stair against the game.

Use seeded coherent noise to place variation in patches. Combine it with a directional value ramp, a smaller foundation dampness term and exposure tests. Give the artist parameters with visible units, such as patch width in blocks and foundation depth. A histogram alone cannot tell whether two surfaces have the same composition. Compare fixed-camera captures and colors at several distances.

| Candidate | What it could supply | Adoption check |
| --- | --- | --- |
| simplex-noise.js | 2D and 3D noise with an injected seeded random generator | Freeze generator and seed for repeatable materials. Test adjacent chunks for seams. [Library](https://github.com/jwagner/simplex-noise.js) |
| Three.js CatmullRomCurve3 | Sampled splines for centerlines, sweeps and variable road widths | Test arc-length sampling, corner overshoot and maximum road grade offline. [API](https://threejs.org/docs/pages/CatmullRomCurve3.html) |
| voxelize | Triangle meshes to an ndarray | Defer until a real mesh input arrives. Test thin features, axis conventions, interior fill and scale on a tiny closed mesh. [Library](https://github.com/mikolalysenko/voxelize) |
| prismarine-schematic | Schematic reading and writing from Node | Round-trip block states, offsets and data version with WorldEdit 7.4.6 before selecting this codec for 26.3. Registry coverage, block entities and format versions need a fixture. [Library](https://github.com/PrismarineJS/prismarine-schematic) |
| WorldEdit | Native shapes, masks, history, schematics and transformations | Prefer its existing operations when the player's edit session and readback give the desired behavior. [API](https://worldedit.enginehub.org/en/latest/api/) |

Keep npm libraries on the external TypeScript side. The stock QuickJS guest has bounded memory, no npm loader and limited bridge calls. For a few cuboids, emit fills. For repeated, heterogeneous geometry, compare a schematic paste with coalesced state runs. Native plans offer semantic checks for openings, materials, rotation and reachability on small structures. A complex loft should never require a separate model turn per block. Defer mesh booleans, baked lighting and regional automation until a build requires them.

## Human edits and future architectural objects

The smallest useful stored object is one ID, world/dimension, transform, parameters, palette, seed and the last committed state for owned cells. Later, connect parts through parent IDs and maintain an immutable revision log. Bounds accelerate queries but cannot establish ownership. An untouched courtyard inside a castle's bounds still belongs to the player.

| Relationship among prior generated, live and proposed states | Action |
| --- | --- |
| Live equals prior | Apply the proposed difference. |
| Live equals proposed | Already satisfied. |
| Proposed equals prior but live differs | Keep the live edit. |
| All three differ | Show the affected cells and let the player choose. Preserve them by default. |
| Proposed expansion reaches a previously unowned cell | Check the surveyed live state and protected area before claiming the cell. |

Include block entities and multiblock dependencies in any eventual transaction model. Replacing a container from a block ID alone cannot restore its contents. Checked undo applies the inverse only where current state still matches the recorded after-state. A crash journal and atomic live compare-and-apply would close a race that external read-then-write cannot eliminate. MCPFabric memory can remember the name of a tower. Its plans can compare a target with the current world, but neither tracks who changed a particular stone. The collaborative Paper project already demonstrates parts of this design. [Source assessment](source-review.md) · [Checked editor](https://github.com/emil28092005/minecraft-builder-mcp)

## Where native code earns its cost

Keep the first listener, geometry and material computation outside the game. An independent Fabric companion becomes worthwhile for an atomic server-tick comparison and commit, ordered block-change events with attribution, native region locks, or a transaction integrated with WorldEdit's Java history. Native ghost overlays, an independent client render pass, spatial markers, voice keys and a dedicated in-game panel are other candidates after testing existing Axiom or Litematica features. A second client can supply a separate camera at additional runtime cost. An external MCP process alone cannot make a multi-request Minecraft edit atomic. A companion can expose a narrow Minecraft command first. Only add a second MCP protocol if command arguments and result readback prove inadequate.
