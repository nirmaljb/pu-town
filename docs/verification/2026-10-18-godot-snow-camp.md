# Snow walk Camp buildings as placeholder boxes — 2026-10-18

Verification of issue #109, a slice of #104 (Frostwatch Outpost). The Camp's
buildings stand round the Town Square as solid placeholder boxes, the eight warm
lamps hang on their doors and windows, and wind shelters, drifts and scours
round them. Only the Godot preview changed; Java, browser and Unity code are
untouched. Retained files are in [`godot-snow-camp/`](godot-snow-camp/).

Engine: Godot `4.7.2.stable.official.ed1daf0bf`, Compatibility renderer, on the
Apple M1 MacBook Air (8 GB) under macOS 26.2, 2560 × 1440 window. "Before" is
revision `dfe86e9` (#108); "after" is `1003fd4`. Other applications ran throughout,
and the Mac saw keyboard and mouse input at times during the session (§4, §5, §6).

## Changes

- [`town_layout.gd`](../../godot/town_layout.gd): a `CAMP` table, the single
  definition of the Camp's buildings by name, kind, centre, size and height, read
  into the obstacle list that movement, wind and the walking figure already use,
  and drawn as boxes coloured by kind. Arranged after the owner's painted Camp,
  with the four diagonals out of the Town Square's corners left open for the
  Roads (see *Layout* below):

  | Building | Centre X, Z (m) | East–west × north–south (m) | Height (m) |
  | --- | --- | --- | --- |
  | Lodge | 1, −22 | 20 × 12 | 7 |
  | Chimney, on the lodge's east gable | 11.7, −20 | 1.4 × 1.4 | 9.5 |
  | Antenna mast, beside the lodge's west end | −12, −26 | 0.5 × 0.5 | 12 |
  | Generator shed | −26, −6 | 8 × 6 | 3.5 |
  | Lattice radio tower | −28, 10.5 | 3 × 3 | 16 |
  | Crate stacks | −23.5, 8; −21.5, 10.5 | 2.4 × 1.6; 1.6 × 1.6 | 1.2; 1.6 |
  | Barrel stack | −24, 11 | 1.2 × 1.2 | 1 |
  | Two cabins | ±6.5, 19.5 | 7 × 5.5 | 4 |
  | Open workshop | 25, −6 | 8 × 6 | 3.5 |
  | Small shed | 28, 0 | 4 × 3 | 2.6 |

  The Town Square, the Camp's open yard, becomes 40 × 30 m (it was a 40 × 40 m
  Shallow zone on the open field), between the lodge's south face and the
  cabins. `WARM_LIGHTS` moves the eight lamps from 30 cm lanterns in the snow to
  15 cm outside building faces at 1.8–2.4 m: the lodge's door and two windows,
  the generator shed's and workshop's doors, the small shed's window and the
  cabins' doors, all facing the square. Route landmarks move off the buildings:
  `packed_lane` (−24, 0) → (−44, 0) and `trail_start` (−30, −12) → (−50, −12),
  west of the Camp; new `small_shed_south`, `town_square_west`,
  `lodge_windward` and `lodge_south` for the building and wind stages. The
  walking figure's loop is unchanged; it already passes clear of every box.
- [`inspection_route.gd`](../../godot/inspection_route.gd): the route walks north
  into the small shed's south face and the lodge's south face, where each must
  hold the controlled figure still against that face for at least half a second.
  Every observation checks that neither figure stands within a building's
  footprint (where its roof is) nor higher above the ground than the deepest snow,
  that a building holds the controlled figure only in those stages and never the
  walking figure. The wind stages bring back ADR 0027's shelter, Snowdrift and
  scour checks with four wind probes beside the trail and tracking probes: the
  open Town Square, the small shed's lee (which the workshop shelters in turn), the
  lodge's exposed west face and the lodge's lee. A lamp check reads the layout: eight lamps, each outside a building, within
  0.5 m of its face and at 1.5–3 m, below its roof.
