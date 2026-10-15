# Parka Avatar

The hooded parka figure for the Godot snow prototype. It is built entirely by
checked-in Python running in a headless Blender, then exported to
[`godot/characters/parka/`](../../../godot/characters/parka/). Nothing is modelled by
hand. To change the figure, edit a number and rebuild, as in the
[case study](https://www.mcp-for-blender.com/creations/case-studies/i-just-wanted-to-fish/)
this pipeline follows.

## Build and review

Run this from the repository root. It needs Blender 5.2 and Python 3 with Pillow and NumPy:

```sh
tools/characters/parka/run.sh /tmp/parka-build
```

`BLENDER_BIN` overrides the default path, `/Applications/Blender.app/Contents/MacOS/Blender`.
A run takes about 40 seconds and has three stages:

1. `make.py` builds the mesh, rig and clips. It writes `parka.glb` and `gait.json`
   to the Godot project, and saves `parka.blend` and `report.json` to the build
   directory. The export is deterministic: the same sources give byte-identical files.
2. `review.py` renders three sets of views. The first is front, side and back at the
   owner's sheet framing (680 px = 1.7 m). The second is the Stand pose and
   side/three-quarter cycle frames. The third is the prototype's game camera:
   orthographic, 55° down, 45° round, at its 6 m view.
3. `compare.py` scores the silhouette of each view against [`reference/`](reference/)
   (intersection over union) and lists width errors by height band. It also writes
   `turnaround.png`, `details.png`, `cycles.png`, `game.png` and `stand.png` to the
   build directory.

The loop is: build, compare against the sheets, adjust `shape.py` or `gait.py`,
rebuild. Then check the result in the running Godot scene, as described in
[the verification record](../../../docs/verification/2026-10-15-parka-avatar.md).

## Files

| File | Role |
| --- | --- |
| `shape.py` | Cross-sections measured from the sheets, faceted tubes, the fur ruff and collar, the skin weights and the bone joints. Pure Python. |
| `gait.py` | Walk, Run and Stand as world-space joint rotations per cycle phase, with analytic leg IK. |
| `palette.py` | Material colours. Each is looked up in the snow reference kit, so a colour outside it fails the build. |
| `make.py`, `review.py` | Run inside Blender. |
| `compare.py`, `run.sh` | Run outside Blender. |
| `reference/` | The owner's turnaround sheets (see Provenance). |

## Conventions

- **Axes and scale.** In Blender +Z is up and the figure faces −Y; one unit is
  one metre. The origin is the ground point between the boots, and the figure is
  1.70 m tall. glTF export turns −Y into +Z, so Godot rotates the model half a turn
  under the walker's −Z-facing node. That is the single axis conversion.
- **Bones.** Bone names follow Godot's humanoid skeleton profile (`Hips`, `Spine`,
  `LeftUpperArm`, `RightLowerLeg`, and so on), so other animations can be
  retargeted later. `Root` does not deform.
- **Clips.** There are three: `Walk`, `Run` and a one-pose `Stand`. Walk and Run
  are in-place loops of two steps. The left boot lands at phase 0 and the right at
  0.5. Each planted boot moves straight back at body speed, so the game drives the
  clips by distance travelled, not by time. `report.json` checks that planted
  boots slide 0 mm per frame.
- **Gait data.** `gait.json` carries step lengths, stance fractions and how far
  ahead a boot lands. The walker places Footprints from it, so the prints match
  the boots: walk 2.25 m/s with 0.53 m steps, run 4.5 m/s with 0.95 m steps.
- **Materials.** There are six flat materials with no textures; the faceted look
  comes from flat-shaded triangles and a little deterministic vertex jitter.

  | Material | Swatch | Used for |
  | --- | --- | --- |
  | Void | `#202123` | Face opening |
  | Boots | `#36383C` | Boots |
  | Accent | `#36383C` | Gloves |
  | Parka | `#3C3E42` | Coat |
  | Trousers | `#44474D` | Trousers |
  | Fur | `#A7ABB5` | Ruff and collar |

  `Accent` (the gloves) is the slot a game may tint with a Player Colour.

- **Budget.** About 4,000 triangles, 23 bones and a 0.66 MB `.glb`.

## Provenance

The owner supplied the three turnaround sheets on 2026-10-15. Their file names
suggest an image generator; authorship and licence were not stated. They are
authoring references only and are never shipped in a build.

| File | SHA-256 |
| --- | --- |
| `front.png` | `6a5a3e907336f696e0da0e9c71b11543bdedf4bde51bbf38122bf11327ee2a46` |
| `side.png` | `69e16b3bfaae69a8f297f07a52fe0dd8325f5404fea5159cbeed0898bd927e54` |
| `back.png` | `4fe0ca66b0ef85e33a4b810da46243906f6aaad15c2f94b5ac473b004ed5d548` |
