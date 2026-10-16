# Snow walk camera steadiness — 2026-10-16

Walking through snow shook the view: every footfall packs the snow under the boot,
the figure drops into it, and the camera followed the figure's height exactly, so
the whole view jolted down at each step and rose as the swinging boot reached fresh
snow. The owner liked the feedback but found it far too strong. Agreed answers:

- The figure keeps sinking fully; only the camera's reaction changes.
- The camera frames the untouched snow where the figure stands (the saved Snow
  Depth over the ground, before Footprints packed it), so the stair, the shelf and
  Snowdrifts move it exactly, and takes a fifth of the boots' sink below that,
  eased with a 0.2 s time constant.
- The cursor's point on the ground is found on the same untouched height, so a
  footfall never moves Facing or the lean.
- Two named constants, `SINK_SHARE` and `SINK_SETTLE` in `follow_camera.gd`, tune it.

Only the Godot preview changed; Java, browser and Unity code are untouched.
Retained files are in [`godot-snow-camera/`](godot-snow-camera/).

Engine: Godot `4.7.2.stable.official.ed1daf0bf`, Compatibility renderer, on an
Apple M1 MacBook Air (`MacBookAir10,1`) under macOS 26.2. "Before" is revision
`636a860`.

## Changes

- [`walker.gd`](../../godot/walker.gd): `untouched_height`, the saved Snow Depth
  over the ground at the figure's centre, and `untouched_position()`. The sink is
  still measured at the boots.
- [`follow_camera.gd`](../../godot/follow_camera.gd): `follow` takes the figure at
  its untouched height and its sink, eases the sink with `SINK_SETTLE` (snapping
  on a zero delta, as after Tab) and frames `SINK_SHARE` of it below the untouched
  snow. `update_cursor` is given the untouched position.
- [`snow_walk.gd`](../../godot/snow_walk.gd): passes those values.
- [`inspection.gd`](../../godot/inspection.gd): `focus_y_m` and `untouched_y_m`
  columns.
- [`inspection_route.gd`](../../godot/inspection_route.gd): a camera steadiness
  check over the existing outpost-yard, Deep Snow, stair and forest stages; no
  new stages, so the route's timing is unchanged.

A first attempt framed the mean untouched height under the two boots. On the
outpost yard's drift, which rises from 9 to 41 cm over 2 m, that mean rises in
small steps as one boot plants and the other swings, leaving a 2–4 cm stepped
climb. The centre's untouched height rises smoothly, so the camera uses it.

## 1. Import check

`GODOT_BIN=~/Downloads/Godot.app ./godot/run.sh --check` completed without errors.
This exercises no movement or rendering.

## 2. Before and after measurement

[`measure_camera.gd`](godot-snow-camera/measure_camera.gd) launches the real scene
headless at 60 Hz, holds the cursor up and to the right, and walks the controlled
figure east and west three times each along one line, 2.5 s per leg. Per leg it
removes the camera height's slow trend with a 0.5 s centred mean, after the leg's
first half second of turning, and reports the remaining peak-to-peak travel and
the fastest vertical speed. Before, the same script ran on a detached copy of
`636a860` with the old `follow` call.

| Line | Leg | Before: per-step travel, fastest | After: per-step travel, fastest |
|---|---|---|---|
| Outpost yard, from (20, 4), into its drift | east | 5.0–5.1 cm, 2.33–2.49 m/s | 1.1–1.2 cm, 0.47–0.49 m/s |
| | west, on its own trail | 1.7–2.1 cm, 0.73–0.75 m/s | 1.0–1.1 cm, 0.14–0.15 m/s |
| Courtyard shelter, from (−30, −7) | east and west | 1.2–2.2 cm, 0.71–0.97 m/s | 0.1 cm, 0.01–0.02 m/s |

The remaining 1 cm in the yard is the drift itself, a real change of level the
0.5 s mean cannot fully remove; against the untouched snow the camera moves by
under 2 mm per observation (section 3). Once each leg is under way the lean
wobbles by at most 2 mm and Facing by 0.00°, before and after; the 2.8° Facing
change in an earlier untrimmed run was the start-of-leg turn toward the 110°
walking limit, not a per-step wobble.

This is headless engine-event replay: it renders nothing and is not ordinary
OS input or a visual judgement of the feel.

## 3. Headless engine-event replay

```sh
"$GODOT_BIN" --headless --path godot --fixed-fps 60 -- \
  --snow-scene-check --headless-scene-check --auto-start
```

**PASS, 0 failures, 17,942 observations**
([log](godot-snow-camera/headless-route.log)). It renders nothing. Over the
outpost-yard walks and run, the meeting-hall gap's Deep Snow, both stair passes
and the forest run, 131 steps:

- The deepest sink was 0.359 m. The camera never rose above the untouched snow
  and never sat further below it than a fifth of the deepest sink so far.
- The largest change of the figure's sink in one observation was 0.1123 m, a
  footfall packing Deep Snow. The camera's largest change against the untouched
  snow was 0.0022 m, 2% of it; the check allows 10%.
- The stair's 5 m change of level moved the camera with the untouched snow, and
  every existing check, including stair contact and speed, Facing, lean, overview
  and detail-region framing, still passes.

As in the [blizzard record](2026-10-16-godot-snow-blizzard.md), the log ends with
`ERROR: Parameter "material" is null` from the headless dummy renderer while the
engine shuts down, after the route reports.

## 4. Focused graphical route from source

```sh
"$GODOT_BIN" --path godot -- --snow-scene-check --auto-start
```

**PASS, 0 failures, 18,000 observations**
([log](godot-snow-camera/graphical-route.log)). The window was brought to the
front once after launch; as in earlier records, one "Route paused" line appears
before recording began. Over the same 131 steps the deepest sink was 0.391 m,
the figure's sink changed by up to 0.1108 m in one observation and the camera
against the untouched snow by 0.0022 m. A first launch from a background shell
never received focus and stopped after 60 seconds; it is not counted. This is
engine-event replay in a rendered window, not ordinary OS input.

## 5. Not done

No captures, release package or packaged route were made for this change, and
nobody has yet walked it by hand to judge the new amount of shake. `SINK_SHARE`
and `SINK_SETTLE` in `follow_camera.gd` are the values to adjust if it now feels
too still or still too strong.