- [`inspection.gd`](../../godot/inspection.gd),
  [`snow_surface.gd`](../../godot/snow_surface.gd),
  [`snow_wind.gd`](../../godot/snow_wind.gd): a `wind_shaped_from_deg` column,
  the bearing whose drifts, scour and shelter the snow follows now; it lags a turn
  until the worker has shaped it (§2). The HUD marks the wind as turning
  meanwhile. Nothing else in the wind changed.
- The tracking stage's four back-and-forth passes over the found trail are now all
  6.75 m long instead of growing by 0.1125 m (§2).
- `godot/README.md` and `AGENTS.md` describe the Camp, the new landmarks, stages
  and column. ADR 0028 already describes the Camp as built; it is unchanged.

### Layout

The owner's references disagree on where the Camp's buildings stand. The painted
centre view puts its four buildings on the diagonals round a small yard, with
paths leaving between them; the larger painting puts the lodge north-east with its
chimney on the east gable, the generator shed and towers north-west and west,
crates west, an open-roofed building south-west and a small shed east; the
satellite sketch, which [the references' README](../art/frostwatch-reference/README.md)
says sets the layout where they differ, runs the four Roads diagonally out of the
Camp. A building on a diagonal would stand on a Road, so the ring is turned onto
the square's sides: the lodge north (its chimney on the east gable, the mast
beside its west end), the cabins south, the generator shed, radio tower and crate
and barrel stacks west, the workshop and small shed east. Every building stays at
least 3.4 m from a Road's centre line drawn outward at 45° or along the sketch's
own directions, from the map's centre or from the square's corners (the closest
is the lodge to a north-east line through the centre), so a 4 m Road has at least
1.4 m clear. The yard is 40 m east–west; north–south it is 30 m, because a 20 m lodge between two 45° Roads must
stand at least about 14 m north of the centre. The workshop stands upwind of the
small shed so that the shed's lee shows shelter without a Snowdrift.

For #113: the boxes span x −32.25…30 and z −28…22.25 m. A 70 × 55 m ellipse
centred on the origin would cut the lodge's north face (z −28, beyond 27.5); one
centred 3 m north, at (0, −3), clears every box by at least 2.2 m, as would a ring
that bulges round the lodge as the fence sketch's does. The route's open-snow
stages, west of the Camp, are reached along a lane west out of the square with no
Road opening; they will need to move when the Perimeter closes it.

## 1. Import check

`GODOT_BIN=~/Downloads/Godot.app ./godot/run.sh --check` completed without errors,
as part of `./godot/export.sh macos` on `1003fd4`. It exercises no movement or
rendering.

## 2. Headless engine-event replay

```sh
"$GODOT_BIN" --headless --path godot --fixed-fps 60 -- \
  --snow-scene-check --headless-scene-check --auto-start
```

**Before** (test-first, during development):

- With the new building, wind and lamp checks and the moved landmarks, against a
  layout with no boxes and the old lanterns, the route **FAILED, 19 failures**
  ([log](godot-snow-camp/headless-route-before-camp.log)): neither building held
  the figure (0 observations), every lamp stood off any building, no drift, scour
  or shelter, and a figure "stood inside a Camp building" (it walks through where
  the boxes were to be). One failure was not about the Camp: following and
  overlapping the walking figure's trail did not raise the probe's compaction.
  The old passes, of 6.75, 6.86, 6.98 and 7.09 m, re-press the probe's print only
  for some step phases, and moving the stages west had changed the phase. A model
  of the walker's footfalls showed equal 6.75 m passes bring the fourth eastward
  return within about a centimetre of a whole number of strides from the print,
  whatever the phase and whichever boot made it; with them the probe's compaction
  rose in every later run.
- With the boxes built, it **FAILED, 1 failure**
  ([log](godot-snow-camp/headless-route-before-wind-wait.log)): after four turns
  of `]` the lodge's lee kept growing instead of wearing away. The wind's worker
  shapes each turned bearing in real time, 0.82–0.86 s on this map in the logged
run (up to 0.96 s in an earlier one)
  ([`shape_timing.gd`](godot-snow-camp/shape_timing.gd),
  [log](godot-snow-camp/shape-timing.log)), while the replay runs several times
  faster than real time: the 10 s stage ended before the reversed shape landed,
  and the record showed an intermediate bearing's shape adopted first. The route
  now waits, standing still, until the new `wind_shaped_from_deg` column shows
  the reversed bearing, then times the 10 s stage, and fails if that takes more
  than 30 s.
