# Snow-capped generator

Standalone Blender asset of the skid-mounted generator marked in red on the owner's
Frostwatch map painting, beside the open workshop door. It was authored and revised
through the official [MCP for Blender](https://github.com/ahujasid/mcp-for-blender)
bridge with the scripted build / render / compare loop of the owner's supplied
[case study](https://www.mcp-for-blender.com/creations/case-studies/i-just-wanted-to-fish/).
No game scenes, runtime resources, geometry or contracts are changed.

The reusable deliverable is **`build/generator-asset.blend`**. It contains only the marked
`Generator` asset collection in a single scene, with editable collections for the skid
base, housing, louvres and roof vents, control panel, hardware and snow. Its root is
`GENERATOR / 2.40 × 1.20 m` at ground level. Use Blender's Append > Collection > Generator
to reuse it; hide `06 Snow` for the bare machine.

`build/generator.blend` is the working review master: the same asset plus a separate
review stage with the sheet cameras, a studio light rig, and a polar-night stage with a
snowfield, falling snow, a warm doorway lamp and a 1.7 m figure stand-in. The standalone
file contains none of these.

## Dimensions and interpretation

The three owner sheets are illustrations, not a dimensioned drawing, and they disagree
slightly with one another. The front sheet governs the length, every height and the
front layout; the end sheet governs the depth and the end layout; the roof sheet governs
the vent placement. The scale was chosen so that the skid is 2.40 m long, a common size
for a containerised set, which puts the lid at 0.94 m, about the waist of the 1.7 m
figures in the map. These are inferred art dimensions, not a survey.

| Feature | Metres |
| --- | ---: |
| Skid footprint (corner feet) | 2.40 × 1.20 |
| Housing at the corner posts | 2.194 × 1.02 |
| Lid | 2.244 × 1.07, top at 0.937 |
| Roof vents (two) | 0.44 × 0.33, centres ±0.60 along the length, 70 mm high |
| Front large louvre frame | 0.787 × 0.571, 10 blades |
| Front small louvre frame | 0.278 × 0.511, 9 blades |
| End louvre frame | 0.65 × 0.504, 9 blades |
| Control bezel | 0.398 × 0.298 |
| Fork pockets | 0.19 wide, centres ±0.675, openings 0.12 × 0.082 |

One Blender unit is one metre; +Z is up, +X runs along the length, the control panel
faces −Y and the root is at the footprint centre on the ground. Front panel, louvre and
bezel edges were measured on the front sheet at 1.7045 mm per pixel; end features on the
end sheet at 1.2 mm per pixel horizontally. The back repeats the front's louvres with a
plain service door in place of the controls, as the sheets do not show it.

The snow is part of the asset: a pillowy roof blanket with a scalloped lip over the lid
band and open wells round both vents, beads on the panel ledges, snow banked against the
louvre frames on each blade, ridges along the skid rails and caps on the feet and lifting
castings. It is generated from metaball fields, baked to meshes and decimated.

## Rebuild and review

Blender **5.2.2 LTS** was used. `make.py` uses Blender Python only. `mcp_call.py` requires
the Python environment containing `mcp` and `mcp-for-blender`.

Start a dedicated Blender process with the upstream add-on loaded for that session:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --factory-startup \
  --python tools/scenery/generator/bridge.py -- /path/to/mcp-for-blender/addon.py 9881
```

`bridge.py` uses loopback port 9881 by default, so it can run beside other Blender MCP
sessions (the shed's bridge uses 9877), and never saves application preferences. The
review used MCP for Blender 2.1.9, upstream commit
`7a0373ec9199183cb460068c4f96aed9c579fb4f`, with telemetry disabled for the task process.

Through the MCP `execute_blender_code` tool, execute this Python with the actual
checkout path:

```python
import runpy
runpy.run_path('/path/to/pu-town/tools/scenery/generator/make.py',
               init_globals={'BUILD_PASS': 'review'})
```

`mcp_call.py REQUEST.json RESULT.json /path/to/mcp-for-blender [PORT]` is a small stdio
client for doing the same from the terminal. The build replaces its dedicated authoring
scene and refuses to replace any saved Blender file other than this asset's own master.

Render the saved master in an isolated worker so long renders do not occupy the live
MCP connection, then compare the sheet views with the owner's sheets:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b tools/scenery/generator/build/generator.blend \
  --python tools/scenery/generator/review.py -- tools/scenery/generator/build final
python3 tools/scenery/generator/compare.py tools/scenery/generator/build final
```

`review.py` renders `front`, `side`, `top` and `back` on a transparent film at the sheets'
own framing and pixel scale (10° above the front, 3° above the end, straight down on the
roof) with a studio rig that turns to light each sheet from its own viewpoint, and `hero`
and `game` in the polar-night stage; the `game` camera follows the Godot prototype's
40° pitch. `compare.py` writes each sheet above its render, the sheet's edges traced over
the render, and an even blend of the two.

Package the isolated reusable asset, then verify that saved file independently:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b tools/scenery/generator/build/generator.blend \
  --python-exit-code 1 --python tools/scenery/generator/package.py
/Applications/Blender.app/Contents/MacOS/Blender -b tools/scenery/generator/build/generator-asset.blend \
  --python-exit-code 1 --python tools/scenery/generator/check_asset.py
```

`check_asset.py` measures the skid footprint and vent height, casts down through both
vents and into the louvres and control panel, counts the louvre blades, checks closed
mesh topology and excludes review objects. These are saved-artifact checks, not gameplay
or performance tests.

## Reference and material provenance

The three unmodified owner-supplied PNGs are in `reference/`, with original filenames,
sizes and SHA-256 hashes in `reference-manifest.json`. The map painting was used only
for scale, palette and atmosphere; it is not embedded in the model.

All materials are procedural Cycles shaders: weathered paint and blackened steel with
grime, run-down streaks, rust specks, worn edges from a bevel normal and local occlusion,
and a cold snow with subsurface scattering and crystalline grain. A later engine export
should bake them into UV textures. The `.blend` files, working renders and logs stay
local under `build/` under the upload size policy; the source, references and selected
final review images are versioned.
