# Generated native towns — 14 October 2026

Implementation: [accepted spec](../specs/two-generated-town-maps.md),
[ADR 0024](../adr/0024-author-fixed-towns-from-watabou-layouts.md).
Review baseline: `ba27df9b2c77dc60979f878864e426df3366cf75`.

## Sources and generated geometry

The headless exporter actually executes pinned TownGeneratorOS source
`7fbc87a9398cc508af24de93f79cf2ad027f352b` with Haxe 4.3.7 and retained
OpenFL 8.9.0 math types. `export.py --check`, `author.py --check` and
`publish.py --check` passed. Nine geometry tests passed, including a reachable
Market landmark and well clearance from all ten Seats. Both Java and Unity
resources are byte-identical to the canonical layouts.

| Town | Seed / size | Solid buildings | Vegetation placements | Furthest public outward route at 225 units/s |
| --- | --- | ---: | ---: | ---: |
| Woodland Village | 20261014 / 8 | 17 | 150 | 17.13 s |
| Market Town | 20261015 / 12 | 25 | 65 | 15.49 s |

The original street bends and ward polygons are retained; the adapter fits solid
modular rectangular exteriors and omits footprints too small/crowded for them.
These measurements concern public landmarks and route endpoints, rather than
arbitrary map corners. See [generator instructions](../../tools/towns/README.md).

Actual Unity camera renders were inspected at the Meeting Areas, approaches and
overviews. Doors/shutters cover filled walls; wells clear Seats; Market Town has
three collision-backed counters and canopies. Preview images are under
`towns/{woodland,market}/previews/`; the separate `towns/layout-review.png` is a
geometry board. These images are not gameplay screenshots.

## Automated checks and packages

- Frontend: 115 tests, both TypeScript configurations and Vite production build
  passed. The existing large-chunk advisory remains.
- Backend: all 158 tests passed with `PU_TOWN_NATIVE_AVATAR_E2E=1`, no skips.
  This includes actual KayKit publication validation, native Room access,
  WebSocket map pinning/recovery, building rejection, empty real/Fake banks,
  Task action/configuration rejection, Practice, Developer Roles/additions/reset,
  phase progression, privacy and faction victories. Final server packaging passed.
- Unity 6000.6.0f1: 41 EditMode tests passed. The five added asset cases measure
  the baked standing skins at 1.7 metres, with feet at ground level.
- Opt-in Unity PlayMode: the real Java Room/HTTP/AssetBundle integration passed.
  It created a Room, selected Woodland through frame-applied events, fetched its
  pinned publication and instantiated all five valid Humanoids and their looping
  Standing, Walking and Seated clips.
- The independent retained macOS bundle validator passed for all five designs:
  published bytes/hash/size, prefab/root, Humanoid/hips and exact clip identities.
- Authoring boundary: four tests passed. All selected source/archive hashes are
  retained; the active oversized texture restore manifest has zero entries.
- macOS and Windows release builds passed. The only enabled scene is
  `Assets/Scenes/Town.unity`; resources contain the two generated towns. Campus
  geometry, resources, scene, environment builders and unused character/City
  imports are retired. Historical sources/licenses/reviews remain outside the
  active Player content. Shared surface noise now belongs to the town pipeline.
- Release Managed folders contain no Pipeline control assembly. The harmless
  `Unity.Pipeline.Attributes.dll` annotation dependency remains; this is not
  Editor/Pipeline control. The stable application identifier is retained for
  existing local preferences and recovery storage.

## Packaged macOS runtime

Used the built macOS release against the packaged Java server on loopback port
18093, with the local reviewed five-KayKit publication. `/health` returned healthy.
Two independent Player processes used separate recovery profiles. A direct local
Developer controller kept four Participants (two desktop Players, the controller
and one idle simulation), with automatic phase advancement disabled for inspection.
No microphone was enabled.

Observed through Computer Use in the actual packaged windows:

1. Both Players loaded the pinned KayKit collection and Woodland Village. Lobby
   switching to Market Town changed rules/art and retained Seats without a fresh
   collection catalogue. Day displayed exploration/conversation hints without
   Task counters or actions.
2. Keyboard movement was accepted. On Market Town, a walk toward a house from
   `(1776.22, 2661.70)` stopped at accepted `(1810.00, 2567.10)`, outside the west
   collision edge `1812.22`. A direct attempt to teleport into a building was
   rejected as `invalid_position`. Intervening building art faded and restored.
3. Inspected Market Night lighting, silent-state text and Doctor choices, then
   Townhall with retained Seats. Terminating Native One without Leave and
   relaunching the same profile restored its Membership; Native Two saw its
   reconnecting appearance return to normal.
4. Returned to Lobby, switched both to Woodland, then inspected Day and Night.
   A house approach from `(2325.07, 3766.13)` stopped at accepted
   `(2358.70, 3673.70)`, outside west edge `2361.07`. Terminating/relaunching
   Native Two recovered the same profile. Both were present at Woodland Townhall.
5. After unused campus imports were retired, a fresh packaged native Create
   selected Woodland by default. The actual Host selector changed to Market;
   choosing Knight updated the existing Avatar; acknowledged Leave returned to
   entry. Keyboard navigation was used for the controls. The map selector was
   subsequently given full width to avoid clipped names at 1280 × 800, rebuilt
   on both platforms, and inspected again in a fresh native Create/Leave check.

The runtime observations above are separate from the authored Editor previews.
Local test profiles, credentials, transport logs and downloaded/master/bundle
bytes remain ignored private files. The temporary QA processes were stopped.

## Measured hardware evidence and limits

The retained [60-second render-loop report](2026-10-14-generated-towns-performance.json)
is from an Apple M1 MacBook Air with 8 GiB RAM, Metal, a 1280 × 800 window,
High graphics/Ultra Unity quality and a 60 FPS target. With two Player processes
running, the observed window recorded 3,542 focused frame samples: 59.02 samples
per elapsed second, p95 frame interval 17.60 ms and p99 18.94 ms. Unity allocator
allocated memory peaked at 259,356,467 bytes; this is not process RSS or GPU memory.
The capture spans roughly 46 seconds in Lobby and 14 seconds through reveal/Day;
it does not establish sustained gameplay load across the whole town.

Windows compilation and both-platform Avatar bundle creation are verified;
Windows hardware/runtime is not. Ten-Player voice load, microphone permission,
audible output and a broader HUD/menu redesign are outside this verification.

## Required two-axis review

The `code-review` skill ran independent Standards and Spec reviewers against the
staged implementation plus current fixes from the baseline above.

### Standards

One glossary finding was fixed: client/platform migration classifications were
removed from `CONTEXT.md`, leaving only the domain definition and Town Map names.
The reviewer confirmed **zero remaining Standards findings**. No runtime privacy,
geometry publication or authoring-pipeline breach was found; no baseline smell
warranted a change.

### Spec

One finding was fixed: Developer Task settings were still accepted on disabled
maps. A WebSocket regression failed before the guard, then passed for all three
settings on both towns, asserting rejection before mutation. The reviewer
confirmed **zero remaining Spec findings**, with no additional scope creep.

Remaining findings: Standards 0; Spec 0.
