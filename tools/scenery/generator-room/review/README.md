# Generator-room inspection — 19 October 2026

Status: **ready for the owner's final check, not owner-approved**.

The asset was built through the official MCP for Blender and rendered in separate
Blender workers. Every build pass was checked visually against the five supplied
shed images and the map atmosphere reference. No game integration was attempted.

| Pass | What the renders showed | Adjustment |
| --- | --- | --- |
| 1 | Correct broad layout; timber too clean and blue; regular snow rim | Packed the supplied grain and snow illustrations, reduced the blue cast, varied the rim |
| 2 | Better reference finish; texture stretching on side fascia and snow thickness | Corrected beam mapping direction and limited roof projection to upward-facing snow |
| 3 | Side, top and rear checks passed visually; recess too smooth; support details understated | Added reference timber inside the recess and strengthened rafter ends and fascia caps |
| 4 | Roof supports read correctly; new recess material too pale | Reduced the recess albedo and restored amber saturation |
| 5 | Amber recess, dark timber, cold snow and framing read together | Exterior ready for review before the owner requested a full empty room |
| 6 | Full floor and empty room added; threshold overlap caused a dark seam, lamp hidden behind the front wall | Removed the overlap, moved the single lamp to the rear wall and widened cutaway framing |
| 7 | Floor seam resolved and full room visible; doorway glow subdued and inspection camera cropped the lamp | Increased lamp power and repositioned entry/interior inspection cameras |
| 8 | Complete empty wooden interior, visible amber lamp, clear entry and consistent exterior | Nine final views inspected; standalone shed file saved and independently checked |
| 9 | Owner requested a separately reusable roof | Added a mounting pivot and standalone roof asset; upper and underside renders checked |

The shed renders here are untouched Blender outputs from pass 8.
Pass 9 separates the roof hierarchy without altering the shed geometry;
`roof.png` and `roof-underside.png` show the independently saved roof.
`hero.png` presents the cold exterior; `front.png`, `right.png`, `top.png` and
`back.png` are transparent orthographic inspections. `entry.png` shows the open
entrance, `cutaway.png` and `floorplan.png` hide the removable roof to expose the
whole empty floor, and `inside.png` shows the atmosphere under the closed roof.
The full room is an explicit owner-requested extension of the reference exterior.

`inspection.json` records checks on the independently reopened **`build/shed.blend`**.
The asset has **44,102 evaluated triangles**, **374 objects** including one point
light and the root, no non-manifold mesh edges, and both image textures packed.
Door clearance is **1.44 × 2.10 m above the floor**, centred **1.64 m** right of the
footprint centre. Nine rays traverse the entry to the back wall or its lamp;
714 downward samples across the room find only floor at the expected height.
The standalone file has one scene, a marked reusable `Shed` collection, and no
review cameras, ground or staging lights. Python syntax and Git whitespace checks
also passed. No game files were changed.

The cutaway is an inspection mode, not another furnished asset. Restore the
`02 Roof and snow` collection for the complete exterior. The lamp can be removed
independently using `07 Lamp`. The floor is continuous, with narrow plank seams
backed by a subfloor. There is no generator, furniture or partition inside.

The five sheets are illustration references with slight differences in framing,
roof edge and board placement. The approved footprint is inferred, and the result
is a consistent reconstruction rather than a dimensioned survey or a claim of
pixel-identical geometry. Repeated timber strips are visible at close inspection;
the result was judged primarily from the reference elevations and oblique view.

MCP request/response records, every earlier pass and the editable `.blend` remain
local in `../build/`. Both the reusable shed and review master contain real 3D parts and packed shader textures;
there is no runtime export, collision setup, LOD acceptance or game performance
claim in this delivery.

## Independent roof inspection

`roof-inspection.json` records a self-contained collection asset with 61 objects,
11,710 evaluated triangles, packed textures, no non-manifold mesh edges and no
parents outside the roof. The origin is the mounting-plane centre. Repositioning
the standalone roof at the shed's 2.72 m mount reproduces every evaluated vertex
to within 0.000001 m. Comparing the full shed before and after separation found
zero geometry change. The existing floor and doorway checks also still pass.
The roof review worker adds temporary lights/cameras without saving them to the
asset. The roof file includes a thumbnail for its marked Asset Browser collection.
