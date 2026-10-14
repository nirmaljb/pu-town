# Woodland performance and square verification

This slice starts from generated-town commit
`f754d9584ca042b399e7687bfa4ba49d24c9e141`, on
`codex/woodland-performance-polish`. The owner rejected the earlier uncommitted
campus attempt; its source edits, test artifacts and asset restorations were
discarded before starting this work. Woodland Village's Meeting Area and west
approach replace the retired campus as the visual review area. See the
[accepted specification](../specs/woodland-performance-polish.md).

Canonical layouts, footprints, Seats, movement constants, solid non-enterable
buildings, disabled Tasks and recipient privacy are unchanged. The current
Quaternius meshes/textures and KayKit publication remain the asset sources.
Continuous paving, earth shoulders, the west square connection and planting are
presentation only.

## Automated and build evidence

Tests at the agreed native seams failed before their implementations and passed
afterwards:

- `LocalPrediction.Update`: a 250 ms stall preserves the expected 56.25 units of
  walking, using collision-checked steps of at most 20 ms. Longer suspension
  remains bounded to 250 ms. A blocked Avatar stops its walking state. Existing
  authoritative correction, Night and recovery tests remain in the suite.
- Generated prefabs: each saved road is one connected mesh covering its bends;
  the square is one mesh covering every retained Seat. Paving adds no Colliders.
  Both Woodland and Market cases passed.
- Benchmark report: a synthetic 500 ms monotonic interval remains visible when
  Unity reports a 100 ms interval. Focus attribution and empty summaries passed.

Final native EditMode suite: **47 passed, zero failed or skipped**, Unity
6000.6.0f1. The freshly built Java package passed its full suite: 158 discovered,
157 passed, zero failures/errors, one intentional opt-in authored-publication
skip. Nine town publication tests passed. `tools/towns/publish.py --check` verified
byte-identical rules, solid alignment and route reachability; the native texture
restore check passed with zero active large-texture restores.

macOS release, Windows release and macOS development profile builds all completed
successfully with no reported editor errors. Builds/tests used isolated project
copies and the current checkout as `PU_TOWN_REPOSITORY`. Release outputs exclude
the editor-only authoring/control assembly. Windows compilation is **not** Windows
hardware/runtime acceptance.

## Visual evidence

Actual Unity camera renders were regenerated and inspected for the Meeting Area,
square, overview and road approach on both maps. Woodland's west connection is
open, stone scale is consistent, and flowers/bench sit at the square's edges.
The packaged Woodland square and facade approach were also inspected during Day
and Night. See [square render](../../towns/woodland/previews/unity-meeting-square.png)
and [overview](../../towns/woodland/previews/unity-overview.png).

| Generated town cost | Before | After |
| --- | ---: | ---: |
| Woodland MeshRenderers | 541 | 469 |
| Woodland triangles | 444,451 | 449,297 |
| Woodland materials | 24 | 25 |
| Market MeshRenderers | 597 | 514 |
| Market triangles | 215,471 | 215,239 |
| Market materials | 23 | 24 |

Renderer reduction follows replacement of repeated slabs/tiles with continuous
meshes. Woodland edge planting adds triangles. These counts do not establish
runtime draw calls or an FPS improvement.

## Packaged runtime evidence

The new Java JAR ran on loopback port 19085, with `/health` returning healthy and
the locally retained five-design native publication. A direct native handshake
created a ten-Player Developer Room: one controller, two packaged native Players
and seven idle simulations for the functional checks. Developer automatic phase
advancement and faction victory were disabled for reproducibility; ordinary Room
rules were not changed.

Keyboard walking moved the first Avatar about 315 canonical units across the
square during a 1.5-second held key, with camera-relative movement. Walking toward
Workshop 1 stopped at accepted x=2506.1, outside its feet-expanded left boundary
x=2508.28; sliding beside the facade remained possible. Night input left the
accepted position unchanged. Terminating and restarting the same independent
profile within the recovery window restored the same Player and position while
the second packaged client remained connected. These are actual packaged paths,
separate from EditMode tests. Complete Role/media/map-switch journeys were not
repeated for this slice.

Temporary QA packages used distinct bundle identifiers solely to select their
windows reliably alongside the owner's existing app. Product source retains its
existing identifier. The owner's app/server were left running. No microphone or
voice load was enabled.

## Performance observations

Machine: MacBookAir10,1, Apple M1 CPU/GPU, eight logical processors, 8 GiB reported
system memory, macOS 26.2, Metal, Unity 6000.6.0f1. Resolution 1280×800 windowed,
Balanced preset, hard/low shadows, 20-unit shadow distance, 2× antialiasing,
vSync=1 and target 60 FPS. No Unity Editor or Maven build was running during the
captures. The owner's existing native app remained in the background; the local
Java process, controller connections and Codex remained active.

The [new release capture](2026-10-14-woodland-candidate-performance.json) recorded
3,582 frames over 60.014 seconds, all focused, in Day with ten memberships and
ten Roster entries (controller, one packaged Player, eight idle simulations):
**59.686 wall-clock FPS**, p50 16.674 ms, p95 17.657 ms, p99 18.850 ms, maximum
63.900 ms and zero intervals over 100 ms. The observation was stationary in the
square; it does not establish sustained walking, voice-load or cross-platform
performance. Release allocation/draw counters were unavailable.

The [unchanged starting-commit capture](2026-10-14-woodland-baseline-clean-performance.json)
used the same resolution/preset and ten-entry Day workload but mixed foreground
and background samples (1,263 focused, 716 unfocused). Its 32.981 samples per
elapsed second therefore **cannot establish a comparable FPS gain**. Native
window selection was intermittently slow during the session. An earlier capture
overlapped tooling and is excluded from this record.

The separate [development profile](2026-10-14-woodland-profile-performance.json)
recorded 3,500 frames over 60.009 seconds in the same stationary ten-entry Day,
with 345 focused and 3,155 unfocused intervals. Overall wall-clock FPS was 58.325,
p99 20.828 ms, with two intervals over 100 ms. It is diagnostic evidence, not a
release acceptance comparison. Available scopes averaged:

| Scope | Mean milliseconds |
| --- | ---: |
| ApplyFrame | 0.0031 |
| Movement | 0.0099 |
| Avatars | 0.1378 |
| Interface | 0.1759 |
| Occlusion | 0.3152 |

GC allocation samples averaged 15,263 bytes/frame, maximum 253,853 bytes; they
include observer and engine work. The draw-call recorder registered as available
but returned only zero despite visible rendering, so **draw-call counts are
inconclusive on this setup**. Main Thread includes engine waits and frame pacing;
its roughly 17 ms mean is not GPU or active script execution time. Raw reports
retain these limitations, configuration/focus observations and counter ranges.

Short-stall movement, cached collision geometry, reduced overlay serialization
and renderer counts are implemented and tested. A controlled before/after gain,
Windows runtime, ten-Player authorized media load, and broader character/tree/
building polish remain unresolved. M-key map and perimeter-wall work are later
slices, as specified.

Independent [Standards and Spec reviews](2026-10-14-woodland-review.md) found no
blocking issues. The staged upload-size guard and whitespace check passed before
commit; generated meshes, prefabs and desktop packages stay local.
