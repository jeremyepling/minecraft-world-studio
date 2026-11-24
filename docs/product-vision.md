# Minecraft World Studio — Product Vision and Long-Term Architecture

## 1. Product vision

Minecraft World Studio is an AI-powered collaborative creative environment that enables humans and AI agents to design, build and continuously develop Minecraft worlds together.

We are not building a chatbot that happens to execute Minecraft commands. We are building a creative partner that understands spatial context, architecture, artistic composition, terrain, materials and the evolving history of a Minecraft world.

The experience should combine the best aspects of:

* Minecraft and Axiom: Immersive, hands-on creative building and immediate visual feedback.
* Codex and Claude Code: Conversational collaboration, persistent context, extensible tools and autonomous execution.
* Fusion and Onshape: Parametric geometry, editable objects and non-destructive revisions.
* GIS and urban planning software: Spatial analysis, geographic layers, regional planning and infrastructure.
* Professional artistic workflows: Reference libraries, palettes, composition, design critique and iterative refinement.

The primary interaction should happen inside Minecraft. The human should feel like they are collaborating with an architect, artist and building partner who shares their world.

The AI should amplify human creativity, not replace it.

## 2. The experience we are working toward

Imagine entering an existing Minecraft world and standing on a hillside overlooking a river.

I say:

> I want to build a medieval settlement here. Let’s put a castle on that hill, a market district near the river and a residential area on the other side. Keep the existing forest and make the roads follow the natural terrain.

The AI surveys the world, analyzes elevation, identifies suitable building locations and proposes a settlement plan.

It presents an in-game map with proposed districts, roads, bridges and landmarks.

I walk around the area, point at locations and refine the plan:

> Move the castle farther back so it sits on the skyline. Keep this valley open. Put the bridge here instead.

The AI updates the plan and displays proposed changes.

We then focus on individual buildings:

> Build a stone watchtower here. Make it roughly 35 blocks tall, with a tapered base and an exaggerated copper roof. Show me three silhouettes before adding details.

The AI generates alternatives using reusable geometry tools.

I select one and ask for changes:

> Make the roof less symmetrical. Add a balcony on this side. Use the same stone palette as the castle, but make the foundation look older.

The AI modifies the underlying architectural object rather than reconstructing everything from scratch.

It applies intentional texturing based on artistic principles, environmental context and my personal preferences.

I can manually adjust the building with Axiom or normal Minecraft tools. The AI recognizes my changes and preserves them during subsequent revisions.

At any point I can ask:

> What would make this look better?

The AI inspects the structure from relevant perspectives, critiques its composition and proposes meaningful improvements.

Weeks later, I return to the world and the AI remembers the settlement plan, approved architectural styles, previous decisions and ongoing projects.

This is the long-term experience we are building toward.

## 3. Core product pillars

### A. Natural in-game collaboration

The human should rarely need to leave Minecraft to communicate with the AI.

Eventually support:

* In-game text conversation.
* Push-to-talk.
* Optional spoken responses.
* Natural conversational voice.
* Spatial pointing.
* Named markers and selections.
* Contextual screenshot sharing.
* Real-time progress reporting.
* Agent interruption and redirection.
* Build approval and revision.
* Persistent conversations.
* Configurable AI and speech providers.

The agent should understand references such as:

* This wall.
* That tower.
* Over there.
* Between these two points.
* The roof we just built.
* The same style as the market district.

The AI should retrieve additional world information when necessary instead of requiring the human to describe everything manually.

### B. Spatial intelligence and world understanding

The AI should understand the Minecraft world as a spatial environment, not merely a collection of blocks.

It should eventually be able to inspect:

* Terrain elevation.
* Slopes.
* Biomes.
* Waterways.
* Vegetation.
* Existing architecture.
* Roads and transportation networks.
* Buildable land.
* Underground spaces.
* Sightlines.
* Landmarks.
* Protected regions.
* Planned development areas.
* Architectural relationships.

It should have access to multiple representations of the world:

* Structured block data.
* Heightmaps.
* Top-down maps.
* Isometric views.
* Architectural elevations.
* Cross-sections.
* First-person screenshots.
* Independent camera perspectives.

The AI should be capable of surveying a region and reasoning about appropriate building placement, terrain integration and composition.

Do not rely exclusively on screenshots when structured spatial data is more appropriate.

Do not rely exclusively on block data when visual judgment is required.

### C. High-fidelity geometric building

