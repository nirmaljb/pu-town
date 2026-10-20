# Snow walk Roads and Deep tree clusters — 2026-10-20

Verification of issue #110, a slice of #104 (Frostwatch Outpost). Four Shallow
Roads run from the Town Square's corners to the interim map's edge, placeholder
tree clusters stand in Deep Snow round the Camp, and the north-west wind drifts
snow over a Road. Only the Godot preview changed; Java, browser and Unity code are
untouched. Retained files are in [`godot-snow-roads/`](godot-snow-roads/).

Engine: Godot `4.7.2.stable.official.ed1daf0bf`, Compatibility renderer, on the
Apple M1 MacBook Air (8 GB) under macOS 26.2, 2560 × 1440 window. "Before" is
revision `f41d039` (the Camp, #109, plus the owner's unrelated shed-authoring
commits, which touch no file under `godot/`); "after" is `09d5178`, the commit every
run below used. On `native-live` it is `379391a`: the same commit rebased onto three
more of the owner's asset commits under `tools/`, with `godot/` byte-identical. The work ran on
2026-10-19 and 2026-10-20; other applications ran throughout and the owner used the
Mac at times (§4).

## Changes

- [`town_layout.gd`](../../godot/town_layout.gd), the single definition of the
  map:
  - `ROADS`: four headings, north-west, north-east, south-west and south-east, and
    `ROAD_WIDTH` 4 m. `road(name)` derives each Road's centre line from them: from
    the Town Square's corner on its side, straight along its 45° diagonal to where
    it meets the map's edge, at (±80, ±75), 5 m from the corners. A Road has no
    ground of its own; it is a Shallow Snow zone.
  - `TREE_CLUSTERS`: four placeholder clusters, each a `Rect2` zone of Deep Snow
    holding solid tree boxes of `TREE_SIZE` 2 × 2 m and `TREE_HEIGHT` 6.5 m:

    | Cluster | Zone X, Z (m) | Trees | Beside |
    | --- | --- | --- | --- |
    | West | −78 to −58, −36 to −12 | 8 | open snow beyond the lane out of the square, 12 m from the north-west Road |
    | South-west | −54 to −35.5, 12 to 26.5 | 8 | the south-west Road, on its upwind side |
    | North-east | 60 to 78, −46 to −30 | 7 | the north-east Road, on its downwind side |
    | South-east | 44 to 60, 14 to 30 | 6 | the south-east Road, on its north-east side |

  - `DEEP_SNOW` 0.6 m. `starting_snow_depth` starts open snow at 0.25 m, blends each
    cluster's zone toward Deep and then the Town Square and Roads toward Shallow
    (0.09 m), each over the existing 1.5 m `ZONE_BLEND`, so Shallow wins where a
    Road passes a cluster's corner.
  - `solid_boxes()`: the obstacle list, every Camp building and tree as a box, which
    movement, wind and the route all read; tree boxes are drawn in one dark green.
    Boxes of a kind now share one material instead of one each, since the trees
    add 29 boxes.
  - Landmarks: `packed_lane` (−44, 0) and `trail_start` (−50, −12) are gone;
    `west_lane` (−34, 0) and `deep_lane` (−38, 16) are new. The trail now starts at
    the south-west Road's corner, taken from `road("south_west")`.
- [`inspection_route.gd`](../../godot/inspection_route.gd), the scene route:
  - West of the Camp it packs its lane in the south-west cluster's Deep Snow
    instead of open snow: a fresh run with Shift held must stay at walking speed
    (1.06 m/s) once past the prints of the walk that reached the lane, on snow at
    least 0.55 m deep; after the run, two walks and the walks back, running there
    must beat the fresh lane by at least 0.5 m/s.
  - It walks to the south-west Road's Town Square corner, lays its probed trail
    along the Road's first 4.5 m and runs on along the Road to the map's west edge,
    replacing the run north to the edge. Every observation of the walk and run must
    lie on the Road with Shallow Snow (at most 0.10 m), the run at full speed
    (4.5 m/s), until the edge holds the figure at the Road's end.
  - Back along the Road, it walks onto the point straight downwind, under the
    prevailing wind, of the tree nearest the Road (worked out from the layout) and
    fixes a seventh probe, in slot 2. The probe must lie on the Road, start Shallow,
    hold its depth while the wind is still, and drift at least 0.3 m deeper by the
    end of the drift stage.
  - It reads the layout's four Roads: each from its own Town Square corner,
    diagonal, to the map's edge, about 4 m wide.
  - Every observation checks that no figure stands within a tree's footprint as
    well as a building's, and that no obstacle holds the controlled figure outside
    the stages that walk into a building.
  - The lodge-lee probe now steps back one walking step instead of 1 m (§2).
