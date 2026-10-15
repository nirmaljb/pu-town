# Reference snow town preview verification — 2026-10-16

Delivery and measurement record for issue #103, the reference snow town of
[ADR 0027](../adr/0027-reference-snow-town-with-wind-shaped-depth.md) as built by
#96–#102: the 100 × 56 m town on two levels joined by the stair, the north-up
perspective camera with mouse Facing, Deep and Shallow Snow by place, wind-built
Snowdrifts and filling Footprints, the 24 × 16 m detail region and the walking
figure's loop. Evidence was gathered on 15–16 October 2026. Each kind of evidence
below is separate; none stands in for another. Retained files are in
[`godot-snow-town/`](godot-snow-town/).

Engine: Godot `4.7.2.stable.official.ed1daf0bf`, Compatibility renderer, OpenGL
4.1 Metal. Hardware: MacBook Air (MacBookAir10,1), Apple M1, 8 cores (4
performance, 4 efficiency), 8 GB, on AC power. OS: macOS 26.2 (25C56).

## Source changes made for this record

- The F6 frame trace now records, for each rendered frame, the wind's work in
  the physics frames since the previous one (`wind_ms`, `wind_updates`) and the
  wind setting (`wind_strength`, `wind_from_deg`). `summarize_frames.py` reports
  them under `wind` and still summarizes older traces without them.
- The scene route's ground check for the controlled figure allowed only 1 mm
  below the ground at its centre. The figure's height is the mean of its two
  boots, so crossing the stair's crest with one boot on the slope dipped it
  3.6 mm below, failing a focused graphical run
  ([log](godot-snow-town/source-route-crest-failure.log)) while both boots kept
  contact (gap below 0.3 µm). The check now uses the same 0.1 m stride
  allowance as the walking figure's. The headless route passed both before and
  after, because its step phase at the crest differed.

Packages, routes and measurements below are of revision `6af1fee`, the commit
containing both changes.

## 1. Import checks

`GODOT_BIN=~/Downloads/Godot.app ./godot/run.sh --check` imported the project and
validated every GDScript file without errors
([log](godot-snow-town/import-check.log)). This exercises no movement or rendering.

## 2. Engine-event replay

### Headless

```sh
"$GODOT_BIN" --headless --path godot --fixed-fps 60 -- \
  --snow-scene-check --headless-scene-check --auto-start
```

**PASS, 0 failures, 17,093 observations.** Retained:
[log](godot-snow-town/headless-route.log),
[complete CSV](godot-snow-town/headless-route.csv.gz) and
[summary](godot-snow-town/headless-summary.json). It renders nothing and has no
window focus, OS input or wall-clock performance meaning.

| Observed in the headless record | Result |
| --- | --- |
| Ground under the controlled figure | 0 m on the shelf to −5 m in the forest |
| Largest contact gap while grounded | 0.30 mm |
| Same Deep lane, Shift held, fresh → packed | 2.250 → 2.983 m/s |
| Walking figure | 17,093 moving observations, 16,996 at its snow's speed; 5 descents and 5 ascents of the stair |
| Tracked trail | Probe compaction 0.533 → 0.682 after following and overlapping; wind then filled 0.825 of it |
| Wind 16 from the north-west, 41.1 wind-seconds | Prints remaining: exposed 0.68, sheltered 0.92, lee 0.00 |
| Lodge lee drift | 0.602 → 1.132 m, settling (+0.001 m in the last second) |
| East shed windward face | 0.148 → 0.031 m |
| Wind reversed with four `]` | Old lee −0.674 m; old windward face +0.186 m |
| Footprint uploads | 107,447 bytes per footstep on average; bound 409,600 |
| Camera | Distance 10–30 m and overview; lean at most 3.00 m |

### Graphical, source scene and release package

```sh
"$GODOT_BIN" --path godot -- --snow-scene-check --auto-start
"godot/build/macos/release/PU-Town-Snow-Walk.app/Contents/MacOS/PU Town · Snow Walk" -- --snow-scene-check --auto-start
```

| Run | Result |
| --- | --- |
| Source scene | **PASS, 0 failures**, 17,151 observations, none unfocused ([log](godot-snow-town/source-route.log), [CSV](godot-snow-town/source-route.csv.gz), [summary](godot-snow-town/source-route-summary.json)) |
| macOS release package | **PASS, 0 failures**, 17,151 observations, none unfocused ([log](godot-snow-town/packaged-route.log), [CSV](godot-snow-town/packaged-route.csv.gz), [summary](godot-snow-town/packaged-route-summary.json)) |

