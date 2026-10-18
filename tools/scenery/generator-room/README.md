# Generator room

Standalone Blender exterior asset, authored and revised through the official
[MCP for Blender](https://github.com/ahujasid/mcp-for-blender) bridge. This follows
the scripted build / render / inspect loop in the owner's supplied
[case study](https://www.mcp-for-blender.com/creations/case-studies/i-just-wanted-to-fish/).
No game scenes, runtime resources, geometry or contracts are changed.

The deliverable is `build/generator-room.blend`. It contains separate editable
collections for the timber shell, roof and snow, recessed entry, hardware, and
review stage. Both source textures are packed into the file. All asset parts are
children of `GENERATOR_ROOM / 8.8 × 3.8 m`; lights, cameras and the presentation
ground are kept in `90 Review stage`. The two entry lights belong to the asset.

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
| Timber-lined recess depth | 0.72 |
| Nominal snow blanket depth | 0.29 |

One Blender unit is one metre; +Z is up, +Y points to the rear, the front faces −Y,
and the root is at the footprint centre on the ground. The reference depicts a
shallow lit recess: it is modeled with a rear lining, rather than inventing an
unreferenced generator machine or furnished room. The roof and walls are separate
solid meshes. The authoring file does not provide a traversable gameplay interior.

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
  tools/scenery/generator-room/build final hero front right top back entry
```

Execute `check_asset.py` through MCP, or with Blender's `--python`, for independent
doorway measurements, evaluated triangle counts, manifold mesh checks and packed
image checks. These are artifact checks, not gameplay or performance tests.

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