- Two deliberate mutations of the final layout, on a copy of the project, were
  each caught: a lodge left out of the obstacle list failed 7 checks
  ([log](godot-snow-camp/headless-mutation-lodge-not-solid.log)), among them the
  footprint check, the lodge hold, the drift and the scour; a Camp without the
  workshop failed 3, the small shed's lee drifting 0.63 m and its print filling
  faster than an open one (0.01 of it left after 41 wind-seconds, against 0.70) ([log](godot-snow-camp/headless-mutation-no-workshop.log)).

**After: PASS, 0 failures, 30,162 observations**
([log](godot-snow-camp/headless-route.log)). It renders nothing. Selected lines:

> The small shed held the figure still against its face for 56 observations
>
> The lodge held the figure still against its face for 72 observations
>
> After 41.1 wind-seconds, prints remain: exposed 0.70, sheltered 0.92, lee 0.02
>
> Largest change of Snow Depth under the prevailing wind: exposed 0.0000 m, sheltered 0.0000 m
>
> Lee drift 0.096 -> 1.117 m (first second +0.190, last second +0.002)
>
> Windward scour 0.249 -> 0.032 m
>
> Reversed wind: old lee -1.019 m, old windward face +1.037 m
>
> Tracking probe compaction 0.675 -> 0.823 after following and overlapping

The open print filled at the 120 wind-second rate (0.70 left after 41 s), the
sheltered one about four times more slowly (0.92, against 0.91 expected), the lee
print fastest while its drift built. The walking figure kept to its loop and was
never held by a building; running, packing, lean, framing, Facing, the detail
region and the overview read as in the #108 record. Both figures started in the
Town Square at their landmarks. The run's first observations differ from an
earlier run's by micrometres: the wind blows at its default strength for the
route's first 0.2 s, and at its earlier place west of the generator shed the mast's
lee reached the lane the figure later runs along.

What the route does not cover: it walks into two of the twelve boxes, the lodge
and the small shed. The others share the same obstacle list and sweep, and appear
in the captures (§3); the footprint check would catch a figure standing in any
of them. The lamp check reads the layout, not the scene: it confirms each lamp is
on a building's face at door or window height, not that the face has a door or
window, which a placeholder box does not have. The headless replay reads no
lights.

## 3. Captures

[`camp_capture.gd`](godot-snow-camp/camp_capture.gd) places the figure directly
(not through the route), with the HUD hidden, no lean, wind 0 and falling and
blowing snow, gusts and lightning off, on `1003fd4`:

| Capture | Inspected |
| --- | --- |
| [camp-camp-frame.png](godot-snow-camp/camp-camp-frame.png) | A verification-only 95 m camera distance framing the whole Camp. Every box stands where the table above puts it: the lodge across the north with its chimney at the east gable and the mast at its west end, the cabins south, the generator shed, tall radio tower and three low crate and barrel stacks west, the workshop and small shed east. Six lamps show, on the lodge, generator shed, workshop and small shed, pooling warm light on the snow below them; the cabins' two hang on their north faces, toward the square and away from this north-up camera, so they do not show here. The square between is open. |
| [camp-beside-painted-reference.png](godot-snow-camp/camp-beside-painted-reference.png) | That capture beside crops of the owner's painted centre view and larger painting, from [`side_by_side.py`](godot-snow-camp/side_by_side.py). The ring of buildings round an open yard, the lodge as the largest building to the north with its chimney east, towers and crates to the west and a small shed to the east follow the paintings; the buildings stand on the yard's sides rather than its diagonals, and the yard is larger than the painted one, as *Layout* explains. The paintings' roofs, porches, fences and paths are not part of this slice: the Perimeter and Roads come in #110 and #113, and every building is a plain box. |
| [camp-lodge-default.png](godot-snow-camp/camp-lodge-default.png) | The default play view from the square, 10 m south of the lodge: its south face with the lit door and two windows, warm light on the snow at its foot, the chimney's edge at the east gable and the lodge's shadow falling north-east. |
| [camp-square-widest.png](godot-snow-camp/camp-square-widest.png) | The widest play view from the square's centre: the lodge's lit face with the mast's foot beyond its west end, the generator shed's and workshop's lit doors at the edges of the view, and the boxes' soft shadows. |
| [camp-overview.png](godot-snow-camp/camp-overview.png) | The M overview of the whole 160 × 160 m map: the Camp small at its centre, the lodge's lamps visible, open snow all round. |

