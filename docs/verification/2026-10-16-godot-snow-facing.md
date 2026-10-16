# Snow walk overview key and walking Facing limit — 2026-10-16

Verification of [the agreed spec](../specs/snow-walk-overview-key-and-facing-limit.md):
M opens and closes the whole-map overview, and while walking the upper body turns
no more than 110° from travel, holds its last shoulder and turns at no more than
540° per second. Only the Godot preview changed; Java, browser and Unity code are
untouched. Retained files are in [`godot-snow-facing/`](godot-snow-facing/).

Engine: Godot `4.7.2.stable.official.ed1daf0bf`, Compatibility renderer, on the
same Apple M1 MacBook Air under macOS 26.2. "Before" is revision `fb66fc7`;
"after" is `3f21045`.

## Changes

- [`walker.gd`](../../godot/walker.gd): the cursor sets a wanted bearing. Walking,
  the target twist is the wanted bearing's offset from travel when within
  `WALKING_TWIST` (110°), otherwise the held side × 110°; Facing moves toward it
  in twist space at no more than `FACING_TURN_RATE` (540°/s), so a change of
  shoulder passes through the front. Standing, Facing tracks the cursor exactly,
  except that after stopping away from it, it first turns to it at the same rate.
  The loop walker still faces its travel.
- [`follow_camera.gd`](../../godot/follow_camera.gd) and
  [`snow_walk.gd`](../../godot/snow_walk.gd): M toggles the overview, keeping the
  play distance; a wheel step out does nothing while the overview is open.
- [`inspection.gd`](../../godot/inspection.gd): a `twist_deg` column and HUD
  reading, Facing minus the legs' direction, clockwise positive.
- [`inspection_route.gd`](../../godot/inspection_route.gd): overview-key and
  walking-Facing stages and checks, in the courtyard after the climb back up the
  stair. Wheel events now arrive at the cursor's position. Before, they arrived
  at the window's corner, and in this run that stopped the cursor's ground point
  updating until the next mouse movement. Placing the stages earlier, in the
  outpost yard, shifted the walking figure's timing and made the existing
  trail-overlap check miss its probe, so they run after the tracking stages.

## 1. Import check

`GODOT_BIN=~/Downloads/Godot.app ./godot/run.sh --check` completed without errors.
This exercises no movement or rendering.

## 2. Headless engine-event replay

```sh
"$GODOT_BIN" --headless --path godot --fixed-fps 60 -- \
  --snow-scene-check --headless-scene-check --auto-start
```

**PASS, 0 failures, 17,942 observations** ([log](godot-snow-facing/headless-route.log)).
It renders nothing. The new stages report:

- Walking north with the cursor sweeping east → south-east → directly behind →
  south-west → west → behind: 47 observations with the cursor directly behind,
  79 held at +110° (east shoulder) and 23 at −110° (west), and one shoulder
  change, from +110° to −7° when the cursor came to −96° from travel. Facing
  turned 9° per 60 Hz observation through that change.
- Stopped 68° from the cursor behind it, Facing reached the cursor within the
  9 observations that rate allows, with the legs within 60° and no new print,
  then tracked it to 0.5°.
- M at 16 m with 1.11 m of lean opened the overview; its lean fell to 0.002 m in
  1 s while the figure walked north and back. A wheel step out left it open, M
  returned to 16.0 m, and a repeat of the held key did not toggle. In the wind
  stages M opened it again and one wheel step in reached 30 m.

The existing checks pass unchanged: turn in place, walk north and south facing
east, Tab Facing, lean and detail-region stages, and the rest of the route.

**The new checks fail on the old behaviour.** With `_turn_walking` replaced by
`facing_yaw = _wanted_yaw` in a scratch copy, the same replay failed exactly four
checks and no others: Facing turned faster than 540°/s, the twist exceeded 110°,
the shoulder changed while the cursor was beyond the limit, and the figure did
not stop away from the cursor.

## 3. Before and after captures

[`capture_facing.gd`](godot-snow-facing/capture_facing.gd) walks the controlled
figure north from the outpost yard at a 10 m camera distance, holding W through
Godot's input API. The cursor's ground point sits 4 m from the figure: south-east,
then directly behind, then south-west. It forces scene focus and sets the
camera's cursor directly each frame, so it is visual evidence, not an input or
route test. Both revisions ran the same driver at 1280 × 800 and a fixed 60 Hz
step, with the HUD hidden. Both walked identically (z 1.38, −0.87 and −3.31 m at
2.25 m/s at the three shots). The first run of the after revision did not
register W, so the figure stood still; it was discarded, and two further runs
matched.

| Cursor | Before | After | Inspection |
| --- | --- | --- | --- |
| South-east, 135° | [before](godot-snow-facing/before-walk-north-cursor-se.png) | [after](godot-snow-facing/after-walk-north-cursor-se.png) | Before: the chest faces south-east over north-walking legs. After: the chest turns 110° to the east, a side view of the hood. |
| Behind, 180° | [before](godot-snow-facing/before-walk-north-cursor-behind.png) | [after](godot-snow-facing/after-walk-north-cursor-behind.png) | Before: the hood opening and both arms face the camera while the legs walk away from it, a torso twisted backwards. After: the figure looks over its east shoulder. |
| South-west, 225° | [before](godot-snow-facing/before-walk-north-cursor-sw.png) | [after](godot-snow-facing/after-walk-north-cursor-sw.png) | Before: twisted 135° the other way. After: still over the east shoulder, because the cursor is beyond 110° on the west. |

