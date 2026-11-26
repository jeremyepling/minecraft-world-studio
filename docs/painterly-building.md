# Building and painting with Studio

Aim at solid ground and use **J → Ask Studio…**. Start with “Build a painterly medieval tower in warm limestone. Give it a copper roof and make the entrance the focal point.” In normal Minecraft chat, prefix the request with `@studio`. A tower and a curved bridge between named banks are the two executable subjects in this release.

| What you want | What to say in Minecraft |
| --- | --- |
| Give existing Studio masonry a direction | `@studio Paint this tower in cool weathered stone. Keep the roof.` |
| Simplify a busy surface | `@studio The walls are too noisy. Make them quieter.` |
| Preserve the style through a proportion change | `@studio Make this tower four blocks taller.` |
| Inspect its stored decisions | `@studio art direction` |
| Review the actual view | `@studio look Critique the entrance from here and suggest one improvement.` Move to the road or the opposite elevation and ask again. |
| Carry a style into another build | Aim at the styled exemplar and say `@studio save this as the project style`. Aim at a new site and say `@studio Build a tower here in the project style.` |
| Compare and recover | Use `@studio preview` followed by the proposed revision for a massing outline and block count. `@studio undo` reverses a committed edit. `@studio restore previous project style` rolls back the shared style choice. |

**What the painter can change.** Tower wall masonry and bridge structural stone accept warm limestone, cool stone or red brick, each at quiet, balanced or expressive coverage. The existing geometry defines openings, the curb, walkable deck, roof and marker anchors. Separate registered finishes handle roofs, drip stains and cast shadows. The weathering and shadow masks select related tones on painted stone. Fine-grained requests such as “remove just the bright window frame” can be discussed in a critique. Executing arbitrary window-frame paint masks is a later step. [Material roles and implementation](../packages/geometry/painterly-materials.md)

## What persists

The lab's private `local/chat-loop/state.json` holds a tower or bridge under its stable object key. The record includes origin, recipe, excluded cells and, for a bridge, named banks and bounds. The recipe's `artisticIntent` records its format version, art revision, semantic region bindings, palette, texture, atmosphere and focal point. A reused style records the source and its revision. The recipe separately holds dimensions, roof, drips, the surveyed waterline, and the actual light-source coordinates when applicable. The editor already scopes writes to the authorized world, dimension and player. Back up the lab state together with the matching save. [Structured intent](../skills/minecraft-artistic-building/references/artistic-intent.schema.json) · [Actual saved examples](painterly-chat-results.json)

An art revision advances when the direction changes. A height edit creates an object edit receipt while retaining the art revision. A change solely to mood or focal point can create a zero-block receipt. Undo restores its previous direction. Each applied edit compares the new recipe with the previous recipe and live cells. Hand edits are carried as exclusions. The undo stack is linear. A preview is transient. Mood and focal point guide the planner and critique; palette and texture drive the current material field.

The optional project style is a snapshot taken from a selected styled object. A player can inspect it with `@studio project style`. Each save keeps the preceding snapshot. Using it makes an independent copy on another object. Later changes to the source or project do not repaint its descendants. Geometry and location remain specific to each building. A plain utility tower stays plain. A project snapshot captures the palette, mood, texture and focal vocabulary. Local light positions, geometry-specific weathering and manual exceptions stay with their original building. Per-player preference profiles spanning worlds and spatially bounded district defaults are future work.

## Architecture

1. The existing Fabric menu or player chat sends the request, view ray, markers and selection to the local listener. The survey identifies the active object. The marker and edit workflows keep their existing entry points.
2. The planner passes the active recipes and project style to the provider. Requests concerning artistic intent load the portable skill plus at most two relevant knowledge modules. A styled tower carries the skill into a simple “make it taller” follow-up. The model returns a bounded, typed design decision. Its prose never becomes an arbitrary world command. [Skill](../skills/minecraft-artistic-building/SKILL.md) · [Planner](../scripts/studio-planner.mjs)
3. Studio merges changed fields into the object's intent. The geometry package assigns a field value to eligible masonry using smooth patches at two scales. Native shadows, the waterline mask and sill streaks can modulate it. The same recipe generates the same design for checked writes, verification or Sponge schematic export. Export contains blocks. The object and its revision history stay in Studio's private state. [Intent merge](../scripts/artistic-intent.mjs) · [Editor](../scripts/tower.mjs)
4. A read-only `look` or `critique` request attaches the current framebuffer for a vision-capable provider. Other providers can assess the supplied recipe and spatial context, with the limitation stated in chat. The player controls further viewpoints. Codex, the loopback Ollama adapter and the test mock share the same decision contract. A Claude runtime can reuse the Markdown and geometry after an adapter implements that contract. [Provider capabilities](agent-providers.md)

## Artistic references

