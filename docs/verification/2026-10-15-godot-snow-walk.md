# Godot snow-walk verification — 2026-10-15

Scope: [issue #91](https://github.com/nirmaljb/pu-town/issues/91), the standalone
functional ground slice in parent #89. Baseline:
`30971b75cbdd0569b51dabe5bd44a7751a42ebcb`, verified against GitHub's latest
`codex/native-campus-migration` tip before implementation. Work is on
`codex/godot-snow-walk`; the implementation checkout originally had a detached HEAD.

## Environment and reproducibility

Godot standard GDScript `4.7.2.stable.official.ed1daf0bf`; Compatibility
`gl_compatibility`; macOS, Apple M1, OpenGL 4.1 Metal (driver 90.5).
The actual standalone window ran at 1280 × 800. Java and LiveKit were unnecessary.
Godot was already installed at `~/Downloads/Godot.app`.

The initial sandboxed editor import could not write Godot's normal macOS Library
cache/settings directory. The normal unrestricted launcher was then run from a
separate clean source copy without a `.godot/` directory and imported successfully,
with no script, shader or editor errors. No addon, asset download or external
geometry is required. The initial graphical render overexposed the surface;
ambient/direct illumination was reduced before traversal inspection. Fine periodic
material detail was removed after inspection to avoid a patterned appearance.

## Running-scene seam

The owner had already confirmed the running scene and normal input as the primary
behavioral seam in parent #89. Native CUA window input activated route recording
with F8 and walked with W and A; the camera followed and the visible feet remained
on the surface. The native input tool rejects a chord containing two letter keys,
and its parallel held-key calls were serialized, so those actions do not establish
a simultaneous WASD diagonal.

`godot/tests/walk_scene.gd` therefore launches the same graphical scene and submits
keyboard/wheel events via `Input.parse_input_event`. It reads only the public F8
CSV artifact, without inspecting private nodes, mesh order or procedural height
samples. Press F7 in the actual window to start it and keep the window focused.
An initial attempt was interrupted by loss of window focus and was stopped;
the explicit F7 start and focus-aware route pauses were added before the final run.
The next replay found no overview coverage because it reused a mutable wheel
event; distinct press/release events fixed that failure. A missing input-reset
API also exposed that editor import alone can omit nonglobal scripts; the
launcher now validates every runtime and route script with `--check-only`.

The route covers straight and two-key diagonal movement in the interior, west and
north boundary approaches, all four perimeter sides and corners, a return through
the interior, wheel zoom to overview and back to exploration, and real viewport
PNG capture. Ordinary native window input, engine-event replay and visual inspection
are separate evidence sources.

## Results and retained artifacts

The final scene route ran graphically from `/private/tmp/pu-town-snow-91-final/godot`,
a separate source copy initially without any import cache. The launcher imported
and validated every script successfully; the real scene then completed the route
with `SCENE WALK: PASS · 0 failures`. Its 10,934 observations cover 364.66 m of
horizontal travel over about 182 seconds, including focus pauses. 10,436 samples
were focused. This duration and HUD FPS are not a benchmark.

| Observed behavior | Result |
| --- | --- |
| Straight and two-key diagonal unblocked horizontal speed | 2.249954–2.250035 m/s |
| Four boundary approaches, with 0.30 m feet clearance | X and Z both reached −31.7000 and +31.7000 m |
| Traversed interior feet heights | 0.10061–0.23539 m |
| Traversed outermost metre feet heights | 0.61714–0.89929 m |
| Surface contact | Every sample grounded; maximum recorded origin contact gap 0 m |
| Camera angle | Pitch −55°, yaw 45°, unchanged throughout |
| Exploration follow | 10,874 samples had feet centred at exploration framing |
| Wheel zoom | 16.68–118 m; 60 overview samples contained all footprint corners |

The scene's authored surface metadata spans 0.100–0.249 m in the interior and
0.593–0.900 m across the outermost metre. This is separate from the heights the
route traversed. The temporary mannequin's head reaches 1.70 m above its origin;
its planted leg ends follow local snow intersections. Real close/perimeter views
were inspected for feet contact, continuous coverage and smooth transitions.
No cracks or gaps were observed. The full-map capture shows distributed surface
variation without a reserved central plateau.

Retained evidence:

- [Graphical route log](godot-snow-walk/scene-walk.log),
  [observation summary](godot-snow-walk/route-summary.json), and
  [complete compressed route CSV](godot-snow-walk/route.csv.gz).
- [Exploration capture](godot-snow-walk/exploration.png) and
  [whole-map capture](godot-snow-walk/overview.png), actual 1280 × 800 Godot
  viewport PNGs captured by F9 and visually inspected.
- After the review's shared-footprint refactor, all scripts validated again and
  the normal launcher opened the final source project. Native CUA held W and
  ordinary wheel events zoomed from 18 to 118 m. The
  [native-input observations](godot-snow-walk/native-input.csv.gz) contain 4,035
  samples, observed unblocked speed 2.249994–2.250005 m/s and 112 samples with the
  whole footprint visible. The [native overview](godot-snow-walk/native-overview.png)
  records that view without the HUD. No runtime errors were reported.

## Standards

0 hard violations, 0 remaining advisory findings. The review's footprint
maintenance advisory was resolved: Walker bounds, inspection corners and HUD
size, and narrow-window overview framing derive from `SnowSurface.HALF_EXTENT`.
Independent test expectations remain literal. The retained evidence distinguishes
engine-event replay from native input, import validation and packaged hardware
acceptance, consistent with AGENTS.md and ADR 0025.

## Spec

0 actionable findings. The implementation meets #91's standalone terrain, scale,
movement, containment, camera and reproducibility requirements. The graphical
route passed and both real captures were reviewed. Keyboard/wheel events and
exported CSV use the agreed running-scene seam. Existing game contracts remain
unchanged. Final appearance, exports and hardware benchmarks are deferred.

Review totals: Standards 0 remaining findings; Spec 0 findings; no outstanding
issue on either axis. Whitespace and staged upload-size checks pass.

## Evidence limits

The figure is a temporary nominal 1.70 m mannequin. The surface is one 64 × 64 m
mesh; rendered and collision triangles agree. Height metadata displayed in the
scene describes generated geometry, while route feet heights come from actual
physics intersections during movement. Small relief remains visually subtle at
the fixed high camera angle; final reference material and lighting acceptance are
deferred by #91.

HUD FPS is a live observation, not the specified packaged 60-second focused M1
benchmark. This ticket supplies no export, Windows runtime, packaged performance,
networking, final Avatar, building, snowfall or footprint acceptance. Existing
Java, browser and Unity runtime sources, maps, protocol and Avatar publication
were untouched; their suites were not used as substitutes for Godot acceptance.
