# Two generated Town Maps

Status: implemented. The owner confirmed the complete plan and all final recommended
choices. See [implementation verification](../verification/2026-10-14-generated-towns.md)
for tests, desktop builds, packaged runtime observations and hardware limits.

## Owner's direction

Improve PU Town's presentation, beginning with two generated Town Maps for now
(reduced from the original request for three). The owner selected these sources:

- Layout generation: [watabou/TownGeneratorOS](https://github.com/watabou/TownGeneratorOS).
- Avatar models: [KayKit Adventurers](https://kaylousberg.itch.io/kaykit-adventurers).
- Avatar animations: [KayKit Character Animations](https://kaylousberg.itch.io/kaykit-character-animations).
- Nature: [Quaternius Stylized Nature MegaKit](https://quaternius.itch.io/stylized-nature-megakit).
- Buildings: [Quaternius Medieval Village MegaKit](https://quaternius.itch.io/medieval-village-megakit).

The broader UI refresh is motivation; its screens and controls have not yet been
specified as part of this map slice.

## Accepted first-round decisions

The owner accepted the recommended answers, with explicit changes to map count
and building access:

- Target the native Unity client.
- Generate two distinct layouts for now. The first two recommended themes are a
  woodland village and a dense market town; their confirmed display names appear below.
- Generate, curate and save fixed reproducible maps during development. The Host
  selects one in the Lobby; individual Rooms do not generate fresh layouts.
- Keep all buildings non-enterable for the time being. Town streets and other
  outdoor areas are playable; no playable interior rooms are included in this
  slice.

The owner confirmed shared understanding under the invoked grilling workflow.

## Accepted second-round decisions

- Completely remove Kalapet Main Campus as a playable native Town Map; the two
  new towns replace it.
- Preserve generated street/district structure while fitting modular buildings,
  keeping visual footprints aligned with authoritative collision.
- Keep the towns compact. The accepted 15–20-second outward travel target is
  measured from the Meeting Area to the furthest public landmark/route endpoint
  now that Task sites are deferred.
- Disable Tasks on the two new native towns for now. Legacy browser maps retain
  their existing Task behavior during migration.
- Keep the angled follow camera with zoom; fade intervening roofs/foliage when
  needed to keep the own Avatar readable. Never reveal a withheld Participant.
- Use free asset editions initially and retain original source/provenance.

Removing campus means retiring its active map identifier/catalogue entry,
geometry publication, runtime resources, scene and map-specific build path.
Extract shared Nature imports, material mappings, shaders and restoration
dependencies into the replacement authoring pipeline. Historical ADRs and
license/provenance records remain evidence, rather than playable map content.
The shared Avatar workshop must follow its active sources into the new pipeline.

## Existing constraints

The existing domain term is **Town Map**: a Room's shared layout, selected by its
Host in the Lobby and retained for the Game. **Avatar Preset** is cosmetic and
independent of Role. These terms already exist in `CONTEXT.md`; the selected asset
packs do not introduce new domain concepts by themselves.

ADR 0020 establishes per-Room map pinning and synchronized collision, interiors
and Task locations. ADR 0022 permits each map to own its bounds and Meeting Area.
ADR 0023 introduces the native Unity client while retaining Java authority,
ground-plane traversal, queued frame application and per-recipient privacy.

Before this change, the native client created and supported `campus` Rooms. Its garden was
built from canonical campus geometry and supplied Quaternius assets. The browser
continues to support its existing towns during migration. Replacing campus
requires generalizing its fixed loaders and retiring its active content while
preserving the same Room selection, pinning and recovery behavior.

TownGeneratorOS provides the source of a 2D town layout generator. Its README
states that the source lacks some features of the newer hosted generator and
requires OpenFL and msignal. A generated plan still needs translation into the
chosen game client's artwork and authoritative playable geometry.

Source investigation found seeded layout generation, polygon building
footprints, wards, roads, walls and gates, but no existing JSON exporter in the
inspected generator code. The chosen repository will need a structured export
adapter. The modern hosted generator's JSON export is a separate possible input,
not an approved substitute for the owner's selected source.

The [KayKit Adventurers page](https://kaylousberg.itch.io/kaykit-adventurers)
offers five free character models, or eight with alternate textures in Extra.
The animation pack supplies Medium and Large rig sets, including sitting and
interaction. Cosmetic choices and Player Colour must keep up to ten Players
distinguishable without revealing Role.

Nature sources are partly present in this worktree; KayKit and Medieval Village
sources were not found. The existing native material builders use Built-in
Standard and custom shaders. Quaternius's prepared Source projects target URP,
so prepared engine assets do not automatically fit the current renderer. Free
imports will use the existing Built-in material pipeline.

## Design tree

The first two rounds settle the client, count, lifecycle, building access,
campus replacement, layout translation, scale, camera and free-edition choices.
The final round settled Task scope, names/default and initial KayKit presentation.
No owner decisions remain open for this slice.

Source version/seed, structured layout export, coordinate conversion and saved
geometry must support reproducibility with the selected generator. Collision,
retained Seats and measured public route endpoints must still derive from the
same canonical map data for Java and Unity. Outdoor-only buildings do not alter recipient privacy
or the gameplay meaning of Vision.

## Accepted final decisions

The owner accepted all final recommendations and confirmed the full plan:

1. Disable real Tasks, Fake Tasks and Task victory on both new native maps,
   including Solo Practice and Developer Rooms using those maps. Legacy browser
   maps retain their existing behavior during the migration.
2. Name the maps **Woodland Village** and **Market Town**, with Woodland Village
   as native Create's initial selection. The Host can switch in the Lobby.
3. Publish all five free KayKit Adventurers as cosmetic choices. Duplicate
   presets remain allowed, with Player Colour and Display Name identifying
   Players. Use KayKit idle, in-place walking and seated looping clips in the
   existing slots, keep the current uniform Night sleep pose initially, and omit
   carried weapons/accessories. Appearance and animation never encode Role.

This delivery covers the two maps, selected Avatar sources and required map
selection/Task UI changes. A broader HUD/menu redesign remains later work, as
the owner's stated first priority was the map implementation.

## Gameplay and verification plan

Task disabling must be authoritative: create no real/Fake banks, reject Task
actions/configuration, refuse the Developer Task scenario, and send compatible
empty Task snapshots on transitions and recovery. Hide Task controls and replace
Task-specific Role hints. An empty workload must never cause immediate victory.
The existing faction-elimination/parity victories, Day/Night/Townhall phases,
movement, proximity conversation, retained Seats and recovery stay in force.

Verify generated geometry/reachability and synchronized Java/Unity publication;
exercise selection, blocked buildings, corrections, recovery and disabled Tasks
through the WebSocket boundary. Run affected backend/frontend suites, Unity
EditMode tests and both platform builds. Inspect actual Day/Night renders and
exercise both maps with two packaged native clients. Record compilation,
packaged runtime, performance and any unavailable target-hardware evidence
separately. Verify release dependencies no longer contain the retired campus.

## Original authoring investigation

These are the pre-implementation findings; the pinned exporter and measured
replacement routes are now recorded in the generator guide and verification.

The chosen source constructs its seeded geometry synchronously in `Model`
before creating its display scene, so a separate exporter entry point can avoid
rendering. The geometry code still depends on OpenFL math/error classes. Haxe,
haxelib and the relevant runtimes were not found in the current PATH; compilation
and generation have not been verified, and no tools have been installed.

Current native prediction walks at 225 server units per second (2.25 Unity units
per second). Published route measurements for campus put its furthest Task site
15.63 seconds from the Meeting Area. The accepted 15–20 second target is an
authoring requirement for the new maps, not a measured result.

Non-enterable buildings need solid obstacle footprints and no interior areas.
The existing protocol accepts an empty Task snapshot without a schema change.
Task-enabled legacy maps still use 120-second stages in a 180-second Day.

The exporter must preserve ward semantics: market fountain/statue geometry and
park groves are not house footprints. Woodland/market presentation settings are
part of our adapter, rather than existing named generator options.

ADR 0024 records the confirmed generator/modular-footprint trade-off. Update the
implementation and verification evidence as work completes.