- [`inspection.gd`](../../godot/inspection.gd): seven probe slots instead of six
  (`probe7_…` columns).
- `godot/README.md`, `AGENTS.md` and an amendment to ADR 0028 describe the Roads,
  clusters, zones, landmarks and route.

### Layout

The satellite sketch's Roads bend and leave the Camp at roughly 35–55° from north;
the two western branches belong to the full-size map (#115). On the 160 × 160 m
interim map the Roads are straight 45° diagonals from the square's corners, which
the Camp already leaves open (the #109 record checked every box against such lines)
and which a figure follows exactly with two movement keys, as the route does.
ADR 0028 is amended to say so.

The clusters stand where the sketch has trees near the Camp: a large cluster
west-north-west of it, trees along the north-east and south-east Roads, and one
beside the south-west Road, where the route needs Deep Snow near the lane out of
the square and a Road crossing the wind. In the wind's model a sheltered obstacle
builds no Snowdrift, so a tree drifts snow over a Road only when no other obstacle
stands within its shelter upwind (up to 12 m). The south-west cluster's corner tree
stands 0.8 m from the south-west Road's edge with that fetch clear; the cluster's
other trees stand off its north-west diagonal. The north-west and south-east Roads
run along the wind, so trees beside them drift snow beside them, not over them.

Every tree stands at least 2 m from every route corridor and at least 2.8 m from a
Road's centre line, by a geometry check run while laying them out (not retained,
and not part of the route; the route's footprint and obstacle checks cover the
corridors it walks).

## 1. Import check

`GODOT_BIN=~/Downloads/Godot.app ./godot/run.sh --check` completed without errors
in this worktree before the work, and again as part of `./godot/export.sh macos`
on `09d5178`. It exercises no movement or rendering.

## 2. Headless engine-event replay

```sh
"$GODOT_BIN" --headless --path godot --fixed-fps 60 -- \
  --snow-scene-check --headless-scene-check --auto-start
```

**Before** (test-first, during development):

- On `f41d039` the route passed, 30,162 observations.
- With the new route stages and checks (in an earlier wording) and the new
  landmarks, against a layout whose Roads, clusters and trees were defined but not
  yet wired into Snow Depth or the obstacle list, it **FAILED, 9 failures**
  ([log](godot-snow-roads/headless-route-before-wiring.log)):
  - the Road's snow was 0.25 m, so running along it was held back and stopped
    short of the edge (three failures, and the boundary check);
  - running in the cluster was not held to walking: the fresh open snow let it reach
    3.8 m/s, and it ran on into where a tree was to stand (the footprint check);
  - the Road probe stood in 0.25 m snow and no Snowdrift built over it (two
    failures);
  - and the lodge-lee drift settled at 1.037 m, below its 1.05 m check (next item).
- With the zones and trees wired in, a run **FAILED, 1 failure**
  ([log](godot-snow-roads/headless-route-lee-phase.log)): the lodge-lee Snowdrift
  settled at 1.025 m. This is an existing fragility the new stages exposed by
  changing the step phase. The lee probe is the figure's latest print after it
  steps back from the lodge's south face, and stepping back 1 m left that print
  anywhere 1.05–1.67 m from the face, depending on where the figure was within its
  step. The blurred drift settles lower further out. Four runs measured 1.117 m at
  1.08 m from the face, 1.091 m at 1.27 m, 1.037 m at 1.57 m and 1.025 m at 1.62 m.
  The route now steps back exactly one walking step (the parka's 0.6202 m), which
  lays exactly one print within about 1.3 m of the face whatever the phase.
- A deliberate mutation on a copy of the project, with the trees left out of the
  obstacle list (Deep zones and Roads intact), **FAILED, 1 failure**
  ([log](godot-snow-roads/headless-mutation-trees-not-solid.log)): "Wind did not
  drift snow over the south-west Road", the Road probe staying at 0.090 m. The
  Road's Snowdrift comes from the tree as an obstacle, not from the zones.

**After, on the sources committed as `09d5178`: PASS, 0 failures, 32,269
observations** ([log](godot-snow-roads/headless-route.log)). It renders nothing.
Selected lines:

> Deep cluster corridor, Shift held: fresh 1.060 m/s over 219 held observations -> packed 2.028 m/s
>
> Followed the south-west Road from (-20.00967, 15.01158), 0.02 m from its Town Square corner, to (-79.7, 75.03548): 255 observations walking and 1065 running, Snow Depth at most 0.092 m, held at the edge 7
>
> South-west Road probe at (-33.23547, 28.71936), 0.34 m from the corner tree's drift point: Snow Depth 0.092 m -> 0.592 m under the prevailing wind
>
> Lee drift 0.098 -> 1.125 m (first second +0.165, last second +0.002)
>
> Tracking probe compaction 0.846 -> 0.924 after following and overlapping

All 219 checked observations of the fresh Deep run were at walking speed on snow
at least 0.55 m deep; packing raised the corridor's running speed by 0.97 m/s. The
Road was Shallow from its corner to the edge, and running along it held 4.5 m/s in
all 1,065 running observations. The Road probe held 0.092 m until the wind blew and
then rose 0.50 m. The other wind, lamp, building, Facing, lean, framing, region
and overview checks read as in the #109 record. The open-snow Packed Path stage of
#106–#109 is gone: running held back in open snow is still checked, in the run west
out of the square and on the walking figure's loop, and packing is now shown in
Deep Snow, as in ADR 0027's town.

What the route does not cover:

- It follows one Road, the south-west, from its corner to the edge. The other
  three are checked only against the layout's definition (diagonal, from their own
  corners, ending on the edge) and seen in the captures (§3), not walked.
- It walks no tree; trees block only through the shared obstacle list and sweep
  that the buildings use, which the route checks at the lodge and small shed. The
  footprint check would catch a figure in any tree.
- Its Deep Snow is the south-west cluster's.

## 3. Captures

[`roads_capture.gd`](godot-snow-roads/roads_capture.gd) places the figure directly
(not through the route), with the HUD hidden, no lean, and falling and blowing snow,
gusts and lightning off. The Roads build's captures ran on the working tree before
the review fixes (§7), whose Roads, clusters, trees and Snow Depth are those of
`09d5178`; the baseline's ran on `f41d039` on 2026-10-20:

| Capture | Inspected |
| --- | --- |
| [roads-overview.png](godot-snow-roads/roads-overview.png) | The M overview of the 160 × 160 m map: the Camp at the centre and four clusters of dark tree boxes round it, each on a faintly raised pale rectangle of Deep Snow. The north-west and south-east Roads show as faint straight lines from the square's corners to the map's corners; the north-east and south-west Roads barely show. A Road is only 16 cm lower than open snow, its edges blended over 1.5 m, and SkyKey shades those edges only where it grazes them. |
| [roads-south-west-frame.png](godot-snow-roads/roads-south-west-frame.png) | A verification-only 95 m camera distance over the south-west quadrant: the south-west and west clusters' trees and their Deep Snow rectangles, the radio tower, crates, cabins, generator shed and lodge. The south-west Road, which runs from the square's corner past the cluster's corner, cannot be picked out. |
| [roads-road-default.png](godot-snow-roads/roads-road-default.png) | The default play view on the south-west Road, 6 m east of the cluster's corner tree, before any wind: the trees' boxes and shadows, the radio tower and crates to the north-east. The Road under the figure looks like the open snow round it. |
| [roads-road-drifted.png](godot-snow-roads/roads-road-drifted.png) | The same view after 300 wind-seconds of the north-west wind: Snowdrifts in each tree's lee, the corner tree's reaching south-east across the Road beside the figure, and drifts at the radio tower's and crates' feet. The script read 0.686 m of Snow Depth at the Road's drift point, from 0.093 m. |
| [roads-cluster-widest.png](godot-snow-roads/roads-cluster-widest.png) | The widest play view inside the south-west cluster, at the deep lane: the figure among tree boxes, the radio tower and crates beyond. The Deep Snow's edge shows as a soft step to the north-east. |
| [before-after-overview.png](godot-snow-roads/before-after-overview.png) | The same overview on the baseline (left) and the Roads build (right): the baseline's even open snow round the Camp, against the clusters and the faint Roads. |
| [before-after-road-drifted.png](godot-snow-roads/before-after-road-drifted.png) | The drifted view on the baseline (left), where the same 300 wind-seconds leave the open snow at the figure 0.250 m and unchanged, beside the Roads build (right), whose corner tree's Snowdrift crosses the Road. Pairs made by [`before_after.py`](godot-snow-roads/before_after.py) from `roads_capture.gd` run on each build. |

The captures show the clusters and the drift over the Road clearly, and the Roads
themselves only faintly: their Shallow Snow is the only thing that marks them, as
the issue asks ("with no ground geometry"). Whether they need something more to
read at play distance, such as banks, wear or markers, is the owner's call.

## 4. Graphical route from source

```sh
open -n -W -a /Applications/Godot.app --args --path "$PWD/godot" -- --snow-scene-check --auto-start
```

- **Run 1, on the sources committed as `09d5178` (2026-10-19 10:10): FAILED,
  stopped after 60 s without focus**
  ([log](godot-snow-roads/graphical-route-1-focus-lost.log)). It launched after the
  Mac had seen no input for 147 s, with the real pointer first moved off the
  window. It rendered the run west out of the square, the Deep lane, the walk and
  run along the south-west Road to the edge and back and both new probes, then
  reached the tracking stage. There another application took the front: the owner
  had returned to the Mac. From the walk along the Road onward, its record shows
  the camera leaning 2.4–5.5 m, which no stage asked for: the real pointer was over
  the window. The route checks run only at the end, so this run checked nothing.
- No complete source run exists. A second launch, on 2026-10-20, exited at once:
  Godot.app had moved from `~/Downloads` to `/Applications` between the two days.
  A third waited for the screen to unlock, which had not happened when this record
  was written.

These are engine-event replay in a rendered window, not ordinary OS input.

## 5. Mac release package

`GODOT_BIN=~/Downloads/Godot.app ./godot/export.sh macos` exported the package
from the clean commit `09d5178`
([build record](godot-snow-roads/macos-build-info.json),
`godot_source_dirty: false`). It was launched through Launch Services on
2026-10-20 20:53, after 49 s without input, with the owner away and no input posted:

```sh
open -n -W -a "$PWD/godot/build/macos/release/PU-Town-Snow-Walk.app" --args -- --snow-scene-check --auto-start
```

**PASSED, 0 failures, 32,413 observations, never paused**
([log](godot-snow-roads/packaged-route-1.log)).

- Deep lane 1.060 → 2.028 m/s.
- The Road followed from 0.02 m off its corner to the edge, at most 0.092 m of
  snow, 1,065 running observations at full speed.
- The Road probe rose from 0.092 to 0.592 m.
- Lodge-lee drift reached 1.125 m.
- Tracking compaction went from 0.846 to 0.924.
- The other values match the headless run.
- Its record shows lean only in the stages that ask for it, the same as the
  headless replay, so no real pointer reached it.

[packaged-route-road-edge.png](godot-snow-roads/packaged-route-road-edge.png) is its
F9 capture at the Road's end:
- The figure is held at the west edge, at the HUD's right side; the HUD reads Feet
  X −79.70, Z 75.04 and 0.090 m of snow.
- Its run's bootprints lead back north-east into the whiteout.
- No wall shows.

## 6. Frame time

**Release F6 trace: not run.** The trace needs ordinary macOS keyboard events
posted to the package
([`run_benchmark.sh`](godot-snow-roads/run_benchmark.sh) with
[`osinput_guarded.swift`](godot-snow-roads/osinput_guarded.swift), as in #108 and
#109). In this session Claude Code's auto-mode classifier blocked the helper that
posts such events, after it had moved the pointer once before run 1. Two input
scripts are ready, each for both packages:
- [the #109 Camp path](godot-snow-roads/benchmark-input-script-camp.txt);
- [a path onto the south-west Road and along it past the cluster](godot-snow-roads/benchmark-input-script-road.txt).

Until the owner runs them, this slice has no release frame-time evidence beyond the
packaged route's counter below.

**Source frame timing.** [`frame_timing_road.gd`](godot-snow-roads/frame_timing_road.gd)
times 900 frames in source, with vsync off, the HUD hidden and the play distance
set. It works alongside #106's timing script, by the same method. The figure walks
back and forth:
- along the south-west Road, 10 m from its corner, beside the cluster ("Road");
- or east and west across the Town Square from (−4, 4), facing the lodge's lit
  south face ("Camp").

The builds were interleaved: "Roads" is `09d5178`; "baseline" is `f41d039`, from a
separate checkout. All twelve runs ran on 2026-10-20 between 21:23 and 21:32 with
the screen locked and the owner away ([log](godot-snow-roads/source-frame-timing.log)). A first Camp path started at #106's (30, 0),
which is now the small shed's face, so the figure never moved in either build; it
was discarded, with the one Road run of that attempt (Roads, 31.0 fps).

| Round | Build | Road: mean (FPS) · p95 | Camp: mean (FPS) · p95 | Wind per update (Road, Camp) |
| --- | --- | --- | --- | --- |
| 1 | Roads | 33.24 ms (30.1) · 35.33 ms | 37.56 ms (26.6) · 42.13 ms | 2.76, 2.76 ms |
| 1 | baseline | 34.09 ms (29.3) · 37.54 ms | 37.54 ms (26.6) · 41.95 ms | 2.86, 2.85 ms |
| 2 | Roads | 32.85 ms (30.4) · 35.44 ms | 36.40 ms (27.5) · 41.02 ms | 2.72, 2.64 ms |
| 2 | baseline | 34.19 ms (29.2) · 37.57 ms | 37.60 ms (26.6) · 42.08 ms | 2.97, 2.87 ms |
| 3 | Roads | 33.47 ms (29.9) · 35.71 ms | 37.66 ms (26.6) · 41.77 ms | 2.77, 2.78 ms |
| 3 | baseline | 34.29 ms (29.2) · 38.00 ms | 37.25 ms (26.8) · 41.70 ms | 2.99, 2.81 ms |

- Along the Road, the Roads build was 0.8–1.3 ms a frame faster than the baseline
  over the same path. There its tree boxes stand in the view where the baseline
  draws open snow. In the Camp the two builds were within 1.2 ms of each other,
  with no consistent order.
- The wind cost the same in both builds, within the run-to-run spread (2.6–3.0 ms
  per physics update). The trees add 29 obstacles, but the wind's work scales with
  the Snow Depth picture, not the obstacle count.
- Worst frames were 56–70 ms in every run.
- This is source engine timing on one machine, not the release package and not a
  platform baseline.

**The release package's own counter.** The packaged route records Godot's
frames-per-second counter, a one-second average, with every observation. While the
figure moved in the play view it read a median 35 fps:
- 33 fps in the Town Square;
- 35 fps on the south-west Road;
- 5th percentile 30 fps.

Its dips last about a second each and follow the route's own pauses to read its
whole CSV at a navigation step. They are not rendering. This is not a frame-time
trace.

## 7. Code review

The `/code-review` skill reviewed the working tree against `f41d039` on two axes,
in parallel sub-agents.

- **Standards:**
  - AGENTS.md and the README cited this record before it existed. The citations
    were held back until it did.
  - The route rebuilt the obstacle list. The layout now exposes it once, as
    `solid_boxes()`.
  - "Beside the Roads" overstated the west cluster's place, and `west_lane` was
    called east of a cluster it lies north of. Both are corrected.
  - ADR 0028 now notes the interim straight Roads.
  - Smaller items changed: the distance-to-a-Road computation is shared
    (`_off_line`); `_mean_speed`'s `Vector2(mean, count)` became `_corridor_speed`
    returning named fields; `_building_gap` became `_box_gap`, since it measures
    trees too; the predicate no longer fills a member as a side effect.
  - Kept: `_check_roads` reads the layout directly, as `_check_lamps` does. The
    probe slots renumber because a probe's identity is the order F5 placed it.
    The per-kind material stays with the 29 boxes it was added for.
- **Spec:**
  - Only one Road was observed in the scene, and its run started 17 m out. The run
    now starts at the square's corner, with the trail laid on the Road. The other
    three Roads remain checked only against the layout and in the captures (§2).
  - The Road's landmarks repeated its line and the tree's lee. Both are now worked
    out from the layout.
  - The packed lane only had to beat the fresh one by 0.10 m/s. It now must by
    0.5 m/s.
  - Solid, sheltering trees and the corner tree placed for the drift are flagged
    for the owner's sign-off: #116's "Replace the placeholder tree-cluster boxes
    with pine instances … Each pine blocks … and shelters snow … like a box"
    reads as boxes that already do so.
  - The removal of the open-snow packing check is noted in §2.

## 8. Not done

- The 60-second release F6 trace with ordinary macOS input (§6), and with it the
  24 fps walking check on the release package for this slice.
- A complete graphical route in source (§4). The release package's route passed
  in full.
- Walking any Road but the south-west one (§2), and any tree.
- A visual cue for the Roads beyond their Shallow Snow (§3).
- Windows runtime is untested.
