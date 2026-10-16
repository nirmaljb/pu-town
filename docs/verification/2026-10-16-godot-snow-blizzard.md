# Snow walk blizzard lighting — 2026-10-16

Verification of the blizzard lighting described in
[the Godot guide](../../godot/README.md#lighting-and-the-blizzard). It replaces the
flat overcast light (grey background, ambient 0.70, sun 0.25 with 75% shadows,
linear tonemap, no fog) with a blizzard in overcast polar twilight after the
[mood references](../art/snow-town-reference/README.md). The decisions agreed
with the owner before the change:

- Scope: lighting plus atmosphere, including whiteout fog, falling snow, snow
  blowing along the ground, gusts and lightning.
- Light: a dim, cool, low key light with faint soft shadows that keep Footprints
  readable, rather than fully flat overcast or night.
- Warm lamps at doorways and windows stand in for the buildings' light until the
  placeholder boxes are replaced by house assets. Box colours are unchanged.
- The blizzard is visual only. Gusts do not change the wind that shapes Snow
  Depth, and fog does not limit **Vision**, so the glossary and ADRs are
  unchanged.
- Falling and blowing snow follow the wind's direction, but the blizzard's
  intensity is its own setting, so wind 0 still shows a storm.
- Fog scales with camera distance, so the M overview stays legible.
- Lightning is rare (45–120 s), and scene routes hold it off.
- The control panel is the Godot editor's Inspector, live through Synchronize
  Scene Changes, so the lighting lives in `godot/blizzard.tscn`. There is no
  custom in-game panel.

Before is `1afb90b`, in a detached checkout. After is the working tree of this
change. Both ran Godot 4.7.2 stable on an Apple M1 Mac with the Compatibility
renderer (OpenGL 4.1 over Metal).

## 1. Import check

`GODOT_BIN=~/Downloads/Godot.app ./godot/run.sh --check` completed without
errors. This exercises no movement or rendering.

## 2. Headless engine-event replay

```sh
"$GODOT_BIN" --headless --path godot --fixed-fps 60 -- \
  --snow-scene-check --headless-scene-check --auto-start
```

**PASS, 0 failures, 17,942 observations** ([log](godot-snow-blizzard/headless-route.log)),
the same count as the [Facing record](2026-10-16-godot-snow-facing.md#2-headless-engine-event-replay).
It renders nothing.

The log ends with one new line, printed after the route reports and while the
engine shuts down: `ERROR: Parameter "material" is null` from the headless dummy
renderer's `material_get_instance_shader_parameters`. A scene that stays open
for five frames and then quits reproduces it. It disappears if the snowfall, the
blowing snow or the lamps are freed before quitting, and it does not occur at
`1afb90b`. It is a shutdown-order message from the headless renderer, not an
observed failure. It is recorded here and not hidden.

## 3. Visual comparison

[`capture_blizzard.gd`](godot-snow-blizzard/capture_blizzard.gd) frames the
outpost yard at 16 m and 30 m, then the M overview, follows the walking figure
into the courtyard, and on the after revision forces one lightning flash. It
ran in a 1280 × 800 window at a fixed 60 frames per second with the HUD hidden.
It sets the camera directly and is visual evidence, not a route or input test.
Gusts, lightning and both particle systems use fixed seeds, so a rerun repeats
the frames.

| View | Before | After | Inspection |
| --- | --- | --- | --- |
| Outpost yard, 16 m | [before](godot-snow-blizzard/before-yard-16m.png) | [after](godot-snow-blizzard/after-yard-16m.png) | Falling flakes at several sizes, the whiteout thickening toward the top of the frame, a warm lamp on the workshop casting a warm pool on the snow, and softer shadows. Prints still read. |
| Outpost yard, 30 m | [before](godot-snow-blizzard/before-yard-30m.png) | [after](godot-snow-blizzard/after-yard-30m.png) | Four lamps glow at the lodge, sheds and workshop; the lodge's far side fades into the whiteout. |
| M overview | [before](godot-snow-blizzard/before-overview.png) | [after](godot-snow-blizzard/after-overview.png) | A hazy whole map that is still legible, with lamps marking the buildings. |
| Courtyard, 16 m | [before](godot-snow-blizzard/before-courtyard-16m.png) | [after](godot-snow-blizzard/after-courtyard-16m.png) | The arcade lamp lights the long hall's face; the walking figure's prints read under soft shadows. |
| Lightning, courtyard | — | [after](godot-snow-blizzard/after-courtyard-lightning.png) | Twelve frames into a forced flash, the sky and snow brighten. |

Two defects in early renders were fixed before these captures. Flakes spawned at
the camera covered the view, so the snowfall now stops 5 m below the camera.
Particle billboards ignored their scale, drawing every flake 1 m across, which
`billboard_keep_scale` corrects.

Mean RGB of the whole 16 m yard frame went from (155, 156, 163) to
(165, 165, 172); the references' whole frames average 130–137, but they include
dark rock, timber and forest that the placeholder boxes do not have. Their open
snow measures 154–180, close to this view's. These are starting values for the
owner to tune in the Inspector, not a calibrated match.

## 4. Frame cost

[`frame_timing.gd`](godot-snow-blizzard/frame_timing.gd), copied unchanged from
the [shading record](2026-10-16-godot-snow-shading.md#4-frame-cost), timed 600
frames with vsync off: an unfocused source-scene window at 1280 × 800, camera
16 m, at the lodge lee after walking prints, with the Mac in use. Runs alternated
between the revisions:

| Run | Revision | Mean frame | p95 |
| --- | --- | --- | --- |
| 1 | Before (`1afb90b`) | 23.61 ms | 26.45 ms |
| 2 | After | 27.11 ms | 29.91 ms |
| 3 | Before (`1afb90b`) | 23.75 ms | 26.53 ms |
| 4 | After | 26.94 ms | 29.48 ms |

The blizzard adds about **3.3 ms per frame** in this setup. Hiding one part at a
time on the after revision gave these means:

| Hidden | Mean frame |
| --- | --- |
| Warm lamps | 25.65 ms |
| Snowfall | 26.70 ms |
| Fog | 27.03 ms |
| Blowing snow | 27.02 ms |
| Glow | 27.45 ms |

The eight lamps cost about 1.4 ms, because each lights the large snow meshes.
The snowfall costs about 0.3 ms, and the fog, blowing snow and glow are within
run-to-run variation. These are source-scene, unfocused, uncontrolled-workload
timings. No release package was exported or benchmarked with the OS-event
harness for this change.

## Not verified

- **Live editing from the editor.** Godot's debugger applies edits made to
  `blizzard.tscn` in the editor to its running instance (Synchronize Scene
  Changes). The editor was not driven by hand or by script to confirm it here.
- Ordinary keyboard and mouse input, the graphical and packaged scene routes,
  and Windows were not run for this change.
- Motion was inspected only through still captures. How gusts, blowing snow and
  lightning look moving has not been reviewed by the owner.
