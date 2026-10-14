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
the explicit F7 start was added before the complete run.

The route covers straight and two-key diagonal movement in the interior, west and
north boundary approaches, all four perimeter sides and corners, a return through
the interior, wheel zoom to overview and back to exploration, and real viewport
PNG capture. Ordinary native window input, engine-event replay and visual inspection
are separate evidence sources.

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