The AI should have access to expressive building tools rather than being limited to placing individual blocks.

We eventually want a composable voxel geometry SDK with capabilities including:

* Cuboids, cylinders, spheres, cones and ellipsoids.
* Arbitrary polygon extrusion.
* Profile lofting.
* Sweeps along splines.
* Curved walls.
* Arches.
* Tapering.
* Twisting.
* Bending.
* Hollowing.
* Boolean union, subtraction and intersection.
* Rotation, mirroring and scaling.
* Repetition along lines and curves.
* Mathematical shape generation.
* Mesh voxelization.
* Parametric architectural components.

These operations should compose into more sophisticated structures such as:

* Towers.
* Roofs.
* Bridges.
* Staircases.
* Vaults.
* Domes.
* Defensive walls.
* Buildings.
* Roads.
* Organic terrain.

Prefer deterministic algorithms over individual model-generated block placements.

The AI should express design intent and parameters. The building engine should calculate and apply the resulting blocks efficiently.

Where possible, reuse existing libraries, WorldEdit capabilities, Minecraft APIs and schematic formats.

Do not build another WorldEdit unnecessarily.

### D. Artistic intelligence

The AI should eventually demonstrate meaningful artistic judgment.

A major source of inspiration is BdoubleO100 (Bdubs), particularly his painterly approach to Minecraft architecture, landscapes, color and texturing.

Other valuable references include WesterosCraft, Enginnx, Axiom building techniques and the Generative Design in Minecraft research community.

We want to develop a reusable artistic knowledge system that teaches the AI:

* Composition.
* Silhouette.
* Massing.
* Proportions.
* Visual hierarchy.
* Focal points.
* Color theory.
* Material selection.
* Architectural depth.
* Environmental storytelling.
* Landscape design.
* Regional architectural consistency.
* Believable weathering.
* Intentional variation.

A central principle is that Minecraft blocks should be treated as artistic materials with colors, values, textures and shapes, not exclusively according to their literal names.

For example, a block traditionally associated with wood might be useful in a stone gradient if its color and texture contribute to the desired artistic effect.

We want intentional, contextual texturing rather than random material replacement.

A sophisticated texturing system should eventually account for:

* Height.
* Surface orientation.
* Exposure.
* Architectural shadows.
* Moisture.
* Weathering.
* Distance from foundations.
* Distance from edges.
* Spatially coherent noise.
* Material transitions.
* Intended viewing distance.
* Installed resource packs and block textures.

The AI decides the intended artistic effect. Deterministic algorithms implement the material distribution.

Artistic knowledge should remain separate from the geometry and execution engines.

We should be able to introduce new artistic styles without modifying the underlying Minecraft integration.

### E. Persistent architectural objects

Minecraft fundamentally stores individual blocks, but we want to maintain a lightweight semantic object model above them.

For example:

```text
Riverside Castle
  Main keep
    Foundation
    Exterior walls
    Roof
    Windows
    Entrance
  Eastern tower
    Tower body
    Copper roof
    Balcony
    Staircase
  Western tower
  Curtain wall
    Curved wall
    Battlements
  Gatehouse
  Surrounding landscape
```

Each generated object could eventually maintain:

* Stable identifier.
* Human-readable name.
* World and dimension.
* Position and bounding region.
* Geometry parameters.
* Material parameters.
* Relationships to other objects.
* Generation seed.
* Generated block representation.
* Revision history.
* Manual overrides.
* Associated references and design decisions.

This enables conversational revisions such as:

* Make the eastern tower match the western tower.
* Increase the height of the main keep by six blocks.
* Change every roof in the market district to oxidized copper.
* Move the bridge closer to the village.
* Make the foundation look older.
* Reuse this window design on the other buildings.

The system should modify the relevant design parameters where appropriate rather than blindly replacing arbitrary regions of blocks.

Not every existing Minecraft structure needs to become a fully parametric object. We should also support identifying, inspecting and modifying manually constructed architecture.

### F. Non-destructive creative control

Eventually, the user should have a high degree of control over proposed world modifications.

Desired capabilities include:

* Ghost-block previews.
* Proposed building outlines.
* Alternative designs.
* Affected-region visualization.
* Material previews.
* Approval before committing changes.
* Undo and redo.
* Build snapshots.
* Revision history.
* Region protection.
* Conflict detection.
* Transactional world updates where practical.

An important principle is preserving human-created changes.

If a user manually edits an AI-generated building, the AI should not overwrite those changes during a subsequent revision without permission.

