# Snow walk: overview key and a limited walking twist

Two changes to the standalone Godot snow walk (ADRs 0025–0027), agreed with the
owner on 16 October 2026 from `native-live` at `fb66fc7`. Neither touches the
Java, browser or Unity contracts, and the prototype keeps its offline boundary.

## 1. M opens the whole-map overview

Today the overview is reached only by one wheel step out beyond 30 m. Add the
physical **M** key as a toggle:

- M while playing opens the overview. M in the overview returns to the play
  distance the Player left, not to 30 m (the camera's play distance is kept while
  the overview is open; `follow_camera.gd` already leaves `distance` untouched).
- The wheel is unchanged otherwise: one step in from the overview still returns
  to 30 m, whichever way the overview was opened. A wheel step **out** while the
  overview is open does nothing. Today it would silently grow the hidden play
  distance when the overview was entered below 30 m, which M makes reachable.
- Walking, the lean (zero in the overview) and the detail region behave in the
  overview exactly as they do when it is opened with the wheel. Key repeat does
  not toggle, and an unfocused window ignores M like every other key.

## 2. Facing stops at a limit while walking

### Problem

Facing follows the cursor's point on the ground, and the upper body (spine to
head) twists by the whole difference between Facing and the direction of
travel. Standing still this is bounded, because the legs pivot once the twist
passes 60°. While walking nothing bounds it: with the cursor behind a walking
figure the chest and head turn almost 180° over legs still walking forwards, and
when the cursor crosses directly behind, the twist wraps from +180° to −180° and
the upper body whips round the other way.

### Agreed behaviour

This follows the bounded upper-body turn of on-foot shooters such as Arma, Tarkov
and Helldivers 2, rather than turning the whole body to the cursor (which needs
strafe and backpedal clips) or ignoring the cursor while walking. Facing stays
purely presentational; Vision does not depend on it.

The cursor sets the bearing the figure *wants* to look along. Facing is where the
figure actually looks:

- **Walking (the figure moved this frame):** let *d* be the cursor bearing minus
  the heading, wrapped to (−180°, 180°].
  - If |*d*| ≤ **110°**, the target twist is *d*, and the figure's **held side**
    becomes the sign of *d*.
  - Otherwise the target twist is the held side × 110°: the figure keeps looking
    over the shoulder it last used and never swings through its back. It changes
    shoulder only when the cursor comes back within 110° on the other side, and
    then turns there through the front.
  - Facing turns toward heading + target twist at no more than **540° per
    second**, so a change of shoulder or the heading turning under it never
    snaps. When walking starts with no held side yet, it takes the sign of *d*.
- **Standing still:** unchanged. Facing tracks the cursor bearing exactly, and
  the legs pivot without stepping once the twist passes 60°. The one exception is
  the moment after stopping: if Facing is still away from the cursor (held at the
  limit, or catching up), it turns toward the cursor at the same 540°/s and the
  legs pivot after it under the 60° rule. Once it reaches the cursor it tracks
  exactly again.
- The 110° twist keeps the existing spread over the spine bones (Spine 15%,
  Chest 20%, UpperChest 30%, Neck 20%, Head 15%), so the head bone turns about 16° on
  its own and about 72° counting the neck and upper chest.
- Unchanged: the 25 cm dead zone and the cursor-outside-window rule; travel,
  speed, step timing and bootprints follow travel only; turning in place leaves
  no prints; after Tab the newly controlled figure takes its Facing from the
  cursor; the uncontrolled loop walker faces where it travels and is unaffected.

The constants (110°, 540°/s) live beside `STANDING_TWIST` in `godot/walker.gd`.

## Domain language

No glossary change. CONTEXT.md already defines **Facing** as the direction an
Avatar is looking; the cursor bearing is an input, not a domain term. Keep using
"overview" (the existing name) for the whole-map view, not "game view" or "map".

## Documentation

- Amend the Facing sentences in
  [ADR 0027](../adr/0027-reference-snow-town-with-wind-shaped-depth.md): Facing
  follows the cursor, but while walking the upper body turns no more than 110°
  from travel and holds the nearer shoulder. Add M to its overview sentence. No
  new ADR: this is cheap to reverse.
- `godot/README.md`, **Camera and Facing**: describe the walking limit, the held
  side, the turn rate and M; add an M row to the control table and adjust the
  wheel row.
- AGENTS.md snow-walk summary: mention that Facing is bounded while walking and
  that M opens the overview. Update the start-up hint in `snow_walk.gd`.

## Verification

Behaviour is tested at the existing seam: the running scene, driven by keyboard,
wheel and mouse-movement events, observed through the exported route CSV
(`godot/tests/walk_scene.gd`, `godot/inspection_route.gd`). Do not address
private nodes.

- Add a `twist_deg` column: Facing minus heading (the legs' direction), wrapped.
- Overview stages: from the 16 m play distance, M opens the overview (whole map
  visible, zero lean); M returns to exactly 16 m. From the overview, a wheel step
  out leaves the overview and the hidden distance unchanged; a wheel step in
  reaches 30 m. Walking continues while the overview is open.
- Facing stages: walk north while the cursor sweeps from east, through south
  (directly behind), to west. Check that |twist| never exceeds 110° (plus
  tolerance), that it never changes sign while the cursor is beyond 110°, that it
  changes shoulder through the front only once the cursor is within 110° on the
  west, that Facing never turns faster than 540°/s, and that travel, speed and
  bootprints are those of a plain northward walk. Stop with the cursor behind,
  and check that Facing reaches the cursor within the expected time and then
  tracks it to 0.5°.
- Existing checks must still pass unchanged: turn in place (exact tracking,
  no prints), walk north/south facing east (90°, inside the limit), Tab Facing,
  lean and detail-region stages.
- Run `GODOT_BIN=… ./godot/run.sh --check`, the headless replay and the graphical
  route, then the release package route. Save before/after captures of a figure
  walking north with the cursor behind it, and inspect them for a twisted-backwards
  torso. Record graphical and packaged evidence separately from the headless
  replay, as the existing verification notes do.
