---
name: minecraft-cast-shadows
description: Paint directional architectural shadows on registered masonry under eaves, decks and other projecting geometry.
---

Treat the stated source as the light emitter. A point below an overhang darkens when the structure interrupts the line toward the light. Keep the ground, unrelated builds, roof finish and walking lane intact. This pass bakes a material choice into the build.

For an explicit shadow edit use revise for a tower or revise_bridge for a bridge. Set light to player for “cast from my location”, facing for “from the direction I am facing”, overhead for vertical sunlight, or the named cardinal direction the light comes from. Use remove to clear baked shadow. If the player requests shadows without a source, set light=ask on the revision so the listener asks in chat. When the user answers that question, return a revision with the chosen light and continueShadow=true. Use continueShadow=false otherwise and light=null on unrelated requests. A request for window drips alone needs no light direction.