We should eventually support a three-way spatial comparison between:

1. Previously generated blocks.
2. Current Minecraft world blocks.
3. Newly proposed blocks.

This is analogous to three-way merge conflict detection in Git.

The system should distinguish intentional human modifications from its own generated content.

### G. World-scale planning

The system should eventually support the development of entire worlds, not just individual buildings.

Potential functionality:

* Settlement master planning.
* District boundaries.
* Regional architectural styles.
* Road and railway networks.
* Bridges and tunnels.
* Agricultural areas.
* Parks and public spaces.
* Castles and fortifications.
* Harbors.
* Natural landscapes.
* Landmark placement.
* Future expansion planning.

The AI should be able to propose and maintain a living world plan.

For example, we might establish:

* A hilltop castle as the primary landmark.
* A market district near a river crossing.
* Residential buildings along winding roads.
* Farms outside the settlement.
* Protected forests.
* A future industrial district.
* Consistent regional building palettes.

These plans should persist across sessions and be updated as the world evolves.

We should be able to visualize them through maps and eventually native in-game planning overlays.

Useful evaluation principles from procedural settlement generation research include:

* Adaptability to terrain.
* Functionality.
* Narrative coherence.
* Aesthetics.
* Consistency with the user’s preferences.

### H. Learning personal creative preferences

The AI should gradually become a better creative partner by learning what the user likes and dislikes.

We should maintain a durable preference and reference library covering:

* Architectural styles.
* Building proportions.
* Roof shapes.
* Color palettes.
* Texturing density.
* Material combinations.
* Terrain styles.
* Vegetation.
* Architectural details.
* Levels of realism.
* Fantasy exaggeration.
* Composition.
* Environmental atmosphere.

The user should be able to share screenshots, videos, examples and feedback.

The system should extract reusable principles from those references rather than merely collecting images or transcripts.

For example:

> I like how Bdubs concentrates darker materials around the foundation, but I don’t want the roof to have so many competing colors.

The system should preserve that as an actionable artistic preference.

Eventually, we could maintain a separate creative reference world containing:

* Approved palette samples.
* Wall textures.
* Roof designs.
* Windows and arches.
* Vegetation.
* Terrain examples.
* Architectural components.
* Representative buildings.

The AI should be able to inspect and reuse these references while adapting them to new contexts.

## 4. AI agent and provider independence

The product should not be permanently tied to one AI provider.

I currently want to use Codex, but other users may prefer Claude Code, locally hosted models or other agent systems.

Design the architecture to support:

* OpenAI Codex.
* Claude Code.
* Ollama.
* Other local model providers.
* API-based AI agents.
* Future agent runtimes.
* Mock agents for development.

Recognize the difference between a model inference provider and a complete agent runtime.

Codex and Claude Code already provide significant agent infrastructure. Local models may require additional orchestration for tool calling, persistent conversation state and MCP integration.

Use capability-based interfaces instead of assuming every provider supports the same features.

The Minecraft UI should not contain provider-specific business logic where avoidable.

Similarly, speech recognition and speech synthesis should be independently configurable.

A user should be able to combine:

* Codex with local Whisper and Piper.
* Claude Code with cloud transcription.
* Ollama with local speech recognition and synthesis.
* Any supported agent with text-only interaction.

Provider-specific credentials should remain outside the Minecraft mod.

Do not implement every provider immediately. Preserve the working provider and establish appropriate extension points.

## 5. Architectural philosophy

We want to reuse existing infrastructure wherever possible.

### Existing components

Our preferred starting foundation is:

**MCPFabric**

Provides Minecraft interaction, world inspection, screenshots, command execution, scripting, construction plans and other agent tools.

**WorldEdit**

Provides efficient block manipulation, geometric operations, masks, patterns, clipboard operations and schematic support.

**Axiom**

Provides a powerful manual building and editing experience for the human player.

**Codex App Server**

Provides programmatic agent interaction, conversation management, streaming responses, MCP integration and execution control.

**Existing speech providers**

Provide speech recognition and synthesis without requiring us to build audio models or speech infrastructure.

Retain these components wherever they meet our requirements.

### Custom components

We expect our own implementation to concentrate on:

**Minecraft client experience**

A Fabric Java mod responsible for native game interfaces, HUDs, keybindings, spatial context, markers, selections and eventually previews.

**Local orchestration service**

A service responsible for agent integration, provider configuration, speech processing, sessions, communication and lifecycle management.

