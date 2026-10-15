# Godot snow appearance and desktop verification — 2026-10-15

Scope: [issue #92](https://github.com/nirmaljb/pu-town/issues/92) and
[issue #93](https://github.com/nirmaljb/pu-town/issues/93), following the standalone
ground slice in [#91](https://github.com/nirmaljb/pu-town/issues/91) and the retained
reference kit in [#90](https://github.com/nirmaljb/pu-town/issues/90). Baseline:
`8c011432cbecd774e673ac26a8ce732816185bf5`, on
`codex/native-campus-migration`. The behavioral seam remains the running graphical
scene, keyboard/wheel input and its exported observations, as agreed in parent
[#89](https://github.com/nirmaljb/pu-town/issues/89).

## Environment

Actual inspection hardware: MacBook Air `MacBookAir10,1`, Apple M1 with 8 GB
unified memory and a seven-core GPU; macOS 26.2, build `25C56`. Godot standard
GDScript `4.7.2.stable.official.ed1daf0bf`, Compatibility (`gl_compatibility`),
OpenGL 4.1 Metal, driver 90.5. The scene's measurement target is a 1280 × 800
viewport and window, with 2× MSAA. The macOS export disables Retina scaling to
retain that target. Java and LiveKit are unnecessary for this standalone scene.

Import and script validation, actual window input, engine-event route replay,
rendered captures, release exports and hardware frame measurements are distinct
checks. A successful export or editor import alone does not establish that a
packaged application runs correctly.

## Appearance and retained reference

The original [reference PNG](../art/snow-reference/reference.png),
[complete 72,078-colour histogram](../art/snow-reference/all-colors.csv.gz),
[summary palette](../art/snow-reference/palette.json),
[labelled swatches](../art/snow-reference/palette.svg) and
[hash manifest](../art/snow-reference/manifest.json) remain unchanged. The complete
kit, rather than only its summary representatives, remains available for visual
comparison. These are authoring references outside the Godot project; neither the
source image nor a reference texture is shipped in the runtime. The
[reference-kit verification](2026-10-15-snow-reference-kit.md) records its
reproducibility and provenance limits separately.

The actual [source exploration capture](godot-snow-desktop/source-exploration.png)
and [source overview capture](godot-snow-desktop/source-overview.png) were viewed
at 1280 × 800 against that retained reference. The final scene uses muted, cool
snow and a grey-blue atmosphere. An earlier appearance was too cyan; the final
material and illumination were adjusted after inspecting the rendered output.
The image contains finished lighting and shadows, so its sampled RGB values are
not treated as direct snow albedo measurements. Appearance comparison is a visual
judgment rather than a claim of identical source-image pixels.

The checked-in sources reproduce the inspected settings:

| Setting | Final source value |
| --- | --- |
| Snow albedo base | `(0.64, 0.64, 0.645)`, with low-contrast world-space drift and grain |
| Surface response | Roughness 0.98; specular 0.08; Burley diffuse |
| Fine grain | 7 samples/m; smoothly fades with projected pixel width from 0.04 to 0.16 m |
| Background | `#828792` |
| Ambient illumination | `#c0c4ce`, energy 0.70 |
| Directional illumination | `#dedee4`, energy 0.25; rotation −52° / −35° |
| Shadows | Enabled; opacity 0.75; blur 4.0; maximum distance 160 m |
| Tone mapping | Linear |
| Camera | Orthographic; −55° pitch / 45° yaw; exploration size 18 m; overview 118 m |

The material is in [`snow.gdshader`](../../godot/snow.gdshader), illumination and
camera in [`snow_walk.gd`](../../godot/snow_walk.gd), and deterministic geometry in
[`snow_surface.gd`](../../godot/snow_surface.gd). Warped, weighted oblique harmonics
provide smaller, distributed relief alongside the figure while retaining the
0.10–0.25 m interior range, continuous raised perimeter and one matching render /
collision surface. There is no reserved central plateau. This work does not add
town content or replace the temporary 1.70 m inspection figure.

## Source scene route

The source scene completed the existing graphical route with
`SCENE WALK: PASS · 0 failures`. Its keyboard/wheel replay uses
`Input.parse_input_event` and reads only the public F8 CSV. It does not inspect
private scene nodes, procedural samples or mesh ordering. The route now resides
in [`inspection_route.gd`](../../godot/inspection_route.gd), shared by the source
test launcher and the package's opt-in `--walk-scene-check` entry. F7 remains the
manual start gate. Normal scene launches do not start the route or quit on their
own.

The retained [source route summary](godot-snow-desktop/source-route-summary.json)
and [complete compressed CSV](godot-snow-desktop/source-route.csv.gz) contain
10,435 observations over 173.921 seconds and 364.583 m of horizontal travel.
All 10,435 observations were focused. The duration comes from the fixed-rate
observation stream and is not a frame benchmark.

| Observed behavior | Source route result |
| --- | --- |
| Straight and two-key diagonal unblocked horizontal speed | 2.249954–2.250035 m/s |
| Four boundaries, including corners | X and Z each reach approximately −31.7000 and +31.7000 m |
| Traversed feet heights | 0.10052–0.89931 m |
| Surface contact | Every sample grounded; maximum recorded origin contact gap 0 m |
| Camera orientation | Pitch −55°, yaw 45°, held throughout |
| Whole-map coverage after wheel zoom | 60 observations contain every footprint corner |

The 0.30 m feet clearance remains inside the 64 × 64 m footprint. Recorded feet
heights are physics-contact observations along the route; they are separate from
the authored surface's full vertex-height metadata. This source replay establishes
the scene behavior it observed, independently of packaged runtime acceptance.

## Release exports and packaged runtime

The desktop workflow uses the pinned standard 4.7.2 templates and checked-in
[`export_presets.cfg`](../../godot/export_presets.cfg),
[`export.sh`](../../godot/export.sh) and
[`build manifest writer`](../../godot/write-build-manifest.py). It produces a
universal Intel / Apple Silicon macOS application and a Windows x86-64 executable
with embedded project data. Release mode is the default. The macOS preview uses
ad-hoc signing and is not notarized for public distribution.

Initial export commands completed for both targets, but launching the initial
Mac package exposed missing preloaded scripts and a blank scene. Selecting only
the scene and route entry did not include every runtime dependency. The presets
were corrected to export all project resources, and rebuilt packages require
actual runtime verification. The final builds passed those checks below. This failure demonstrates why export success is
recorded separately from a working package.

The final Mac universal and Windows x86-64 release exports both succeeded.
Apple Silicon export also required enabling Godot's ETC2/ASTC import setting;
the project now retains that setting. The official templates archive was verified
against its published SHA-512 before installing the desktop templates. Packages
remain local at `godot/build/{macos,windows}/release/` (about 163 / 104 MiB).
The [Mac manifest](godot-snow-desktop/macos-build-info.json) and
[Windows manifest](godot-snow-desktop/windows-build-info.json) retain exact runtime
source and package SHA-256 values, engine, mode and renderer. Their baseline Git
revision plus `godot_source_dirty:true` identify the pre-commit source build;
the source hashes identify the actual implementation measured. The
[Mac export log](godot-snow-desktop/macos-export.log) and
[Windows export log](godot-snow-desktop/windows-export.log) show the final builds.

The release Mac app launched with the ordinary scene. Native window input walked
the figure with W and captured the [native exploration view](godot-snow-desktop/packaged-native-exploration.png).
A separate launch with `-- --walk-scene-check` completed the full-map route:
`SCENE WALK: PASS · 0 failures`, exit 0. The
[runtime log](godot-snow-desktop/packaged-route.log),
[route summary](godot-snow-desktop/packaged-route-summary.json) and
[complete CSV](godot-snow-desktop/packaged-route.csv.gz) retain 13,349 observations
over 222.485 real seconds and 364.658 m. The route paused on focus loss;
10,433 observations were focused. It resumed and traversed all four sides and
corners, crossed the interior, and zoomed to overview and back.

Every packaged sample remained grounded with zero recorded origin contact gap.
Unblocked straight and diagonal speed was 2.249954–2.250035 m/s; X and Z each
reached −31.7000 and +31.7000 m. Traversed feet heights were 0.10052–0.89931 m;
camera angles stayed −55° / 45°, and 60 overview samples contained all corners.
The actual [packaged exploration](godot-snow-desktop/packaged-exploration.png) and
[packaged overview](godot-snow-desktop/packaged-overview.png) PNGs were visually
inspected against the source renders and original reference. The muted cool snow,
short diffuse figure shadow, continuous relief and raised edge survive packaging.
No holes, seams, exposed substrate or contact defect were observed. Interior
relief remains intentionally subtle at whole-map scale; exploration shows the
small rounded changes alongside the figure. No optimization flattened it.

Windows export produced a PE32+ x86-64 executable with embedded data. No Windows
machine was available; Windows launch, input, appearance and hardware performance
are unverified. Export success is the extent of that platform's evidence.

## Packaged frame measurement

F6 in the release application starts an independent 60-second recorder. It samples
successive `_process` calls using `Time.get_ticks_usec()`, anchoring at the first
measured call so the pre-start interval is excluded. Each row retains its exact
monotonic interval start and end, frame duration, focus, latest observed input and
motion, position, camera size, observation age, and viewport/window dimensions.
The recorder stops after at least 60 real elapsed seconds; focus loss never pauses
the clock. Stationary or unfocused intervals remain in the raw data.

[`summarize_frames.py`](../../godot/summarize_frames.py) checks that every interval
is positive and contiguous and agrees with the terminal elapsed time. Average
FPS is complete intervals divided by their terminal wall-clock span. Frame-time
p95/p99 use nearest rank across every recorded interval, without warm-up trimming
or removal of slow frames. The report separately exposes focus and movement
coverage, resolution and incomplete-duration warnings. These are engine frame-loop
intervals, including recording overhead, rather than GPU timestamps or display
presentation latency. The F8 physics CSV and smoothed HUD FPS are not substitutes.

The accepted measurement used the **packaged release app** on the M1 Air above,
on AC power, after a prior launch/walking warm-up. F6 was started during the
packaged route, whose engine keyboard events drove two-key perimeter traversal
at exploration size 18 m. No desktop interaction, capture, export, download or
compilation occurred during the accepted minute. It crossed the north/east/south
drifts and corners; its X span was −15.537–31.700 m and Z span −31.700–31.700 m.
The [raw frame trace](godot-snow-desktop/benchmark-frames.csv.gz) and
[summary](godot-snow-desktop/benchmark-summary.json) include all intervals:

| Measurement | Result |
| --- | --- |
| Real duration / complete intervals | 60.008391 s / 7,175 |
| Wall-clock average | 119.567 FPS |
| Mean / p95 / p99 frame interval | 8.364 / 12.363 / 14.028 ms |
| Maximum frame interval | 34.366 ms |
| Focus | 100%; zero unfocused frames |
| Moving coverage | 58.093 s (96.807%); 1.916 s retained turn/boundary pauses |
| Viewport and window | Both 1280 × 800 throughout |
| Maximum movement-observation age | 20.481 ms |

This focused traversal meets the 60 FPS target; its p95 and p99 also fit within
16.667 ms. The maximum shows an occasional longer interval, rather than a claim
that every frame meets the budget. No performance optimization or remeasurement
after a visual compromise was needed. It measures the engine's rendered frame
loop, not physical display refresh or presentation latency.

Concurrent workload was not an otherwise idle machine: Codex/ChatGPT, Chrome,
WhatsApp, Terminal/iTerm and the desktop services remained open. The
[during-route process snapshot](godot-snow-desktop/benchmark-workload-route.txt)
records roughly 71% CPU for WindowServer, 35% for the Codex renderer and 21% for
Chrome at that instant; these are snapshots, not continuous utilization samples.
The native input/control service was also running. The download and exports
had completed before the benchmark. Earlier
[before](godot-snow-desktop/benchmark-workload-before.txt) and
[after](godot-snow-desktop/benchmark-workload-after.txt) snapshots bracket the
initial manual attempt, separately from the accepted minute.

Two earlier attempts are explicitly rejected as focused benchmark evidence:
the [manual run](godot-snow-desktop/invalid-unfocused-summary.json) lost focus for
22.017 s, and the [first route run](godot-snow-desktop/invalid-route-unfocused-summary.json)
lost focus for 20.604 s. Their complete compressed traces are retained beside
their summaries. After restoring focus, the accepted recorder ran for a full
uninterrupted minute; no slow or unfocused interval was removed from any trace.

## Evidence limits and remaining scope

The final source and packaged Mac captures, complete routes and focused hardware
measurement above were inspected separately. A Windows package built on macOS does
not establish Windows input, rendering or hardware performance. Source replay
does not establish ordinary OS key chords, and frame-loop timing does not measure
display presentation latency.

No Java, browser or Unity runtime behavior was changed for these tickets, and
their suites are not claimed as Godot acceptance evidence. The scene remains
offline with no Room, Game clock, network protocol, final Avatar system, buildings,
snowfall or footprints. Town content, Game/networking integration and coordinated
retirement of the existing maps remain later milestones under parent #89.
Generated packages, templates and downloaded archives remain local under the
repository's upload-size policy; small captures, compressed observations, manifests
and logs provide the retained review evidence.

## Standards

0 documented violations and 0 remaining advisory findings. The implementation
review identified duplicated engine discovery in launch/export scripts; both now
use `resolve-godot.sh`. Final independent review verified matching runtime source
hashes in both manifests, recalculated all three raw frame traces against their
summaries, and checked the separation of source, native input, packaged runtime,
visual judgment, performance and export evidence. All retained files are below
5 MiB; generated packages remain ignored.

## Spec

0 concrete gaps or correctness findings against #92 and #93. Independent review
viewed the reference and packaged captures, inspected build/runtime logs and route
observations, checked the manifests, and recalculated the accepted benchmark.
Windows runtime and hardware acceptance remain explicitly unverified, as allowed
by the ticket's requirement to disclose actual platform tooling outcomes.

Review totals: Standards 0 remaining findings; Spec 0 findings. Godot import and
all GDScript checks, Bash syntax, Python compilation and whitespace checks pass.
The packaged route exits 0. Shared Java/browser/Unity components were unchanged,
so their suites were not run for this Godot-only change.
