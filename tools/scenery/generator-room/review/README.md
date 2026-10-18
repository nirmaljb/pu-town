# Generator-room inspection — 18 October 2026

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
| 5 | Amber recess, dark timber, cold snow and framing read together | Accepted for owner review; re-rendered hero, front and entry |

The selected renders here are untouched Blender outputs. `hero.png` uses the
review snow ground; `front.png`, `right.png`, `top.png` and `back.png` are transparent
orthographic inspections; `entry.png` shows the recess and caged lamp in detail.
The final material-only pass did not change geometry, so the unaffected side, top
and back renders remain the fourth-pass images.

`inspection.json` records independent measurements of the modeled jambs and
checks evaluated meshes. The final asset has **27,678 evaluated triangles**,
**221 child objects** including its two entry lights, no non-manifold mesh edges,
and both textures packed. Door jamb clearance is **1.44 × 2.10 m**, with its centre
**1.64 m** to the right of the footprint centre. The threshold and interior head
are modeled within that framed opening.

The five sheets are illustration references with slight differences in framing,
roof edge and board placement. The approved footprint is inferred, and the result
is a consistent reconstruction rather than a dimensioned survey or a claim of
pixel-identical geometry. Repeated timber strips are visible at close inspection;
the result was judged primarily from the reference elevations and oblique view.

MCP request/response records, every earlier pass and the editable `.blend` remain
local in `../build/`. The master contains real 3D parts and packed shader textures;
there is no runtime export, collision setup, LOD acceptance or game performance
claim in this delivery.
