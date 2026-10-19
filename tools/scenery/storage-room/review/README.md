# Storage-room inspection — 19 October 2026

Status: **ready for the owner's final check, not owner-approved**.

Every pass was built through the official MCP for Blender (`execute_blender_code`
running `make.py`). Each was then rendered in a separate Blender worker and placed
beside the owner's four sheets by `compare.py`, with shared horizontal guides.
Passes 2–7 and 10 used EEVEE for speed; passes 1, 8, 9 and 11 used Cycles. No game
integration was attempted.

| Pass | What the comparison showed | Adjustment |
| --- | --- | --- |
| 1 | Front heights, gable width and post spacing within a few per cent of the sheet; snow thin and cloth-like; board texture seams; woodpile too small; interior glowing orange through the doorway | Thicker, clumpier snow; one whole atlas board per member; larger billets; muted interior lap and lamp |
| 2 | Snow reads as snow; plan views show rafter tails past the snow and barge boards at the gables, ours buried; eaves about 0.15 m low; black cavity steps visible with the roof off | Lengthened the room to 6.4 m between the elevations' and plans' proportions; raised the plate; sloped cavity fill |
| 3 | Back and front gable lining only 2 m wide (clamp bug); corner plinths poking through the floor with snow indoors; quarter-split billets left gaps | Fixed the lining spans; plinths kept outside the lined room; whole irregular billets |
| 4 | Side elevation close; tails hung 0.2 m below the sheet's; plan ridge invisible under symmetric light; cold timber ceiling | Shorter tails, sharper ridge crest, warm roof framing, side camera at the sheet's low angle |
| 5 | Ridge and seven tails per side now read in plan; side eave line, tails, sill and lip match | Plate 2.6 m at 29° with the same ridge; doorway now 2.08 m clear; plain display curve for sheet comparisons |
| 6 | All nine views consistent; hero and three-quarter cameras framed poorly | Darker polar-twilight stage for the map's mood; reframed cameras; brighter porch lamp |
| 7 | Independent ray-cast checks passed after the seam-aware floor check (the 5 mm plank seams expose the subfloor) | Packaged asset and roof files |
| 8 | First Cycles set: billet end grain drew as stripes (rings defaulted to the X axis), the interior lamp's shade threw a hard black shadow, the stage ground's edge showed | Rings about each face's own axis, brighter interior lamp, wider stage ground |
| 9 | Second Cycles set: a black notch at the porch gable apex, where the crossed barge boards left coplanar faces that shadowed each other; see-through specks where gable boards met the rafters | Barge boards mitred on the ridge line; gable boarding split on the centre line and tucked 10 mm under the rafters; plinths given vertical grain |
| 10–11 | Apex zoom on a magenta backdrop: clean mitre, no see-through pixels in the boarded gable | Final Cycles set, accepted for owner review |

## Final images

`front.png`, `side.png`, `plan.png` and `top3q.png` are transparent orthographic
renders. The `compare-*.png` sheets put each beside the owner's drawing.
`hero.png` is from the map's viewpoint in the twilight stage, and `entry.png`
looks through the porch into the room. `cutaway.png` has the `02 Roof` collection
excluded, `inside.png` stands in the empty lapped room under the closed roof, and
`roof.png` shows the separable roof alone.

## Independent checks

`inspection.json` records `check_asset.py` run on the reopened
`build/storage-room-asset.blend`:

- the doorway is 1.00 × 2.08 m clear above the floor, centred 0.62 m right of the
  room centre, and nine rays pass through it to the back wall;
- 528 jittered floor samples land on plank tops and 23 in plank seams on the
  subfloor, with nothing else in the room;
- with `02 Roof` excluded, all twelve downward rays reach the floor;
- every roof part hangs from the roof pivot;
- 49,924 evaluated triangles in 15 meshes, none with non-manifold edges;
- two lamps, and the one image texture packed.

`storage-roof.blend` reopens with one scene, the marked roof collection and its
snow, and the pivot at the origin. Its bounds run ±2.86 m across and ±4.19 m long,
from 0.39 m below to 1.94 m above the wall-plate plane.

## Known differences from the sheets

- **Length:** the plans are about 15% longer relative to width than the model, and
  the elevations about 6% shorter. See the main README.
- **Doorway:** the porch's back wall has an open doorway into the room, which the
  sheets do not show. The owner asked for the interior.
- **Lighting:** the sheets' white halo and baked studio light are illustration
  effects, not modelled. Close up, the board atlas repeats, and the end grain,
  frost and snow are procedural shaders.

No collision, LOD, engine export or performance acceptance is claimed.
