# Storage room

Standalone Blender asset of the Camp's storage room: the snowbound timber shed
marked in red on the owner's map, with its open porch, woodpile and lamp. It was
authored and revised through the official
[MCP for Blender](https://github.com/ahujasid/mcp-for-blender) bridge in the
build / render / compare loop of the owner's supplied
[case study](https://www.mcp-for-blender.com/creations/case-studies/i-just-wanted-to-fish/).
No game scenes, runtime resources, geometry or contracts are changed.

Three files are produced in `build/`:

- **`storage-room-asset.blend`** — the reusable building alone: one scene and the
  marked `Storage Room` collection, textures packed. Append > Collection > Storage Room.
- **`storage-roof.blend`** — the roof alone as its own marked asset,
  `Snowy timber gable roof`, with its origin on the wall-plate plane at the roof centre.
- `storage-room.blend` — the working master: the same building plus the review
  stage (cameras, studio and twilight lights, snow ground, a 1.7 m scale figure).

The building's collections are `01 Timber shell`, `02 Roof` (with `02 Roof snow`),
`03 Porch lamp`, `04 Woodpile`, `05 Wooden floor`, `06 Interior lap lining`,
`07 Interior lamp` and `08 Snow on timber`. Everything is parented to
`STORAGE_ROOM / 4.3 × 6.4 m + porch`; the roof's parts are parented to
`ROOF / wall-plate plane centre`. Excluding or deleting `02 Roof` opens the whole
room from above, and the roof can be appended onto any 4.3 m span.

## Dimensions and interpretation

One Blender unit is one metre; +Z is up, the porch faces −Y, and the root is the
enclosed room's footprint centre on the ground. Measurements were read from the
front and side sheets at about 190 px/m and cross-checked against the plans.

| Feature | Metres |
| --- | ---: |
| Enclosed room, outer board faces | 4.30 × 6.40 |
| Open porch, room face to post fronts | 1.04 |
| Wall plate top (eaves) | 2.60 |
| Roof pitch | 29° |
| Ridge, top of roof deck | 4.06 |
| Snow on the ridge, top | about 4.5 |
| Roof deck, horizontal | 5.40 × 8.22 |
| Rafter tails beyond the deck edge | 0.16 |
| Doorway clear width × height above floor | 1.00 × 2.08 |
| Doorway centre, right of the room centre | 0.62 |
| Floor top above ground | 0.30 |
| Interior between linings | 3.91 × 6.01 |

The sheets disagree about length. Both elevations show a roof about 1.4 times as
long as it is wide; both plans show about 1.75. The model uses 1.52
(a 6.4 m room), so neither family is far off. All four sheets agree on seven
rafter pairs, which the roof keeps. No window appears on any sheet, so none was
modelled; the only openings are the porch and the doorway.

The sheets show the porch's back wall as boards. The owner asked for the inside of
the house, so that wall has an open, framed doorway on its right-hand side, where
the front sheet's woodpile and stumps leave the wall clear. The room is empty
except for the floor, lining and lamp. Its walls are lined with horizontal lapped
boards and its floor is staggered planks over a continuous subfloor. The single
interior lamp hangs from the back wall. The porch keeps the sheet's iron dish lamp
under the gable, the split-billet woodpile and three chopping stumps.

## Rebuild and review

Blender **5.2.2 LTS** was used. `make.py` uses Blender Python only. `mcp_call.py`
requires the Python environment containing `mcp` and `mcp-for-blender`
(MCP for Blender 2.1.9, upstream commit `7a0373ec9199183cb460068c4f96aed9c579fb4f`).

Start a dedicated Blender process with the upstream add-on loaded for that session:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --factory-startup \
  --python tools/scenery/storage-room/bridge.py -- /path/to/mcp-for-blender/addon.py 9878
```

`bridge.py` uses loopback port 9878 (9877 belongs to the generator room) without
saving application preferences. Through the MCP `execute_blender_code` tool, run:

```python
import runpy
runpy.run_path('/path/to/pu-town/tools/scenery/storage-room/make.py', init_globals={'BUILD_PASS': 'review'})
runpy.run_path('/path/to/pu-town/tools/scenery/storage-room/check_asset.py')
```

`mcp_call.py REQUEST.json RESULT.json /path/to/mcp-for-blender-server 9878` does the
same from the terminal over a real MCP stdio session, given the installed
`mcp-for-blender` server executable; the request holds `tool` and `arguments`. The build replaces its own authoring scene and refuses to
overwrite any saved file other than its master.

Render, compare against the sheets, package and check in isolated workers:

```sh
B=/Applications/Blender.app/Contents/MacOS/Blender
cd tools/scenery/storage-room
$B -b build/storage-room.blend --python review.py -- build final   # add --eevee for quick passes
python3 compare.py build final
$B -b build/storage-room.blend --python-exit-code 1 --python package.py
$B -b build/storage-room.blend --python-exit-code 1 --python package.py -- roof
$B -b build/storage-room-asset.blend --python-exit-code 1 --python check_asset.py
```

`compare.py` puts each orthographic render beside its sheet with shared guides.
`check_asset.py` ray-casts the doorway's clear width and height and nine rays
through it to the back wall, samples the floor at jittered points, proves the
room is open from above with the roof excluded and that every roof part hangs
from the roof pivot, and checks closed meshes, both lights and packed textures.
These are saved-artifact checks, not gameplay, collision or performance tests.

## Materials and provenance

The four unmodified owner sheets are in `reference/`, with sizes and SHA-256 hashes
in `reference-manifest.json`. The map screenshot guided palette, mood and the
building's orientation only.

`textures/weathered-boards.png` is generated by `textures.py`: sixteen real boards
cut joint to joint from the side sheet. Every exterior board, beam and rafter
samples one whole board from it with the grain along its length. The same atlas is
tinted for the interior lap, floor and roof framing. Frost, end grain, bark, snow
and iron are Blender shaders. The board texture keeps the illustration's soft
lighting. A later engine export should bake the shader effects (frost, rings,
snow relief) into textures.

The `.blend` files, working renders and MCP logs stay local under `build/` under
the upload size policy. The source, references, atlas and selected final review
images are versioned in `review/`.