**Geometry and materials SDK**

Reusable deterministic algorithms for higher-level geometry, architectural construction, material painting and terrain manipulation.

**World knowledge system**

Persistent world metadata, architectural objects, world plans, design decisions and creative preferences.

**Agent skills**

Reusable instructions and workflows that teach the AI how to survey worlds, design architecture, construct geometry, apply artistic principles and critique its work.

**Companion Minecraft integration**

Additional Minecraft-side capabilities only where needed, such as ghost previews, independent rendering cameras, efficient edit transactions and manual block-change awareness.

These responsibilities do not necessarily require separate repositories or deployable services. Choose appropriate module boundaries based on the existing implementation and actual engineering needs.

## 6. Tools, algorithms and skills

Keep these three concepts distinct.

**Tools**

Tools expose capabilities to an AI agent.

Examples:

* Inspect region.
* Query heightmap.
* Render view.
* Create geometry.
* Apply material palette.
* Place schematic.
* Preview changes.
* Commit edits.

**Algorithms**

Algorithms deterministically perform complex operations.

Examples:

* Generate a tapered tower.
* Rasterize a spline.
* Voxelize a polygon.
* Calculate surface exposure.
* Apply coherent noise.
* Generate a weathering gradient.
* Find a road path across terrain.
* Calculate a block difference.

Algorithms should be independently testable wherever practical.

**Skills**

Skills teach the AI how and when to use tools and algorithms.

Examples:

* How to design an aesthetically pleasing tower.
* How to choose an architectural palette.
* How to texture stone in a painterly style.
* How to plan a medieval settlement.
* How to critique visual composition.
* How to preserve existing human work.
* How to select an efficient execution strategy.

Potential future skills:

* minecraft-world-survey
* minecraft-master-planning
* minecraft-architecture
* minecraft-geometry
* minecraft-texturing
* minecraft-landscaping
* minecraft-composition
* minecraft-design-review
* minecraft-reference-learning
* minecraft-build-execution

Use a portable agent skill format where practical.

Do not hardcode artistic decision-making into every individual geometry function.

## 7. Example future building workflow

A typical sophisticated building operation might eventually work like this:

1. Human submits a conversational request from inside Minecraft.
2. Client captures relevant spatial context.
3. Agent interprets the request.
4. Agent surveys the surrounding world.
5. Agent retrieves relevant artistic skills and project references.
6. Agent proposes a design.
7. Geometry SDK generates the structure.
8. Materials SDK calculates appropriate artistic textures.
9. System renders or previews the proposed changes.
10. Agent evaluates the design visually.
11. Human requests adjustments or approves the proposal.
12. Execution engine applies the approved block changes.
13. System verifies the resulting structure.
14. Object metadata and design history are persisted.
15. Human and AI continue collaborating.

Not every operation should require every step.

A simple request to replace a block should remain simple.

Avoid introducing excessive orchestration or approval friction into low-risk operations.

## 8. Important product principles

**The human remains in control**

The AI should support different levels of autonomy, ranging from observation and recommendations to autonomous building in explicitly authorized creative areas.

**Minecraft is the shared creative space**

The primary experience should happen in the game, not in an external terminal or web application.

External interfaces can supplement the experience but should not be mandatory for normal collaboration.

**Creativity over infrastructure**

Reuse proven Minecraft and AI infrastructure. Invest custom development effort in the creative experience and capabilities that are missing.

**Structured operations over GUI automation**

Prefer direct world APIs, MCP tools, WorldEdit, schematics and deterministic algorithms.

Do not make computer use or Axiom GUI automation the primary execution strategy.

**Visual quality matters**

A technically correct building is not necessarily an aesthetically pleasing building.

The AI should eventually inspect, critique and refine its own work.

**Context should persist**

World knowledge, architectural decisions and user preferences should survive individual conversations, provider changes and application restarts.

**Manual building remains valuable**

The user should be able to use normal Minecraft controls, Axiom and WorldEdit while collaborating with the AI.

The system should complement human creativity rather than requiring the user to stop building.

**Performance matters**

The AI should be able to construct substantial structures without excessive model calls, individual block requests or unacceptable Minecraft performance degradation.

**Safety and recoverability matter**

Avoid unintended changes to existing worlds.

Use explicit world authorization, meaningful permission enforcement, bounded operations, snapshots and recovery mechanisms as appropriate.

**Build incrementally**