Each log shows one "Route paused" line before recording began, while the window
was being brought to the front; no observation was unfocused. A watcher brought
the window back if another application took the front and logged it. It logged
nothing during either passing run.

Interrupted runs are retained and **not** claimed as passes:

| Run | What happened |
| --- | --- |
| [Source, Mac in use](godot-snow-town/source-route-focus-interrupted.log) | The Mac was in use; the route stopped after 60 s without focus |
| [Source, stair crest](godot-snow-town/source-route-crest-failure.log) | Failed the over-strict crest check described above |
| [Package, 8 s focus loss](godot-snow-town/packaged-route-focus-interrupted.log) | Passed, but with 483 unfocused observations |
| [Package, 32 s focus loss](godot-snow-town/packaged-route-focus-failure.log) | Lost focus at wind 16; the wind kept running, and the sheltered print no longer outlasted the exposed one |
| [Package, pointer moved](godot-snow-town/packaged-route-input-interference.log) | The Claude app and Chrome took the front ([watcher log](godot-snow-town/packaged-route-input-interference-focus.log)); the real pointer moved Facing and lean, failing three cursor checks |

Engine-event replay sends input through Godot's input API. It shows scene
behavior in a rendered window, not OS keyboard handling or performance.

## 3. Ordinary keyboard and mouse input

The release package was launched normally, without the route, and driven by
ordinary macOS keyboard and mouse events: CGEvents posted to the HID event tap,
the same path as a physical keyboard and mouse. The events came from the
[driver](godot-snow-town/osinput.swift) and
[script](godot-snow-town/native-input-script.txt), not from a person at the
keyboard. macOS Accessibility permission was granted for this. The window kept
focus throughout (8,114 observations, none unfocused;
[CSV](godot-snow-town/native-input-route.csv.gz),
[summary](godot-snow-town/native-input-summary.json),
[driver log](godot-snow-town/native-input-driver.log)).

| Inspected | Observed in the CSV |
| --- | --- |
| Facing | Cursor east, north, west and south of the standing figure; Facing followed it, ending at 180°, with no footsteps |
| Camera lean | Cursor in the north-east corner leaned the focus 3.00 m; back on the figure it returned |
| Facing and travel | Walking north then south with the cursor east: Facing 81.5°, travel and print bearings 180° |
| Wind strength and direction | `−` to 0, `=` to 3, `]` from 0° (north), `[` back to 315°, `0` back to 1; then `=` to 16 |
| Both levels and the stair | Shelf → south gate → forest → back: ground 0 to −5 m and back, walking 2.25 m/s on the slope, contact gap below 1.5 µm, no obstruction |
| Probes | F5 fixed three probes: meeting-hall gap, courtyard, top of the stair. At wind 16 for about 8 s their compaction fell 0.317 → 0.224, 0.317 → 0.224 and 0.679 → 0.475 |
| Tab and the walking figure | Tab took control of the walking figure at (7.1, 7.5) on the loop. The released figure walked the loop from the south gate down the stair to (−19.7, 21) in the forest, where Tab returned control to it |
| Zoom | Wheel to 10 m, out to the whole-map overview (whole map visible in all 186 overview observations), back to 22.7 m |

## 4. Visual inspection

Captures from the ordinary-input run (`F1` hid the HUD where noted), inspected
at full size and enlarged where needed:

| Capture | Inspection |
| --- | --- |
| [Close view](godot-snow-town/native-close.png), 10 m, forest | Deep prints read as pits with ragged rims; the figure faces west toward the cursor |
| [Overview](godot-snow-town/native-overview.png), HUD hidden | The whole town is framed: compound, courtyard and stair, meeting hall, outpost, rim rock, pines; trails show as dotted lines |
| [Lee drift](godot-snow-town/native-lee-drift.png), HUD hidden | After 15 s at wind 16 the drift rises against the lodge's south face, with a wavy crest along the wall |
| [Trail](godot-snow-town/native-trail.png), HUD hidden | From the south gate, leaning south: the trail down the stair between the cliff masses, and the walking figure's lane across the courtyard |
| [Stair](godot-snow-town/native-stair.png), HUD hidden | Both figures on the walled slope with paired bootprints; the low walls and cliff masses stay solid |
| [Lean](godot-snow-town/native-lean.png) | 3 m lean toward the north-east corner; the figure faces the cursor |

Defects and weaknesses seen, reported rather than corrected here:

