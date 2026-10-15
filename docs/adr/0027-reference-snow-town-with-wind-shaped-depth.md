---
status: accepted
---

# Rebuild the snow prototype as the reference town with wind-shaped Snow Depth

Issue #94 rebuilds the offline Godot prototype around the owner's whole-map
reference, so the town is recognisable and Players can read its snow. The
top-down image in [`docs/art/snow-town-reference/`](../art/snow-town-reference/README.md)
is the spatial reference: a walled compound, a central meeting hall and an
outpost on a shelf above a southern forest, joined by a stair. The outpost,
courtyard and meeting-interior images there guide mood and detail, and
`docs/art/snow-reference/reference.png` remains the colour reference. The images
establish composition, not measured dimensions. Measured against features of
known size (a ten-person round table of about 3.5 m, sheds of about 8 m), the
whole top-down picture spans a **100 × 56 m** town with north at −Z. Its extents are defined once, as separate east–west and
north–south half extents, and the snow surface, shader, obstacle layout, figure
containment, camera overview and scene route all derive from them. Route
destinations are named landmarks in the town layout, not scattered coordinates.

Ground height is static: it is built at launch from authored levels and one slope
into a fixed world ground-height picture. The compound, meeting hall and outpost
stand on a shelf about 5 m above the forest. The stair from the compound's south
gate is one snow-buried slope with low walls, no individual steps and nothing
walkable beneath it. Levels change only along that slope or beneath impassable
rock, so no stretched snow faces show, and slope never changes speed. Every
placeholder (walls, bell tower, gatehouse, well pavilion, meeting hall, lodge,
sheds, workshop, radio tower, generator, crates, fences, rocks and pines) is a
solid, non-enterable box on its level's ground. Roofs never support a figure, and
horizontal movement keeps the circle sweep with sliding and map containment.

Snow Depth becomes saved state instead of a formula: a fixed world picture at
0.4 m per cell. It starts from authored zones, with Shallow Snow in the courtyard
and on the stair, a mix in the outpost yard, and Deep Snow at cliff feet, in the
meeting-hall gap and in the forest. Surface height is ground height plus loose
Snow Depth, reduced by Footprint compaction while keeping a thin layer; every
rendered vertex re-reads all three each frame. Wind is an authored relaxation,
not a conserved fluid simulation. Each cell moves toward its authored start plus
lee deposition behind boxes and cliffs, minus windward scour, at a speed set by
wind strength (0–16). The prevailing wind comes from the north-west and turns in
45° steps; exposure and shelter are recomputed from upwind obstacles when it
turns, so old drifts wear away and new ones build. Snowdrifts settle at about
1.2 m, scour never goes below 3 cm, wind 0 freezes everything and there is no
snowfall. This trades physical conservation for drifts that settle into a
recognisable town at a bounded cost. That cost is estimated at 2–3 ms per frame
and must be measured on the release package. Snowdrifts are assumed walkable at
walking speed; the owner should confirm this during review.

Footprints stay in one world-anchored picture over the whole map at 31.25 mm per
texel (3200 × 1792 RGBA8, about 23 MB on the CPU plus a nominal GPU copy). It
stores compaction and the wind-clock time of the latest stamp, never a list of
steps. Fill is evaluated lazily from that time and local exposure: about 120
wind-seconds in the open, sooner where a drift is building, and up to about four
times longer in shelter. The GPU copy is updated tile by tile. The detailed
surface becomes a 24 × 16 m region at a 5 cm grid, sized to what the camera
shows. It is centred on the camera's focus, snapped to the coarse grid and kept
inside the map, and it blends into the live 0.8 m surface. Sole outlines are
shaded from the picture everywhere, without changing height. CPU foot support
still evaluates exactly the heights and triangles the shader draws.

A perspective camera (40° vertical field of view, −55° pitch, 16 m from its
focus) follows the figure with north up and never rotates. Its focus leans up to
3 m toward the cursor's point on the ground. The wheel zooms from 10 to 30 m,
plus a whole-map overview for inspection. WASD moves relative to the screen.
Facing follows the cursor, including while standing still. Legs, boots and
bootprints follow the direction of travel, so trails stay honest, and turning in
place leaves no prints. Both inspection figures start in the outpost yard. The
uncontrolled one walks a fixed loop (outpost, meeting-hall gap, compound gate,
courtyard, stair, forest and back), running in Shallow Snow, so there are trails
to track. Tab swaps control.

This supersedes [ADR 0026](0026-dynamic-snow-and-persistent-footprints.md)'s
flat substrate, formula snow, 64 m map, orthographic camera turned 45° and idle
second figure. It retains the world-anchored Footprint picture, the agreement of
visible snow and foot contact (ADRs 0025 and 0026), the offline boundary, and
[ADR 0025](0025-godot-single-snow-map-prototype.md)'s requirements for later
Java integration. The Java, browser and Unity clients and their contracts are
unchanged. Networking, interiors, Footprint deception and saved snow remain out
of scope. Validation stays at the running scene, driven by keyboard, wheel and
mouse-movement input and checked through its public observation record. Headless
replay, graphical replay, ordinary input, captures, frame traces and exports
remain separate evidence. Issue #95 lands first and changes no behaviour: it
defines the map rectangle and landmarks once while the scene stays 64 × 64 m.
