---
status: accepted
---

# Turn the snow prototype into Frostwatch Outpost: a flat snowfield with a fenced Camp

Issue #104 turns the offline Godot snow prototype toward an Among Us-like
snow-horror game. The 100 × 56 m reference town of
[ADR 0027](0027-reference-snow-town-with-wind-shaped-depth.md) no longer matches
it: the owner wants a very large, wide, empty snowfield of pines with a small
fenced settlement at its exact centre, and a camera that shows the figure's body
instead of reading as nearly top-down. The owner's references are in
[`docs/art/frostwatch-reference/`](../art/frostwatch-reference/README.md): a
satellite-style sketch of the whole map, painted views around the centre, a line
sketch used only for the fence's shape, and frames from another game for the
camera.

**Map.** Frostwatch Outpost is a flat **500 × 550 m** snowfield, north up (−Z),
centred on the origin. Its extents are still defined once in the town layout, as
separate east–west and north–south half extents, together with its named
landmarks, Camp obstacles, Perimeter runs and openings, Roads, starting Snow Depth
zones, warm lamps and the walking figure's loop; snow, shader, containment,
camera overview and scene route all derive from them. The ground is one level:
the shelf, forest floor, stair slope, stair walls and cliff rock are gone, and
shader heights and CPU foot support read the same flat ground. The map's edge is
a plain containment boundary with no visible wall, hidden by the whiteout.

**Camp.** At the centre stands the Camp: solid, non-enterable placeholder boxes
for a lodge of about 20 × 12 m with a chimney, a generator shed, an open workshop,
two cabins, a small shed, a lattice radio tower, an antenna mast and crate and
barrel stacks, arranged after the painted centre views round an open Town Square
of about 40 m. Roofs never support a figure. Eight warm lamps, the Compatibility
renderer's per-object limit, hang on Camp doors and windows.

**Perimeter.** A split-rail fence of about 70 × 55 m encloses the Camp, shaped
after the owner's fence sketch, built from short straight runs 1.1 m high and
0.15 m thick. It has exactly four openings of about 5 m, one where each Road
crosses it. Its runs block movement and shelter snow like any other obstacle.

**Roads.** Four diagonal Roads run from the Town Square to the map's edge, and
the north-west and south-west Roads each branch west, as in the satellite sketch.
A Road is an authored corridor about 4 m wide with no ground geometry of its
own; it starts as Shallow Snow, and wind can drift over it. Open ground starts at
the in-between depth and tree clusters as Deep Snow. (Amended by #110: on the
160 × 160 m interim map the four Roads run straight along the diagonals from the
Town Square's corners, so a figure follows one with two movement keys, and the
west branches come with the full-size map. Until pines are placed, placeholder
tree clusters are Deep Snow zones holding solid tree boxes that block and shelter
snow as the pines will.)

**Traced forest.** A deterministic offline step traces the tree marks of the
satellite sketch onto the map and writes checked-in placements: position, scale,
and a turn within ±20° that keeps the windward side to the north-west. Placements
on a Road, in the Camp or on the Perimeter are dropped. The snow-laden pine comes
from its own headless-Blender pipeline, reduced to 8–12k triangles, with a much
cheaper distance version, never edited by hand. Each pine blocks a circle of
about 1.2 m at its base and shelters snow like a box. Trees render in instanced,
camera-culled batches.

**Snow storage at scale.** The snow rules are identical everywhere: the same fill
clock, exposure, shelter and drift. To fit a 500 × 550 m map in memory, the
single whole-map Footprint picture becomes world-anchored tiles at the same
31.25 mm resolution, created where a step lands and freed once wind has filled
every print in them; the GPU copy stays tile-updated. Snow Depth may use a coarser
grid away from the Camp, with no visible difference in behaviour. The detail
region is sized and shaped for the oblique view, sharp to about 20 m from the
figure. (Amended by #108: it keeps 5 cm cells where the figure walks and nearer
the camera, and has 10 cm cells further up the view, because a 5 cm grid all the
way out cost more frame time than walking at 24 fps allows; the Footprint picture
still shades sole outlines there.) The live coarse surface follows the camera
rather than covering the whole map.

**Camera.** North up and never rotating, perspective at about −40° pitch through
a 40° vertical lens, as in the owner's reference frames. By default the figure
stands about 1/12 of the screen tall; the wheel zooms between about 1/8 and 1/16,
and M opens and closes a whole-map overview. The lean toward the cursor grows
from 3 m close in to 8 m zoomed out. The camera keeps its eased share of each
footfall's sink, and the cursor's ground plane stays on the untouched snow at
the figure. Fog stays scaled to the camera.

**Figures.** Both inspection figures start in the Town Square. The uncontrolled
one circles the lodge, leaves through the south-east opening, follows the
south-east Road about 80 m and returns, so trails cross the Perimeter. Tab swaps
control as before.

**Order.** The design lands in three stages of vertical slices, each pushed on
its own and kept playable. First, on an interim flat map of about 160 × 160 m that
the existing whole-map snow pictures still fit: the new camera, the removal of the
reference town, then the Camp, Roads, Perimeter and the walking figure's loop.
Second, scalable snow storage, then growing the map to 500 × 550 m. Third, the
pine and the traced forest. Until the Camp stands, the interim map is open snow
with a Shallow Town Square at its centre and lanterns standing in the snow round
it; its snow runs on beyond the edge as an apron no figure reaches, so the edge
never shows.

This supersedes ADR 0027's town layout, its 100 × 56 m scale, its shelf and stair
ground levels and its camera. It keeps ADR 0027's saved Snow Depth with
authored-relaxation wind, its Footprint fill from a stamped fill clock, the
agreement of visible snow and foot contact, the Facing rules and its validation
at the running scene. Frostwatch Outpost is not a Town Map until a Host can
select it for a Room. Game rules, the Java, browser and Unity clients and their
contracts, Room integration, networking, final art, interiors, terrain relief,
destinations at the Roads' ends, saved snow, snowfall and Footprint deception are
out of scope. Validation stays at the running scene and its exported observation
record; headless replay, graphical replay in source, the Mac release package,
captures and frame traces remain separate evidence. Walking must hold 24 fps in
the Mac release package on the M1 MacBook Air; the overview may fall to about
15 fps.