[Enlarged crops](godot-snow-facing/walk-north-enlarged.png) put before and after
side by side for each cursor. No twisted-backwards torso appears in the after
captures.

## 4. Focused graphical route from source

```sh
"$GODOT_BIN" --path godot -- --snow-scene-check --auto-start
```

**PASS, 0 failures, 18,002 observations**, none unfocused
([log](godot-snow-facing/graphical-route.log)). As in earlier records, one "Route
paused" line appears before recording began. The new stages' readings match the
headless replay. Its sweep capture is
[`route-walk-north-cursor-behind.png`](godot-snow-facing/route-walk-north-cursor-behind.png).
This is engine-event replay in a rendered window, not ordinary OS input.

## 5. Release package route

`GODOT_BIN=~/Downloads/Godot.app ./godot/export.sh macos` built the macOS release
package from the clean revision `3f21045`
([manifest](godot-snow-facing/macos-build-info.json),
[log](godot-snow-facing/macos-export.log); `godot_source_dirty: false`).

```sh
"godot/build/macos/release/PU-Town-Snow-Walk.app/Contents/MacOS/PU Town · Snow Walk" -- --snow-scene-check --auto-start
```

| Run | Result | Observations | Log |
| --- | --- | --- | --- |
| 1 | **FAIL, 1 failure**: "The walking figure teleported onto a box roof or below the ground" | 17,999, none unfocused | [log](godot-snow-facing/packaged-route-1.log), [rows](godot-snow-facing/packaged-route-1-stair-crest.csv) |
| 2 | **PASS, 0 failures** | 18,001, none unfocused | [log](godot-snow-facing/packaged-route-2.log), [CSV](godot-snow-facing/packaged-route-2.csv.gz) |

All of the new checks passed in both runs, with the same readings as the headless
replay. Run 2's sweep capture is
[`packaged-walk-north-cursor-behind.png`](godot-snow-facing/packaged-walk-north-cursor-behind.png);
its HUD reads twist +110°, travel 000°, cursor behind.

**Run 1's failure is the uncontrolled loop figure at the stair's crest, not
Facing.** Running up the stair at 4.5 m/s, its feet averaged 0.102 m below the
ground at its centre, 2 mm past the route's 0.1 m `STRIDE_SLOPE_M` allowance,
in the frame its centre crossed the crest (z 8.994 m). One boot was still on the
slope, which falls 0.5 m per metre, while the other was on the shelf. The loop
figure's movement, steps and feet are unchanged by this work: it faces its
travel, and its Facing does not affect its pose height. The lowest feet-to-ground
reading of the loop figure in each run shows how close this comes to the
allowance:

| Run | Loop figure | Controlled figure |
| --- | --- | --- |
| Headless replay | −0.083 m | +0.013 m |
| Graphical, source | −0.076 m | +0.017 m |
| Package run 1 | −0.102 m | +0.016 m |
| Package run 2 | −0.076 m | +0.017 m |

The value depends on where the figure's steps fall relative to the crest, which
varies with frame timing in a rendered window. A boot can stand up to 0.65 m from
the centre, so the mean can fall as far as about 0.16 m below the centre's ground
when straddling the crest. The 0.1 m allowance is therefore not a geometric
bound. Per the spec, existing checks stay unchanged here; widening the allowance
is left as a follow-up.

### Follow-up: derived stair-crest allowance

The route now derives the allowance from the geometry instead of the hand-picked
`STRIDE_SLOPE_M`. `CREST_SAG_M` in `godot/inspection_route.gd` is the boot reach
(`STEP_REACH_M`, 0.65 m) × the stair slope (the 5 m drop between `SHELF_GROUND`
and `FOREST_GROUND` over `STAIR_TOP` to `STAIR_FOOT`, 0.5 m per metre) ÷ 2, which
is 0.1625 m. Both feet-to-ground checks use it. The upper 1.3 m bound for a box
roof is unchanged. Run 1's −0.102 m is within the new bound.

After the change, `GODOT_BIN=~/Downloads/Godot.app ./godot/run.sh --check`
completed, and the headless replay reported **PASS, 0 failures** (17,942
observations). The lowest feet-to-ground readings were −0.083 m for the loop
figure and +0.013 m for the controlled figure, the same as before. The release
package was neither rebuilt nor rerun for this change.

## Evidence limits

- Captures come from a driver that sets the cursor directly and forces focus, not
  from OS input or the scene route.
- Routes are engine-event replays. No ordinary OS keyboard or mouse input was
  scripted for this change, and no frame trace was recorded; the change adds a
  few arithmetic operations per physics frame.
- Only the macOS release package was rebuilt. The Windows package was neither
  rebuilt nor run.
- One of two package runs failed on the pre-existing stair-crest allowance
  described above. The allowance has since been derived from the
  geometry; only the headless replay was rerun with it.