The graphical routes also capture the view at their F9 stages. In the source run
the capture after the drifts built shows the figure against the lodge's lit south
face with its feet 1.07 m above the ground, on the surface of the Snowdrift that
built there (the HUD reads 1.085 m of snow).

## 4. Graphical route from source

```sh
open -n -W -a ~/Downloads/Godot.app --args --path godot -- --snow-scene-check --auto-start
```

- **Run 1, on the commit before review fixes (`c560982`, not pushed): FAILED, 3
  failures** ([log](godot-snow-camp/graphical-route-1-real-cursor.log)), all from
  the first lean stage: the camera leaned 0.21 m toward the corner cursor instead
  of 5.5 m. The record shows the cursor's ground point jumping to places the route
  never pointed at, (121.96, −178.6) among them, and the lean dropping as the
  pointer left the window: a real mouse was moving over the window (the Mac's input
idle time was under a second when the run began). Every Camp, wind
  and lamp check passed in that run.
- **Run 2, on `1003fd4`, the real pointer moved to the screen's corner first:
  PASSED, 0 failures, 30,305 observations**
  ([log](godot-snow-camp/graphical-route-2.log)). Lean 3.00 / 5.50 / 8.00 m;
  small shed and lodge held 56 and 72 observations; lee drift 0.096 → 1.118 m;
  scour to 0.031 m; reversed wind −1.019 / +1.037 m; tracking 0.675 → 0.846.

These are engine-event replay in a rendered window, not ordinary OS input.

## 5. Mac release package

`GODOT_BIN=~/Downloads/Godot.app ./godot/export.sh macos` exported the package
from the clean commit `1003fd4`
([build record](godot-snow-camp/macos-build-info.json),
`godot_source_dirty: false`), launched through Launch Services:

```sh
open -n -W -a "$PWD/godot/build/macos/release/PU-Town-Snow-Walk.app" --args -- --snow-scene-check --auto-start
```

- **Run 1 FAILED** ([log](godot-snow-camp/packaged-route-1-focus-lost.log)):
  another application took the front in its first minutes, the route paused, and
  after 60 s without focus it stopped, as designed. The Mac had seen keyboard or
mouse input about a minute before the failure was read.
- **Run 2, started once the Mac had been idle for two minutes, the pointer moved to
  the screen's corner: PASSED, 0 failures, 30,306 observations**
  ([log](godot-snow-camp/packaged-route-2.log)), with the same building holds,
  wind, lean and framing values as the source run. Its "camera follow" count is
  lower than in source (12,385 against 25,745), as in #108's package run (10,711
  against 15,815); those counts are of rows the check examined, and no row failed it.

## 6. Frame time

**Release F6 traces.** Each run launched a package through Launch Services at its
2560 × 1440 window and posted the
[input script](godot-snow-camp/benchmark-input-script.txt) as ordinary macOS
events from [`osinput_guarded.swift`](godot-snow-camp/osinput_guarded.swift), which
stops as soon as the package is no longer the frontmost application, via
[`run_benchmark.sh`](godot-snow-camp/run_benchmark.sh) (both copied from the #108
record): a short warm-up, F6, then 60 s walking west across the Town Square, north
past the lodge's west end, east along its lit south face and back south, wind 1
from the north-west, cursor resting on the figure, no figure switching. #108's
script walks north into where the generator shed now stands, so this path stays
inside the Camp, clear of every box, with the lodge in view most of the minute; the
baseline package walks the same path over open snow. "Camp" is `1003fd4`;
"baseline" is `dfe86e9`, exported from a separate checkout of that commit. Each
run began only after the Mac had seen no keyboard or mouse input for at least a
minute, with the real pointer moved to the screen's corner. Every trace is
complete at 60 s, focused and moving throughout, over the same ground (x −17.8 to
6.1 m, z −10.8 to 2.4 m); per-run summaries, gzipped traces and launch, driver and
workload notes are `trace-N-<build>-*` in the folder.

