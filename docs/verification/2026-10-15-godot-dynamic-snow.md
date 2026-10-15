# Dynamic snow verification — 2026-10-15

Implemented the agreed design in [ADR 0026](../adr/0026-dynamic-snow-and-persistent-footprints.md)
on baseline `0d9623d`: a 64 × 64 m town with a moving 12.8 × 12.8 m detail
patch, flat substrate, variable snow depth, solid reference-inspired boxes,
two switchable inspection figures, shared world footprints and wind.
This is an offline prototype, without Room or networking integration.

## Checks performed

Godot `4.7.2.stable.official.ed1daf0bf` imported the project and validated every
GDScript through `godot/run.sh --check`. macOS universal and Windows x86-64 release
exports both completed. Their retained
[Mac manifest](godot-dynamic-snow/macos-build-info.json) and
[Windows manifest](godot-dynamic-snow/windows-build-info.json) match the current
runtime source hashes. Packages remain ignored under `godot/build/`.

The complete scene route passed with **6,638 observations** using:

```sh
"$GODOT_BIN" --headless --path godot --fixed-fps 60 -- \
  --snow-scene-check --headless-scene-check --auto-start
```

This is accelerated engine-event replay through the running scene and public
CSV observations, not a render or wall-clock performance measurement. It does
not access private scene nodes or procedural samples. Retained evidence:
[route log](godot-dynamic-snow/headless-route.log),
[complete CSV](godot-dynamic-snow/headless-route.csv.gz), and
[summary](godot-dynamic-snow/headless-summary.json).

| Observed behavior | Result |
| --- | --- |
| Same deep corridor, Shift held before/after repeated walking | Mean speed 2.250 → 2.934 m/s |
| Short taps below one stride | Accumulated travel produced two footprints |
| Leaving the detailed patch | Fixed world probe retained compaction |
| Second figure crosses the first figure's trail | Original probe compaction increased from approximately 0.317 to 0.746 |
| Wind erasure | Probe compaction reached zero and its depression refilled relative to the current snow baseline |
| Shared image | 2048 × 2048 throughout; fixed 16,777,216-byte CPU pixel payload |
| Traversed snow depth | Approximately 0.049–0.596 m |
| Maximum observed sinking | Approximately 0.299 m |
| Maximum recorded planted-foot contact gap | Less than 0.000035 m |
| Walking, running and diagonals | Walking remained 2.25 m/s; running stayed within 4.5 m/s and slowed in deep snow |
| Obstacles and bounds | Lodge and map-edge holds stopped movement without roof walking or idle stamps |
| Figure switching | Both figures used the shared image; the uncontrolled figure retained its position and step count |
| Camera | Fixed angle, follow and whole-map framing checks passed |

## Native input and appearance

The source scene ran on Apple M1 / macOS 26.2 with Compatibility rendering,
OpenGL 4.1 Metal. Native window input exercised walking, Tab switching, the wind
control, HUD toggling, recording and capture. The
[native route](godot-dynamic-snow/native-source-route.csv.gz) records 3,674
observations, both figures and 44 accumulated stamps. It reached approximately
0.371 m snow depth and 0.088 m sinking. This particular native-input record has
no held-Shift observations; running is established by the engine-event route,
not by that native record.

The rendered [deep-trail capture](godot-dynamic-snow/native-deep-trail.png) was
visually inspected. Snow stays pale and softly shaded; boot impressions and
box obstacles are visible. An initial inverted normal darkened the ground and
a fragment-discard boundary left a dotted outline around the detail patch.
Both were corrected and reinspected: normals now orient toward the surface and
whole coarse cells collapse under the aligned fine mesh, removing that outline.
The two meshes are created once; snow heights and normals remain dynamic.

An independent read-only review checked CPU/shader height and timestamp parity,
bounded storage, patch alignment, collision, focus and the offline boundary.
It found a short-tap stride-reset bug and a stopped-boot position jump; both were
fixed before the final route. No actionable findings remained.

## Evidence limits

The Mac package launched, rendered and began its graphical route, but that route
stopped after losing window focus for 60 seconds. The
[interrupted package log](godot-dynamic-snow/packaged-route-focus-interrupted.log)
is retained; a full packaged graphical-route pass is **not** claimed.
Windows export succeeded, but Windows runtime and hardware were not tested.
No new 60-second hardware frame benchmark was completed; the prior static
scene's performance numbers do not describe this dynamic implementation.

The coarse surface outside the local detail patch has lower geometric precision;
boot shapes remain in the world image while fine depressions resolve on return.
Wind is a bounded authored model with obstacle influence, not a conserved fluid
simulation. Footprints reset at launch, and live multiplayer remains outside
this slice. Java, browser and Unity source were unchanged, so their suites were
not run as evidence for this Godot-only behavior.
