# Reusable generator-room shed

Standalone Blender shed asset, authored and revised through the official
[MCP for Blender](https://github.com/ahujasid/mcp-for-blender) bridge. This follows
the scripted build / render / inspect loop in the owner's supplied
[case study](https://www.mcp-for-blender.com/creations/case-studies/i-just-wanted-to-fish/).
No game scenes, runtime resources, geometry or contracts are changed.

The reusable deliverable is **`build/shed.blend`**. It contains only the marked
`Shed` asset collection in a single scene, with packed textures and editable
collections for timber walls, roof and snow, open doorway, hardware, wooden floor,
interior lining and one caged lamp. Its root is `SHED / 8.8 × 3.8 m` at ground level.
Use Blender's Append > Collection > Shed to reuse the building. Toggle
`02 Roof and snow` to inspect the interior or `07 Lamp` to remove the lamp.

**`build/roof.blend`** contains the independent, marked **`Snowy timber roof`**
collection asset. It includes only the roof deck, fascia, rafters, snow cap, bolts
and ice, with both textures packed. Append that collection into another Blender
file, then move, rotate or scale its `ROOF / mounting plane centre` root. Its pivot
is at `(0, 0, 0)`, centred on the mounting plane; rafters extend below that plane.
The nominal deck is 9.66 × 4.36 m; trim extends the overall footprint to about
9.82 × 4.57 m. It retains the shallow pitch, rising toward +Y. The matching shed
places this pivot at `(0, 0, 2.72)` m. Scaling X and Y changes its span; keep Z at
1 if the snow thickness and timber depth should stay constant.

`build/generator-room.blend` is the working review master, with the same shed plus
a separate presentation stage and exterior/interior inspection cameras. The
standalone file contains no review cameras, ground or presentation lights.

## Dimensions and interpretation

The owner approved preserving the reference proportions at the revised inferred
8.8 × 3.8 m footprint and confirmed that the shed has no window. These are art
scale estimates, not measurements supplied on a plan. The five drawings vary
slightly; the front sheet governs opening position and the roof sheet governs
the rectangular silhouette. The two side sheets guide the shallow roof slope,
solid boarded walls and exposed frame.

| Feature | Metres |
| --- | ---: |
| Wall footprint | 8.8 × 3.8 |
| Front / rear wall height | 2.52 / 2.92 |
| Roof deck, before fascia and snow | 9.66 × 4.36 |
| Doorway jamb clearance | 1.44 × 2.10 |
| Door centre, from building centre toward right | 1.64 |
| Interior lining-to-lining dimensions | 8.5 × 3.5 |
| Wooden floor top above ground | 0.12 |
| Nominal snow blanket depth | 0.29 |

One Blender unit is one metre; +Z is up, +Y points to the rear, the front faces −Y,
and the root is at the footprint centre on the ground. The latest owner request
supersedes the initial shallow recess: the entrance now opens into the full empty
room. Staggered wooden boards cover a continuous subfloor, and the single warm
lamp is mounted on the rear wall. There are no generators, props, partitions,
windows or door leaves. The 2.10 m doorway clearance is measured above the floor;
its lintel is at 2.22 m above ground. The roof and snow can be removed together.

## Rebuild and review

Blender **5.2.2 LTS** was used. `make.py` uses Blender Python only. `mcp_call.py`
requires the Python environment containing `mcp` and `mcp-for-blender`.

Start a dedicated Blender process with the upstream add-on loaded for that session:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --factory-startup \
  --python tools/scenery/generator-room/bridge.py -- /path/to/mcp-for-blender/addon.py
```

`bridge.py` uses loopback port 9877 without saving application preferences. The
review used MCP for Blender 2.1.9, upstream commit
`7a0373ec9199183cb460068c4f96aed9c579fb4f`, protocol 13, with telemetry disabled for
the task process. The bridge was used via a real MCP stdio client, not an emulated
Blender socket implementation.

Through the MCP `execute_blender_code` tool, execute this Python with the actual
checkout path:

```python
import runpy
runpy.run_path('/path/to/pu-town/tools/scenery/generator-room/make.py',
               init_globals={'BUILD_PASS': 'review'})
```

`mcp_call.py REQUEST.json RESULT.json /path/to/mcp-for-blender` is a small stdio
client for doing the same from the terminal. The request holds `tool` and
`arguments`; `{"list": true}` records the server's tools. The original request,
response and build logs are retained locally in `build/`.

The build replaces its dedicated authoring scene. It refuses to replace a
saved Blender file other than this asset's own master. Render the saved model in
an isolated process so long renders do not occupy the live MCP connection:

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
  -b tools/scenery/generator-room/build/generator-room.blend \
  --python tools/scenery/generator-room/review.py -- \
  tools/scenery/generator-room/build final hero front right top back entry cutaway floorplan inside
```

Package the isolated reusable asset, then verify that saved file independently:

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
  -b tools/scenery/generator-room/build/generator-room.blend \
  --python-exit-code 1 --python tools/scenery/generator-room/package.py
/Applications/Blender.app/Contents/MacOS/Blender \
  -b tools/scenery/generator-room/build/shed.blend \
  --python-exit-code 1 --python tools/scenery/generator-room/check_asset.py
```

`check_asset.py` measures the doorway, casts through the opening, samples the
floor throughout the empty room, checks evaluated mesh topology, packed images,
one physical lamp and exclusion of review objects. These are saved-artifact
checks, not gameplay or performance tests. `package.py` uses a regular scene save
because partial library writing of a new scene crashed this Blender build.

Package and inspect the roof separately:

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
  -b tools/scenery/generator-room/build/generator-room.blend \
  --python-exit-code 1 --python tools/scenery/generator-room/package.py -- roof
/Applications/Blender.app/Contents/MacOS/Blender \
  -b tools/scenery/generator-room/build/roof.blend \
  --python-exit-code 1 --python tools/scenery/generator-room/review_roof.py -- \
  tools/scenery/generator-room/build
/Applications/Blender.app/Contents/MacOS/Blender \
  -b tools/scenery/generator-room/build/roof.blend \
  --python-exit-code 1 --python tools/scenery/generator-room/check_roof.py -- \
  tools/scenery/generator-room/build/generator-room.blend
```

Run the roof packaging command again after rendering to embed its Asset Browser
thumbnail. `check_roof.py` checks self-containment, topology and packed materials,
then compares evaluated vertices against the roof's assembled position. An
optional second file argument compares the complete shed with an earlier master.
The main master keeps the roof parented to the shed; the roof-only file removes
that external parent and normalises its placement origin.

## Reference and material provenance

The five unmodified owner-supplied PNGs are in `reference/`, with original filenames,
sizes and SHA-256 hashes in `reference-manifest.json`. They came from the owner's
`Downloads/designs/generator-room/` folder. The wider snowy settlement image was
used only as atmosphere guidance; it is not embedded in the model. No red marker
was visible in that supplied map image.

The front sheet supplies separate strips of charcoal weathering and the warm
recess timber; the top sheet supplies snow detail. Shader coordinate mapping lays
those strips onto modeled boards and the snow blanket. Snow rim shading avoids
stretching the top image vertically. These are illustration-derived materials,
with some lighting already present in the reference, rather than calibrated PBR
scans. The Blender master preserves their intended appearance; a later engine
export should bake the shader mappings into UV textures.

The `.blend`, working renders and logs stay local under `build/` under the upload
size policy. The source, references and selected final review images are versioned.
