# Generator inspection — 19 October 2026

Status: **ready for the owner's final check, not owner-approved**.

The asset was built through the official MCP for Blender and rendered in separate
Blender workers. Every pass rendered the front, end and roof views at the owner sheets'
own framing and pixel scale and was compared beside each sheet, with the sheet's edges
traced over the render and an even blend of both. The map painting guided scale, palette
and atmosphere. No game integration was attempted.

| Pass | What the comparison showed | Adjustment |
| --- | --- | --- |
| 1 | Panel layout, louvres, control column and fork pockets on the sheet's lines; roof snow far too thick and blown out, vents buried; paint 25% too bright; ledge snow as floating pills; end louvres protruding | Thinner roof snow with vent wells, darker exposure, lower panel and frame relief |
| 2 | Vents visible, triangles down from 276k to 82k; snow a smooth duvet, blade snow floating, rail snow thin; end sheet drawn from about 3°, not 10° | Cottony relief, frame-anchored wedges, heavier ridges, studio rig turning with each sheet camera |
| 3 | Scalloped lip and colours within a few per cent; vents buried again, snow face twice the sheet's height, wedges poking past frames | Taller vents, thin lip mounding inland, wedges kept inside the frames |
| 4 | Lid band visible; from above the thin base broke into separate plateaus | Roof blanket rebuilt as an even pillow grid mounded by noise |
| 5 | Continuous blanket; a mis-oriented end mound made spikes at both ends; vents silver | Mound reoriented, tight wells, stronger relief, warmer gritty paint |
| 6 | Spikes gone; vents still silver from metallic steel, lid band hidden by the lip | Matte steel, low vents in wells, lip resting on the lid, darker lid, crystalline grain |
| 7 | Lid band, vents and lip read as on the sheets | Deeper wells, lid edge showing on the long sides |
| 8 | Atmosphere views showed no stage: rebuilds had left stale collections | Every rebuild now replaces the whole scene |
| 9 | Stage renders, but the doorway lamp turned the fog sepia | Cold twilight, small warm pool, figure at the west end, falling snow |
| 10 | Mood right but darker than the map's overcast, flakes faceted | Brighter skylight, warm pool on the west end, finer flakes |
| 11 | Ghost blend lands walls, panel seams, louvre frames, bezel, lid, feet, fork pockets and castings on the sheet's lines; atmosphere matches the map | Final candidate |

The selected images are untouched Blender outputs from pass 11, presented by
`compare.py` where named `compare-` or `ghost-`. `compare-front.png`, `compare-side.png` and
`compare-top.png` set each owner sheet above its render; `ghost-front.png` blends the
front sheet and render evenly. `back.png` shows the side the sheets do not, with a plain
service door in place of the controls. `hero.png` and `game.png` place the generator in
a polar-twilight stage with falling snow, a warm doorway lamp and a 1.7 m figure
stand-in; `game.png` uses the Godot prototype's 40° camera pitch.

`inspection.json` records checks on the independently reopened
**`build/generator-asset.blend`**: a 2.40 × 1.20 m skid footprint, hardware to 1.01 m and
snow to 1.05 m, 102,000 evaluated triangles in 267 objects, no non-manifold mesh edges,
the expected blade count in all six louvres, six downward rays meeting vent parts through
both roof vents, and front rays meeting the meter glass and stop button. The standalone
file has one scene, a marked reusable `Generator` collection, and no review cameras,
lights or stage.

The sheets are illustrations with small disagreements between them (the end sheet
implies a slightly deeper machine than the roof sheet). The result is a consistent
reconstruction at inferred dimensions, not a measured survey or a claim of pixel-identical
geometry. The editable `.blend` files, every earlier pass and the MCP request and
response records remain local in `../build/`. There is no runtime export, collision
setup, LOD or game performance claim in this delivery.