Deliver usable vertical slices. Validate the actual experience before expanding architectural complexity.

Do not implement speculative infrastructure merely because it might eventually be useful.

## 9. Long-term product roadmap

### Milestone 1 — In-game collaboration

Establish the core human-AI interaction loop.

* Persistent agent connection.
* Configurable providers.
* In-game conversation.
* Push-to-talk.
* Spoken responses.
* Spatial context.
* Markers.
* Activity reporting.
* Interruption.
* Conversation persistence.
* Reliable development and testing workflow.

Success means I can comfortably spend an hour building with the AI inside Minecraft.

### Milestone 2 — Building fluency

Establish higher-level geometric capabilities.

* Composable geometry SDK.
* Efficient execution backends.
* Parametric building components.
* Curves, extrusions, lofts and sweeps.
* Boolean operations.
* Schematic integration.
* Repeatable construction workflows.
* Automated geometry tests.

Success means the AI can reliably generate sophisticated architecture without excessive tool calls or inefficient individual block placement.

### Milestone 3 — Artistic intelligence

Improve the quality of generated builds.

* Artistic agent skills.
* Minecraft color and texture analysis.
* Palette generation.
* Contextual material painting.
* Weathering.
* Terrain blending.
* Architectural principles.
* Visual design critique.
* Personal aesthetic preference library.
* Reference world.

Success means generated buildings begin to look intentionally designed and handcrafted rather than mechanically generated.

### Milestone 4 — Creative control

Make sophisticated building iterations safe and natural.

* Ghost previews.
* Multiple design alternatives.
* Persistent object identities.
* Parametric revisions.
* Manual edit preservation.
* Conflict detection.
* Revision history.
* Undo and rollback.
* Independent visual inspection.

Success means I can collaboratively refine a complex structure over many iterations without losing manual work or repeatedly rebuilding everything.

### Milestone 5 — World-scale creative studio

Expand from individual structures to coherent worlds.

* Terrain surveys.
* Regional maps.
* District planning.
* Transportation networks.
* Architectural consistency.
* World development plans.
* Long-term project memory.
* In-game planning overlays.
* Persistent regional design systems.

Success means the AI can collaborate with me on developing an entire Minecraft world over weeks or months.

### Future expansion

Potential later opportunities:

* Multiplayer collaboration.
* Multiple human participants.
* Multiple specialized AI agents.
* Natural full-duplex voice.
* Additional Minecraft versions and mod loaders.
* Survival-mode construction assistance.
* Material shopping lists.
* Litematica blueprint generation.
* Public mod distribution.
* Community-shared artistic skills.
* Shared geometry libraries.
* Community style and palette packs.

These are future possibilities, not commitments for current implementation.

## 10. Immediate development scope

The working technical prototype already exists.

We are currently implementing Milestone 1: In-game collaboration.

Do not attempt to implement the entire product vision in the first milestone.

Use this document to understand the destination and to avoid obvious architectural dead ends.

In particular:

* Preserve provider independence.
* Preserve the ability to introduce richer spatial context.
* Preserve the distinction between tools, algorithms and skills.
* Keep world knowledge separate from provider-specific conversation state.
* Avoid tightly coupling the Minecraft UI to a particular agent runtime.
* Avoid making future preview and approval workflows unnecessarily difficult.
* Keep the Minecraft integration extensible.
* Maintain reliable testing and development workflows.
* Reuse existing working components.

However, do not create empty frameworks, services, packages or abstractions for every future capability.

Introduce extension points where they provide immediate value or prevent a clear near-term architectural problem.

The detailed Milestone 1 implementation instructions follow this product vision.

## 11. Instructions for maintaining project context

Save this product vision in an appropriate durable project document, preferably docs/product-vision.md.

Reference it from the repository’s AGENTS.md or equivalent agent instructions.

Maintain separate documentation for:

* Product vision.
* Current milestone.
* Architecture.
* Technical decisions.
* Known limitations.
* Testing procedures.
* Future roadmap.

The product vision should remain relatively stable.

Update current milestone documentation and technical decisions as implementation progresses.

When making architectural decisions, distinguish between:

* Requirements needed immediately.
* Requirements expected in the next milestone.
* Long-term capabilities that should remain possible.
* Speculative capabilities that do not yet justify implementation.

If a technical decision conflicts with the long-term product vision, document the tradeoff.

The goal is to build an enjoyable and genuinely useful creative environment incrementally, while maintaining a coherent direction across many development sessions.