The skill uses value first and examines hue and texture together when two blocks meet. WesterosCraft describes the tradeoff between shade, color and surface pattern. ArdaCraft shows how connected textures can change a blend when the same pair of blocks occupies a larger area. Studio applies these observations by checking adjacent palette steps and reviewing the facade at several distances. The specific ramps, noise scales and editor controls are Studio design choices. [WesterosCraft](https://westeroscraft.com/docs/building/fundamentals/gradients) · [ArdaCraft](https://www.ardacraft.me/resources/gradient-guide)

The catalog holds 35 source and subject records, including ten studies of inspected images. Search for a technique such as negative space, temperature or masonry, then use the observation, suggested exercise and limits together. A creator thumbnail can illustrate silhouette and hierarchy while leaving the actual block identities unresolved. Code-license findings apply to the named projects. Third-party images and builds stay at their original links. [Searchable catalog](../skills/minecraft-artistic-building/references/catalog.json)

## Material evidence

The vanilla 26.3 lab listed no optional resource packs. Studio's offline sampler resolved the actual full-cube blockstate, inherited model and face textures for every shipped palette member. It averages opaque pixels in linear light, transforms the average to OKLab and records per-pixel lightness spread and horizontal and vertical neighbor contrast. The first measurement found andesite was lighter than the stone-brick base. Tuff now fills that intermediate shadow step. A test checks the north-face lightness ordering of every shipped ramp against the measured report. Surface pattern and actual lighting still need visual judgment. [Measured faces and archive fingerprint](painterly-palette-26.3.json)

To reproduce in PowerShell, use Python 3.11+ with Pillow installed and Node.js 22.16+.

```powershell
$blocks = node --experimental-strip-types --input-type=module -e "import {painterlyMaterials} from './packages/geometry/painterly-materials.ts'; console.log(painterlyMaterials.join('\n'))"
python experiments/palette-metadata.py local/game/versions/26.3/26.3.jar @blocks
```

Add `--pack <zip>` for each ordinary resource-pack ZIP, lowest priority first. The report identifies each layer by SHA-256. This is an offline sample of curated blocks. Animated or translucent images, multipart or weighted states, rotated or tinted faces, pack filters and versioned overlays need separate handling. The tool lists unsupported models or rejects an unsupported pack. It does not publish Minecraft textures or import an active pack into the game. [Sampler](../experiments/palette-metadata.py)

## Priorities and acceptance

| Priority | Deliverable | Acceptance |
| --- | --- | --- |
| 1 · Next playable slice | Give the player a bounded existing wall or arch to paint. Survey exposed full-cube faces, identify the opening and sill, show the proposed mask, and allow corrections. | Change one selected surface and its drip tails. Compare two fixed views, preserve stairs, windows, block entities and hand edits, and undo exactly. |
| 2 · Palettes | Expand the measured candidates by pack and face. Rank complete ramps on OKLab value/hue progression, edge density, texture compatibility, geometry and physical behavior. Add material-specific hue and chroma controls. | Produce a warm and cool ramp that read as the same surface at two distances under two pack profiles. Store seed, pack fingerprint and chosen ramp with the build. |
| 3 · Geometry-aware painting | Extend semantic surfaces to arch soffits, roof valleys, convex ridges and focal masks. Add scale-relative fields, per-object seeds, orientation and exposure to the existing renderer. | Matched fixtures show broken soft shadow edges, coherent weathering sources and quiet secondary surfaces. Geometry, directional block states and unrelated objects survive. |
| 4 · Visual refinement | Save camera bookmarks and compare before/after/alternative views at fixed distance, lighting and FOV. Persist accepted preference statements independently from provider conversation. | Player can choose a variant and continue it after a restart. Visual critique names an observable issue and inspection can confirm the effect of a localized revision. |
| 5 · Reference research | Add frame-level studies and analyze block relationships in authorized schematics. Expand semantic materials to cliffs, foliage and villages. | Each study documents attribution, rights, viewing conditions, transferable relationships and limitations. Compare a holdout build before adopting a rule. |

## Benchmark protocol

Keep the fixture geometry, protected edits, field seed, pack order, observer, camera pitch, FOV and weather fixed across treatments. Capture the original, one primary medium view, a close detail, a far silhouette and an alternate approach. Record time and cloud movement. Compare side by side in color and optionally grayscale. Count unequal neighboring surface pairs, isolated accents, palette-step jumps and contrast by semantic region. Pair the measurements with a human choice and the reason for it.

| Fixture family | Primary comparison |
| --- | --- |
| Flat medieval wall, recessed-window wall, archway | Uniform, independent weighted random and straight height gradient against clustered material, occlusion and gravity-driven stains. Check unbroken openings. |
| Circular tower, steep fantasy roof, plaster building | Cluster scale, warm/cool hue shifting, roof/wall separation, shelter and repairs. Check states and untouched regions. |
| Cliff, organic tree | Crevices and canopy interiors against exposed faces. Verify branches, cavities and irregular silhouette. |
| Modern concrete building, small medieval village | Quiet functional control, relative focal contrast, shared palette with local variations and protected hand-built neighbors. |

The live tower and offline tower/bridge are the current regression fixtures. The earlier wall gallery and architectural patina captures remain available for comparison. Other families and the complete treatment matrix above are planned. [Live comparison](painterly-results.md) · [Project testing](testing.md) · [Searchable research catalog](../skills/minecraft-artistic-building/references/catalog.json)