| Run | Time | Build | Avg FPS | Mean | p95 | p99 | Wind per frame |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 01:53 | Camp | 28.8 | 34.76 ms | 44.76 ms | 48.50 ms | 4.16 ms |
| 2 | 01:55 | baseline | 28.6 | 34.97 ms | 39.25 ms | 41.20 ms | 4.40 ms |
| 3 | 01:58 | Camp | 31.3 | 32.00 ms | 35.98 ms | 37.63 ms | 3.93 ms |
| 4 | 02:01 | baseline | 28.8 | 34.76 ms | 38.82 ms | 41.47 ms | 4.32 ms |
| 5 | 02:03 | Camp | 31.2 | 32.08 ms | 35.94 ms | 37.55 ms | 3.93 ms |
| 6 | 02:06 | baseline | 28.6 | 35.00 ms | 39.36 ms | 41.46 ms | 4.43 ms |
| 7 | 02:08 | Camp | **31.2** | 32.08 ms | 35.93 ms | 37.51 ms | 3.95 ms |
| 8 | 02:10 | baseline | 28.8 | 34.78 ms | 39.03 ms | 41.41 ms | 4.35 ms |

The Camp build walked at **31.2–31.3 FPS** in runs 3, 5 and 7 and 28.8 FPS in run 1,
the first after the source captures, while system daemons (`duetexpertd`,
`replayd`) were busy; the baseline held 28.6–28.8 FPS in all four. Every Camp run is
above the 24 fps target, with p95 frames of 36–45 ms. Over the same path the
boxes made walking about 2.7 ms a frame cheaper, not dearer: a plausible reason is
that they hide snow whose shading costs more than theirs, but that was not
measured separately. The wind's work was the same per physics update (2.0–2.1 ms
in both builds; the obstacles add nothing to its relaxation) and smaller per frame
in the Camp build only because it drew more frames. These are engine frame-loop
timings including the recorder, from one machine with a desktop workload (ChatGPT
with Codex, Chrome and a Blender process open; 62–174 MB of memory unused across
the samples), not a platform baseline.

## 7. Code review

`/code-review` against `dfe86e9` ran a standards and a spec review of `c560982`.
Acted on before the final commit:

- The box colours matched on building names; each entry now carries a `kind`.
- The route's three places that flush and read the latest observation share one
  helper; building lookups pass the building, not its name.
- The tracking comment and the README now say exactly what the equal passes rely
  on: the parka's 0.62 m walking step and a trail reached from the west.
- The README no longer says the height check catches every roof: the crate and
  barrel stacks are lower than the deepest snow, so only the footprint check
  guards their roofs. It states the measured 0.8–1 s shaping time.
- The antenna mast moved from west of the generator shed to beside the lodge's
  west end, on the generator shed's side, nearer where the larger painting puts it,
  between the two.

Left as they are, with reasons: the Town Square is 40 × 30 m (see *Layout*); the
workshop stands east beside the small shed rather than south-west, because the
south side holds the cabins between the Roads and the pairing shows shelter
without a drift; the `wind_shaped_from_deg` column was not asked for, but without
an observation of when a turn lands the headless replay cannot time what the
reversed wind does; the tracking passes changed because the moved stages exposed
their dependence on step phase; the README's Camp table repeats the layout's
numbers for readers, as its landmark table does; the Perimeter fit is left to #113
(see *Layout*).

## 8. Not done

- The release traces cover one 60 s path inside the Camp at the default distance;
  the overview, the widest view and walking beside the radio tower or crates were
  not timed.
- Nobody walked the change by hand with ordinary keyboard and mouse input; the
  release traces used posted OS events, the routes engine events.
- The route walks into two buildings of twelve; the other ten rely on the shared
  obstacle code, the footprint check and the captures.
- Windows was not exported or run.
