# Painterly masonry

Pass a version 1 `artisticIntent` on a tower or bridge recipe to render a palette. Its `palette` selects a set of full, state-free Minecraft blocks. Its `texture` selects quiet, balanced or expressive coverage. The generator uses the following semantic roles.

| Palette | Base | Midtone | Shadow | Light | Deep shadow |
| --- | --- | --- | --- | --- | --- |
| Warm limestone | Cut sandstone | Sandstone | Dripstone block | Smooth sandstone | Brown terracotta |
| Cool stone | Stone bricks | Tuff | Polished tuff | Smooth stone | Deepslate bricks |
| Red brick | Bricks | Terracotta | Brown terracotta | Granite | Nether bricks |

The field samples smooth three-dimensional noise at two scales, 11 and 3.4 blocks. A small foundation bias darkens the lowest courses. Texture density changes the thresholds on that field, so quieting a wall opens up longer stretches of its base color. Coordinates are relative to the object origin. Editing a description, changing the revision number, or exporting a schematic preserves the field.

Tower shafts and bridge footings and arch masonry receive this finish. The original geometry still defines openings, wet areas and occlusion. Where an existing waterline, drip or shadow falls on painted masonry, it uses the corresponding tonal roles of the selected palette. The deepest shade appears only in a strong opening stain or cast shadow. Roofs, rail trim, deck treads and marker coordinates retain their existing treatment. Recipe generation produces the proposed blocks. The edit adapter compares those blocks against live manual changes.

The implementation and the adapter's allowlist use the exported `painterlyPalettes` and `painterlyMaterials` definitions. A missing or null intent renders the legacy recipe. The current renderer consumes palette and texture. Atmosphere, focal point and region descriptions remain available to the planning and review workflow. [Material field](painterly-materials.ts) · [Geometry tests](painterly-materials.test.mjs)