- **Drift shading shows straight-edged bands.** Beside the lodge, the drifted
  snow shades in rectangular steps, with a horizontal band through the figure
  and a vertical edge to its west, instead of tapering smoothly.
- **Fresh shallow prints read ambiguously.** At 10 m, prints in 0.4 m loose
  snow at default wind look more like pale raised pads than hollows
  ([route close view](godot-snow-town/route-close.png)). Packed and deep prints read clearly as hollows.
- **The lee drift is hard to read at 10 m.** Close to the wall, the
  [route's capture](godot-snow-town/route-lee-drift.png) shows little more than a pale rise; it reads at 16 m with a lean.
- **The HUD hides the west of the view.** In the
  [overview with the HUD shown](godot-snow-town/route-overview-hud.png), the panel covers the compound, courtyard and stair. Captures intended for
  the town should hide it with F1.
- **The 5 m level change reads weakly from above.** In the overview the forest
  floor looks continuous with the shelf, because cliff boxes cover the step.

## 5. Frame measurement

The macOS release package at 1280 × 800, launched normally, warmed by walking,
then F6 and 60 s of walking with ordinary OS key events
([script](godot-snow-town/benchmark-input-script.txt)) from the outpost yard along
the south lane, through the meeting-hall gap and the east gate, across the
courtyard, down the stair to the forest, back up and east through the gate again.
It crossed Shallow and Deep Snow, left a trail and went round boxes without
standing against them. Wind 1 from the north-west throughout; no figure
switching; camera at 16 m. Summarized with `python3 godot/summarize_frames.py`:
[summary](godot-snow-town/benchmark-summary.json),
[raw trace](godot-snow-town/benchmark-frames.csv.gz).

| Measure | Result |
| --- | --- |
| Duration | 60.02 s, 3,316 frames, complete; no warnings |
| Coverage | Focused and moving for 100% of the trace |
| Resolution | Viewport and window 1280 × 800 |
| Average FPS | 55.2 |
| Frame time | Mean 18.10 ms, p95 21.99 ms, p99 24.04 ms, max 68.74 ms |
| Frames over 33.4 ms | 2 |

**Wind update cost.** The wind's work, including publishing the Snow Depth
pictures at the end of each sweep, cost **0.376 ms per physics update** on
average over 3,602 updates, and **0.408 ms per rendered frame** (p95 0.78 ms,
p99 1.32 ms). That is 2.3% of frame time. It is well below the 2–3 ms estimate.
Three updates spiked to 10.8, 10.4 and 6.6 ms. The 68.7 ms worst frame ran three
catch-up physics updates, of which 6.6 ms was wind. The ordinary-input run
observed similar per-update costs at wind 1, 3 and 16 (means 0.39, 0.39 and
0.38 ms; max 0.86 ms), so cost does not depend on strength above 0. Wind 0 costs
about 0.02 ms.

These are engine frame-loop timings, including the recorder, not GPU timestamps
or display latency. Concurrent workload: Chrome, ChatGPT, Codex and the Claude
app were open, and the scripted input, its focus watcher and `top` were running
([before](godot-snow-town/benchmark-workload-before.txt),
[during](godot-snow-town/benchmark-workload-during.txt)). This is one run on one
machine, not a platform baseline.

## 6. Exports

`GODOT_BIN=~/Downloads/Godot.app ./godot/export.sh all` built both release
packages from the clean revision `6af1fee`:

- **macOS**: universal (`x86_64 arm64`), ad-hoc signed, not notarized
  ([manifest](godot-snow-town/macos-build-info.json),
  [log](godot-snow-town/macos-export.log)).
- **Windows**: x86-64 PE32+ executable with embedded data
  ([manifest](godot-snow-town/windows-build-info.json),
  [log](godot-snow-town/windows-export.log)).

Both manifests record `godot_source_dirty: false`, and their source hashes match
the committed Godot sources. Packages stay ignored under `godot/build/`.
**Windows runtime and hardware are untested**: the executable was not run on
Windows.

## Evidence limits

- The ordinary input was scripted OS events, not a person at the keyboard. It
  establishes the macOS input path, not hand feel.
- Frame results are one release run on an Apple M1 with a desktop workload.
  They are not GPU timings, a Windows result or a cross-machine baseline.
- Wind is a bounded authored model. Footprints and snow reset at launch.
- This preview has no Room, networking or Game integration. Sharing a trail
  between two local figures does not establish multiplayer synchronization.
- Java, browser and Unity source and contracts are unchanged, so their suites
  were not run as evidence for this Godot-only work.
