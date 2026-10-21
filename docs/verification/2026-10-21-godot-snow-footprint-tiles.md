# Snow walk Footprint tiles — 2026-10-21

Verification of issue #111, a slice of #104 (Frostwatch Outpost): the single
whole-map Footprint picture becomes world-anchored tiles at the same 31.25 mm,
created where a step lands and freed once wind has filled every print in them, with
a GPU copy that stays tile-updated. Only the Godot preview changed; Java, browser
and Unity code are untouched. Retained files are in
[`godot-snow-footprint-tiles/`](godot-snow-footprint-tiles/).

Engine: Godot `4.7.2.stable.official.ed1daf0bf`, Compatibility renderer, on the
Apple M1 MacBook Air (8 GB) under macOS 26.2, 2560 × 1440 window. "Before" is
`66220a2` (the Roads, #110), the commit this work started from; "after" is
`2ce9371`. The baseline ran from a separate detached checkout of `66220a2`. The
work ran overnight from 2026-10-20 to 2026-10-21, with the screen locked and the
owner away for all of it.

## Changes

- [`footprint_tiles.gd`](../../godot/footprint_tiles.gd), new, holds the Footprint
  picture only where steps have landed:
  - Tiles of 256 × 128 texels (8 × 4 m, 131,072 bytes) in rows from the map's
    north-west corner. A tile is created blank when a step first presses it.
  - Each footstep notes, for every tile it pressed, the Snow Depth nodes within
    0.4 m of the footfall (whose fill clocks its texels' heights and its shading
    read) and the latest of their fill clocks. A tile is freed once every noted
    clock has run the 120 fill-second print lifetime past that latest value. Every
    texel's stamp is at most that value and clocks only grow, so by then neither
    heights nor shading show any of its prints.
  - After each wind sweep the tiles are checked, four per physics frame, against
    clocks published in an earlier physics frame, so the record always shows a
    print at zero before its tile goes.
  - The GPU copy is a texture array with a layer per tile and a tile-to-layer
    picture (RF, one texel per tile of the map) that the shader reads it through. It
    starts with 8 layers, doubles when a new tile finds no spare layer and halves
    when a quarter or fewer of its layers are in use. Each time it packs the
    allocated tiles into the lowest layers and sends every layer once. It never
    grows past the map's 800 tiles. Footsteps still resend only the tiles they
    touched.
- [`snow_surface.gd`](../../godot/snow_surface.gd) keeps the soles' shape, the
  fill-clock stamps and their ageing, now reading and writing texels through the
  tiles, and works out which nodes each footstep awaits.
- [`snow.gdshader`](../../godot/snow.gdshader) reads each texel through the
  tile-to-layer picture, and reads the Footprint picture in 2 × 2 blocks: the four
  texels a bilinear read uses nearly always share a tile, so it looks the layer up
  once and reads nothing more where no tile is allocated. Texel positions now come
  from `footprint_texels_per_metre` (32) rather than the picture's size.
- [`inspection.gd`](../../godot/inspection.gd), the observation record, replaces
  `footprint_image_width`, `footprint_image_height` and `footprint_image_bytes` with
  `footprint_tiles`, `footprint_bytes`, `footprint_tiles_created`,
  `footprint_tiles_freed`, `footprint_gpu_layers`, `footprint_gpu_bytes` and
  `footprint_gpu_rebuild_bytes`. Every probe gains `in_tile`: whether an allocated
  tile holds any texel its compaction is read from. There are eight probe slots.
- [`inspection_route.gd`](../../godot/inspection_route.gd), the scene route:
  - At the map's edge, after the run along the south-west Road, it fixes a new
    probe (slot 2) on the trail's last print, in open snow no one else walks; the
    later probes move up a slot.
  - The fresh trail must have created tiles, and tiles must hold the trail's first
    print and its print at the edge.
  - Every observation checks that no tile exists before the first step, that the
    tiles allocated are the tiles created less those freed, that the GPU copy has a
    layer for each, and that it changes size only by resending every layer once.
  - Under the 16× wind, the last observation that still finds the edge print in a
    tile must read zero compaction there; by the end of the drift stage that tile
    must be gone, and the GPU copy must have shrunk with the tiles the wind freed.
  - The record must have the tile columns: a check that reads a missing column stops
    with a script error that fails nothing, so the route now requires them first.
  - The whole-picture size check is gone, and so is the half of an upload check that
    compared one frame's upload with the picture's size.
- [`godot/README.md`](../../godot/README.md), [`AGENTS.md`](../../AGENTS.md) and an
  amendment to ADR 0028 describe the tiles, their freeing, the GPU copy and the
  record's columns.

## 1. Import check

`GODOT_BIN=/Applications/Godot.app ./godot/run.sh --check` completed without
errors in this worktree before the work and again after `footprint_tiles.gd` was
added, and once more as part of `./godot/export.sh macos` on `2ce9371`. It
exercises no movement or rendering.

## 2. Headless engine-event replay

```sh
"$GODOT_BIN" --headless --path godot --fixed-fps 60 -- \
  --snow-scene-check --headless-scene-check --auto-start
```

**Before**, test-first, one check at a time:

1. The tile columns and their checks, against the whole-map picture's code:
   **FAILED, 7 failures**, one for each missing column
   ([log](godot-snow-footprint-tiles/headless-before-1-tile-columns.log)). A first
   attempt without the column guard printed PASS despite a script error on every
   observation, which is why the guard exists. Every other value in that log is the
   baseline's own.
2. The edge probe and each probe's tile reading, against tiles that existed but had
   no such reading: **FAILED, 2 failures**
   ([log](godot-snow-footprint-tiles/headless-before-2-probe-tiles.log)).
3. Freeing, against tiles that were never freed: **FAILED, 1 failure**, "Wind filled
   the trail at the map's edge but its Footprint tile was not freed"
   ([log](godot-snow-footprint-tiles/headless-before-3-freeing.log)).
4. After the code review (§7), the GPU copy shrinking, against a copy that only
   grew: **FAILED, 1 failure**, "The Footprint picture's GPU copy did not shrink as
   the wind freed its tiles"
   ([log](godot-snow-footprint-tiles/headless-before-4-gpu-shrink.log)).

**After, on the sources committed as `2ce9371`: PASS, 0 failures, 32,269
observations** ([log](godot-snow-footprint-tiles/headless-route.log)). It renders
nothing. The new lines:

> Footprint uploads: 472383488 bytes for 3455 footsteps (136725 per step; touched-tile bound 524288 per step)
>
> The fresh trail along the south-west Road created 21 Footprint tiles; its probe at the map's edge (-79.76125, 74.61476) compaction 0.318, held in a tile
>
> The edge print's tile was freed 121.9 wind-seconds into the wind, after reading 0.0000 compaction; the wind freed 61 tiles, 16 remain; the GPU copy went from 128 layers to 32
>
> Footprint tiles: at most 76 (9961472 bytes) at 57.5 s; 92 created and 75 freed; GPU copy 32 layers (4194304 bytes, 44040192 resent resizing it); a whole-map picture took 104857600 bytes

**Existing assertions, unchanged.** Every line the baseline printed, the trail,
tracking-overlap, fill, drift, scour, Road, Deep lane, Facing, lean, framing,
region and upload results among them, reads exactly the same after: the logs differ
only in the new lines, the probes' slot numbers and the real-time seconds at which
the tracked trail was laid (2.5–2.7 s). The upload total, 472,383,488 bytes for
3,455 footsteps, is the same, so the same tiles were sent for the same steps. The
edge print was pressed at the end of the run while the wind was still. Its tile was
freed 121.9 wind-seconds into the 16× wind, against the 120 wind-seconds an open
print takes to fill.

What the route does not cover:

- It observes one tile created and freed by name, the edge print's, and the rest
  only as counts. The counts include the walking figure's tiles round its loop.
- It frees tiles only under the prevailing wind in the open and in the Camp. It
  never restarts the fill clocks, which free every tile at once (after about four
  days of default wind).
- It never reaches the GPU copy's cap; §6 does, outside the route.

## 3. Captures: prints before and after

[`footprint_capture.gd`](godot-snow-footprint-tiles/footprint_capture.gd) presses
the same prints directly in each build (not through the route): two walking trails
crossing at (−40, −4), a tile corner, the second over the first, and one walking
along the tile edge x = −40, so its soles straddle two tiles. It captures them with
the HUD hidden, no lean, and falling and blowing snow, gusts and lightning off:
fresh at the closest and default play distances, after 60 wind-seconds of the
north-west wind, and after 130. [`compare_captures.py`](godot-snow-footprint-tiles/compare_captures.py)
counts the pixels that differ between the builds' 2560 × 1440 captures
([before log](godot-snow-footprint-tiles/capture-before.log),
[after log](godot-snow-footprint-tiles/capture-after.log)):

| View | Pixels that differ | Largest difference | CPU compaction at a print on the tile edge |
| --- | --- | --- | --- |
| Fresh, closest ([sheet](godot-snow-footprint-tiles/before-after-fresh-closest.png)) | 15 of 3,686,400 | 1 of 255 | 0.318 in both |
| Fresh, default | 6 | 1 | 0.318 |
| Half filled, 60 wind-seconds ([sheet](godot-snow-footprint-tiles/before-after-half-filled.png)) | 6 | 1 | 0.159 |
| Filled, 130 wind-seconds ([sheet](godot-snow-footprint-tiles/before-after-filled.png)) | 1 | 1 | 0.000; 1 tile left (of 9), on the walking figure's loop |

The prints look the same in both builds, across the tile edges and where trails
overlap, and fill the same. The few single-level differences are rounding; the
shader now places texels per metre rather than as a share of the picture's size
(not traced further). An earlier filled capture
differed in 1,438 pixels, by up to 58 levels, at the generator shed's foot. That
capture had stopped at 131 wind-seconds instead of 130, and the drift there was
still settling; at the same wind-second the views match, as above.

## 4. Graphical route from source

**Not run.** The route needs a focused window, and windows cannot take focus while
the screen is locked. It stayed locked from before this work began until the owner
returned and asked for the push, at 06:50 on 2026-10-21. A background script waited
from 01:01 for an unlocked screen and a minute without input; it posted no input and
had launched nothing when it was stopped for the push. The shader therefore has graphical
evidence only from the captures (§3) and the SceneTree timing and memory scripts
(§6). They compiled it and drew prints across tile edges with no shader errors.

## 5. Mac release package

`GODOT_BIN=/Applications/Godot.app ./godot/export.sh macos` exported the package
from the clean commit `2ce9371`
([build record](godot-snow-footprint-tiles/macos-build-info.json),
`godot_source_dirty: false`). **Its route was not run**, for the same reason as
§4. This slice has no packaged-route evidence.

## 6. Memory and frame time

**Memory.** On the interim map the whole-map picture was 104,857,600 bytes (100 MiB)
on the CPU, and as much again as a GPU texture array, whatever the number of steps.
In the route, the tiles peak at 76, 9,961,472 bytes (9.5 MiB), and the GPU copy at
128 layers (16 MiB). After the drift stage 17 tiles and 32 layers (4 MiB) remain.

The engine's own monitors, read by
[`memory_probe.gd`](godot-snow-footprint-tiles/memory_probe.gd) once the scene
settles and again after the controlled figure walks 60 s down the south-west Road
from its corner, a fresh trail, interleaved with the baseline (two runs each, the
same to 0.1 MiB, [log](godot-snow-footprint-tiles/memory-probe.log)):

| Build | Moment | Static memory (CPU) | Texture memory (renderer) | Tiles, GPU layers |
| --- | --- | --- | --- | --- |
| before | settled | 147.3 MiB | 162.5 MiB | whole-map picture |
| before | after the walk | 147.3 MiB | 162.5 MiB | whole-map picture |
| after | settled | 47.9 MiB | 63.5 MiB | 6 tiles, 8 layers |
| after | after the walk | 51.8 MiB | 70.5 MiB | 36 tiles, 64 layers |

These are Godot's `MEMORY_STATIC` and `RENDER_TEXTURE_MEM_USED` monitors in source,
in a window, not an operating-system measurement of the process.

**What resizing the GPU copy costs.** [`rebuild_timing.gd`](godot-snow-footprint-tiles/rebuild_timing.gd)
presses one print a frame in each of the map's 800 tiles, so the copy doubles to
its cap, then blows the wind until the tiles are freed and it halves again. Vsync
was off and the HUD hidden. For each frame in which the copy changed size it
prints that frame beside the median of the 30 before it
([log](godot-snow-footprint-tiles/rebuild-timing.log), final code):

| Change | Frame | Median before |
| --- | --- | --- |
| 8 → 16 layers | 74.6 ms (35.1 ms in an earlier run) | 25.4 ms |
| 16 → 32 | 28.2 ms | 24.7 ms |
| 32 → 64 | 30.9 ms | 25.4 ms |
| 64 → 128 | 36.8 ms | 26.4 ms |
| 128 → 256 | 46.2 ms | 25.8 ms |
| 256 → 512 | 60.4 ms | 25.7 ms |
| 512 → 800 | 81.0 ms | 26.9 ms |
| 800 → 400 | 50.9 ms | 29.0 ms |
| 400 → 200 | 42.4 ms | 27.9 ms |
| 200 → 100 … 25 → 12 | 30.4–31.6 ms | 29.0–29.3 ms |

A resize costs one frame, roughly 0.07 ms per layer sent: about +10 ms at 128 layers
and +54 ms at the 800-layer cap. It happens only when the tiles in use double or
fall to a quarter. The first growth's 74.6 ms is one sample; the same step cost
35.1 ms in the earlier run.

**Source frame timing.** [`frame_timing_road.gd`](godot-snow-roads/frame_timing_road.gd),
#110's script, times 900 frames in source with vsync off, the HUD hidden and the
play distance set, while the figure walks back and forth across the Town Square
from (−4, 4) ("Camp", where both figures' prints and so the tiles are densest) or
along the south-west Road ("Road"). The builds were interleaved, two rounds, from
00:46 to 00:51 ([log](godot-snow-footprint-tiles/source-frame-timing.log)):

| Round | Build | Camp: mean (FPS) · p95 | Road: mean (FPS) · p95 | Wind per update (Camp, Road) |
| --- | --- | --- | --- | --- |
| 1 | before | 36.56 ms (27.4) · 41.40 ms | 33.43 ms (29.9) · 35.28 ms | 2.58, 2.91 ms |
| 1 | after | 30.36 ms (32.9) · 32.75 ms | 26.09 ms (38.3) · 29.97 ms | 2.61, 2.70 ms |
| 2 | before | 38.19 ms (26.2) · 42.43 ms | 33.56 ms (29.8) · 36.20 ms | 2.88, 2.85 ms |
| 2 | after | 30.66 ms (32.6) · 33.06 ms | 26.11 ms (38.3) · 29.53 ms | 2.71, 2.69 ms |

- The tiled build drew 6–8 ms a frame faster on both paths. The likely reason, not
  profiled: the baseline fetched four texels of its array, each with its own bounds
  checks, for every bilinear read of the Footprint picture, in every snow vertex's
  height and several times in every fragment, while the 2 × 2 read looks a block's
  layer up once and, over snow with no tile, fetches nothing more.
- The first tiled shader, which looked a layer up for every texel, was slower than
  the baseline, by 0.1–1.0 ms on the Road (six pairs) and 1.6–1.8 ms in the Camp (two)
  ([log](godot-snow-footprint-tiles/source-frame-timing-first-shader.log)). That
  prompted the 2 × 2 read.
- The wind costs the same in both builds, freeing checks included (2.6–2.9 ms per
  physics update).
- On the CPU, `sample_compaction` takes 3.1 µs instead of 2.5 µs, now that each
  texel is read through `footprint_tiles.gd`. That was measured by a scratch
  benchmark, not retained, with identical sums in both builds. The scene makes about
  170 such calls per rendered frame, about 0.1 ms.
- This is source engine timing on one machine, not the release package and not a
  platform baseline.

**Release F6 trace: not run.** It needs ordinary macOS keyboard events posted to the
package ([`run_benchmark.sh`](godot-snow-roads/run_benchmark.sh) with
[`osinput_guarded.swift`](godot-snow-roads/osinput_guarded.swift) and the #110
input scripts). In #110 Claude Code's auto-mode classifier blocked the helper that
posts them, and this session did not try to work round that. Until the owner runs
it, this slice has no release frame-time trace.

## 7. Code review

The `/code-review` skill reviewed the working tree against `66220a2` on two axes,
in parallel sub-agents. Their findings were acted on before `2ce9371`; the route
was rerun after (§2), as were the captures (§3) and the timing and memory runs (§6).

- **Standards:**
  - The README and AGENTS.md quoted route numbers before this record existed. The
    record lands in the same push.
  - The tile store, about 16 fields and 6 functions inside the snow surface's mesh
    script, moved into its own [`footprint_tiles.gd`](../../godot/footprint_tiles.gd),
    as the wind was split out before.
  - Names: the two tile/layer arrays and the layer image became `_layer_of_tile`,
    the layers packed on each resize, and `_layer_picture`; the probe column `tile`
    became `in_tile`, after `in_region`; `gpu_growth_bytes` became
    `footprint_gpu_rebuild_bytes`. The record's byte counts now come from the store
    rather than being multiplied out in the observer, and the route reads the probe
    column through one helper (`_probe_in_tile`).
  - A step pressed before the ground was configured awaited no fill clocks, so its
    tile would have been freed at once. It now awaits a clock of zero, and nothing is
    checked until clocks are published.
  - "Where people have walked" became "where the figures have walked", in the
    prototype's terms.
  - Kept as they were: the column guard, which is how a missing column now fails the
    route; the CPU's tile-to-layer array beside the shader's picture of the same
    layers, kept in step in one function; and `compare_captures.py`'s side-by-side
    sheet, which repeats #110's `before_after.py` so this record stands alone.
- **Spec:**
  - The GPU copy only ever grew, so GPU memory did not follow where the figures
    walked ("Footprint storage freed once wind has filled it", #104 story 33). It
    now halves once three quarters of its layers are spare, and never grows past the
    map's tile count.
  - What a resize costs was unmeasured. §6 measures it.
  - Freeing waited for each node's own clock to run a lifetime past its value at the
    press. The shader shades a texel's neighbourhood with the fill clock where it is
    drawn, not the texel's own, so where the fill rate differs within 20 cm a faint
    outline of a print that heights show filled could still be shaded, and freeing
    would remove it at once. Freeing now waits for every clock to run a lifetime
    past the latest of them at the press, which leaves nothing for either to show.
  - The route could not tell a tile freed one wind sweep early from one freed after
    its print filled: it only bounded how fast the edge print's compaction fell.
    Tiles are now checked against clocks published in an earlier physics frame, and
    the route requires the last observation in a tile to read zero.
  - Two checks could not fail by construction: a probe reading compaction outside
    every tile (it reads the same texels the tiles hold), and bytes equal to tiles
    times a tile's bytes (the observer computes it so). Both were removed.

## Not done

- The graphical route in source and the Mac release package's route (§4, §5): the
  screen stayed locked until the push.
- The release F6 trace (§6).
- Windows runtime, as before.
- The route names one created and freed tile, the edge print's; the rest it sees
  only as counts. It does not restart the fill clocks, which free every tile at once.
- On the full 500 × 550 m map (#115) the cap on the GPU copy, the map's own tile
  count (8,694), would exceed the array-layer limit of this Mac's OpenGL, commonly
  2,048. Tiles in use stay far below that while the wind blows, but at wind 0
  nothing is freed. #115 needs a cap at that limit and a decision on what happens
  beyond it.
