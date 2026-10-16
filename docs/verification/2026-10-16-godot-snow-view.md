# Snow walk reference view and larger window — 2026-10-16

The owner asked for a wider camera at the angle of three reference stills (a
small figure in a scarf walking through snow past a lit house, a truck and bare
trees; they are the owner's and are not kept in the repository), for the game to
start at a larger window and higher resolution, and for at least 24 frames per
second on this machine.

Only the Godot preview changed; Java, browser and Unity code are untouched.
Retained files are in [`godot-snow-view/`](godot-snow-view/).

Engine: Godot `4.7.2.stable.official.ed1daf0bf`, Compatibility renderer, on an
Apple M1 MacBook Air (8 GB, 7-core GPU) with a 2880 × 1800 Retina screen at
scale 2, under macOS 26.2. "Before" is revision `1f8180b`.

## Reading the references

The stills were measured on a pixel grid rather than guessed:

- **Lens.** Vertical poles and tree trunks barely splay. A pole about 380 px
  right of centre leans 45 px over 520 px, so the verticals meet roughly
  4,000 px below the centre of a 1,126 px frame. The house's eave and wall base
  stay parallel, and bootprints near the bottom edge are barely larger than
  those beside the figure. That is a long lens seen from far off. With a 45°
  pitch it means a vertical field of view of about 15–17°. The old camera's 40°
  lens put the same meeting point about 1,100 px below the centre, a strongly
  wide-angle look.
- **Pitch.** Roughly round bootprints are about 1.35 times as wide as they are
  tall (sin θ ≈ 0.74). The blocky placeholder's diamond top is about 0.63 times
  as tall as wide. Both point to about 40–48° below the horizon; 45° is used.
- **Framing.** The figure is 12–13% of the frame height (135 of 1,126 px and
  145 of 1,126 px), its feet within 1% of the vertical centre, in a 16:9 frame.

## Changes

- [`follow_camera.gd`](../../godot/follow_camera.gd): field of view 40° → **16°**,
  pitch −55° → **−45°**, play distance 16 → **40 m**, wheel range 10–30 →
  **25–75 m** (the same ratios, so the same wheel steps reach each end), framing
  share 0.075 → **0.012** of the distance, so the feet stand just below the centre
  (screen y ≈ 0.53), and near/far planes 0.1/400 → 1/1000 m for the overview,
  now 236 m away. At 40 m the 1.7 m figure stands 12% of the screen tall, as in
  the references, and the view is about 20 m wide at the figure in 16:9, against
  18.6 m before.
- [`project.godot`](../../godot/project.godot): the window opens at
  **2560 × 1440 pixels**, 16:9 like the references and 1280 × 720 points on this
  Retina screen, instead of 1280 × 800 pixels, which macOS showed as a 640 × 400
  point window. The 2D base size is 1280 × 720, so the HUD keeps its size on
  screen. **MSAA 2× is off**: at Retina density its smoothing shows only as a
  one-pixel stair-step on box edges (compared at 1:1) and it cost about 5 ms.
- [`snow_walk.gd`](../../godot/snow_walk.gd): a screen without room for the
  window, for example 1080p, gets the largest 16:9 window filling nine tenths
  of it, centred. This Mac has room, so nothing changes here; the shrink itself
  was not exercised on a smaller screen.
- [`export_presets.cfg`](../../godot/export_presets.cfg): the Mac package keeps
  Retina resolution (`display/high_res=true`). Without it, a 2560 × 1440 window
  would be 2560 × 1440 points, larger than this screen.
- [`blizzard.gd`](../../godot/blizzard.gd), [`blizzard.tscn`](../../godot/blizzard.tscn):
  fog now begins at 34 m and is full at 73 m at the play distance (was 10 and
  48 m). It still scales with the camera's distance. Computed along the view,
  the fog's share is 15% at the figure and 33% at the top edge, against 16% and
  34% in the old view, and 4% at the bottom edge against 10%. SkyKey draws **one shadow map** out to 60 m at play distance, scaled
  the same way, instead of four splits over 160 m. The long lens sees only a
  slice 35–47 m from the camera, which fell inside one of the four splits, so the
  other three cost frame time for nothing. The new Shadows group in the Blizzard
  node sets this distance.
- [`inspection_route.gd`](../../godot/inspection_route.gd),
  [`inspection.gd`](../../godot/inspection.gd): the route's specified camera
  and its messages use the new values; the HUD prints the camera's actual pitch.
- README, [ADR 0027](../adr/0027-reference-snow-town-with-wind-shaped-depth.md)
  and `AGENTS.md` describe the new view and window.

## 1. Import check

`GODOT_BIN=~/Downloads/Godot.app ./godot/run.sh --check` completed without errors.
It exercises no movement or rendering.

## 2. Captures

[`capture_view.gd`](godot-snow-view/capture_view.gd) frames the outpost yard at
the play distance and at the widest play distance, then the M overview, and
follows the walking figure into the compound's courtyard, with the HUD hidden and
no lightning. Each revision ran at its own default window: before at 1280 × 800,
after at 2560 × 1440.

| View | Before | After | Seen |
| --- | --- | --- | --- |
| Outpost yard, play distance | [16 m](godot-snow-view/before-yard-play.png) | [40 m](godot-snow-view/after-yard-play.png) | The figure is 12.4% of the frame height (179 of 1,440 px), feet just below centre. Box walls keep near-vertical sides and the yard's prints keep one scale from bottom to top, like the references. |
| Outpost yard, widest | [30 m](godot-snow-view/before-yard-widest.png) | [75 m](godot-snow-view/after-yard-widest.png) | About 37 m across at the figure. |
| Overview | [112 m](godot-snow-view/before-overview.png) | [236 m](godot-snow-view/after-overview.png) | The whole town, with box shadows, from the new angle. |
| Courtyard, play distance | [16 m](godot-snow-view/before-courtyard-play.png) | [40 m](godot-snow-view/after-courtyard-play.png) | At the lower 45° angle, tall boxes hide more of the ground north of them; here a courtyard pine half hides the figure, as the references' trees cross in front of theirs. |

At the play distance the screen shows ground from 7 m south to 9.2 m north of
the camera's focus. The 24 × 16 m detail region reaches 8 m north, so the top
1.2 m of the frame, the most fogged part, shows the coarse surface; bootprints
there are shaded from the Footprint picture without their 5 cm relief.

## 3. Frame time

[`frame_timing.gd`](godot-snow-view/frame_timing.gd) times 900 frames after
300 warm-up frames, with vsync off and the HUD hidden, while the controlled figure
walks back and forth across the outpost yard laying prints. The window was
unfocused and uncovered, and the Mac in ordinary use. Runs alternated between
revisions.

| Revision | Window | Mean frame | Mean fps | p95 | Worst |
| --- | --- | --- | --- | --- | --- |
| Before | 1280 × 800 (default) | 30.89, 31.25 ms | 32.4, 32.0 | 33.89, 34.04 ms | 47.65, 35.62 ms |
| Before | 2560 × 1440 | 45.18, 44.62 ms | 22.1, 22.4 | 50.00, 49.63 ms | 78.03, 71.43 ms |
| After, MSAA 2× still on | 2560 × 1440 (default) | 35.52, 35.78 ms | 28.2, 28.0 | 41.45, 41.18 ms | 48.38, 44.93 ms |
| **After** | **2560 × 1440 (default)** | **30.73, 30.78, 30.74 ms** | **32.5** | **34.75, 34.74, 35.13 ms** | 49.22, 45.94, 50.30 ms |

The final version holds **32.5 fps on average and 28.5 fps at the 95th
percentile** with 3.6 times the old window's pixels, about the old 1280 × 800
rate. The old camera could not reach 24 fps at this size. Single frames
of 45–50 ms (about 20 fps) still occur, as before.

Earlier, while choosing the settings, a standing-still probe at 2560 × 1440
gave: four shadow splits over 160 m 37.5 ms; one map over 60 m 30.0 ms; turning
off the snow surface's shadow casting 33.5 ms with splits and nothing more with
one map. Rendering 3D at 0.85 scale gained as much as dropping MSAA but blurred
the whole view, so it was not kept.

These are source-scene timings with the HUD hidden and no OS input. No release
package was exported or traced with F6 for this change.

## 4. Headless engine-event replay

```sh
"$GODOT_BIN" --headless --path godot --fixed-fps 60 -- \
  --snow-scene-check --headless-scene-check --auto-start
```

**PASS, 0 failures, 17,942 observations**
([log](godot-snow-view/headless-route.log)). It renders nothing. Every
observation's camera is the 16° perspective view at −45°, north up, within 3 m of
lean and the 25–75 m play range; without lean the figure stands on the vertical
centre line below the middle; eight wheel steps out reach 75 m and the overview,
which frames the town; M opens it from 40 m and returns to exactly 40 m; and the
detail region keeps every footstep inside its full-detail area. As in earlier
records, the log ends with the headless dummy renderer's `Parameter "material"
is null` error during shutdown, after the route reports.

## 5. Focused graphical route from source

```sh
"$GODOT_BIN" --path godot -- --snow-scene-check --auto-start
```

**PASS, 0 failures, 18,004 observations**
([log](godot-snow-view/graphical-route.log), with its per-checkpoint lines
removed). The window opened at 2560 × 1440 and was brought to the front once
after launch; as in earlier records, one "Route paused" line appears before
recording began. The same camera, zoom, overview and detail-region checks held
in a rendered window. This is engine-event replay, not ordinary OS input.

## 6. Not done

- Nobody has yet walked the new view by hand or compared it on screen against
  the references; the comparison above is by measurement and still captures.
- No release package was exported, run or traced.
- The window shrink for smaller screens and Windows were not exercised.
