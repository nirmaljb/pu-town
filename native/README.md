# Native town client

PU Town's Unity desktop client offers **Woodland Village** and **Market Town**.
They replace Kalapet Main Campus. The Host chooses a town in the Lobby; Start and
recovery retain it. Buildings are solid and non-enterable. Real Tasks, Fake Tasks
and Task victory are disabled on these two maps for now, including Practice and
Developer Rooms. Night choices, Townhall voting, faction victories, proximity
conversation and the server clock retain their existing rules. The browser and
its three legacy towns remain available during migration.

Pins: Unity **6000.6.0f1** (`f7f8ed4d1e24`), Blender **5.2.2 LTS**, Unity CLI
**1.0.0-beta.8**, Pipeline **0.8.0-exp.1**, Newtonsoft **3.2.1**, LiveKit Unity SDK
**2.1.0** at `356bf5dfe079fd981cd514271b32d6cfe5d5516f`. Both macOS and Windows
Mono build support are required. Pipeline is development-only and excluded from
release control. LiveKit's native libraries require Git LFS.

## Generate and build

`towns/{woodland,market}/layout.json` is the canonical geometry, authored from the
saved seeded Watabou exports. Java and Unity receive byte-identical rules. The
[generator guide](../tools/towns/README.md) records source pins, reproducibility,
route measurements and publication. Ordinary builds need no Haxe compiler.

From the repository root:

```sh
python3 tools/towns/publish.py --check
python3 tools/native-assets/restore.py --check
unity test native --mode EditMode --editor-version 6000.6.0f1 --output /tmp/putown-native-tests.xml
unity run native --editor-version 6000.6.0f1 -- -executeMethod PUtown.Editor.GeneratedTownBuild.BuildAndReview -logFile /tmp/putown-town-review.log
unity build native --target StandaloneOSX --execute-method PUtown.Editor.NativeBuild.BuildMac --editor-version 6000.6.0f1 --allow-dirty-build --log-file /tmp/putown-mac-build.log
unity build native --target StandaloneWindows64 --execute-method PUtown.Editor.NativeBuild.BuildWindows --editor-version 6000.6.0f1 --allow-dirty-build --log-file /tmp/putown-windows-build.log
```

Close this project's Editor normally before batch execution, or copy `Assets/`,
`Packages/` and `ProjectSettings/` to an isolated project and set
`PU_TOWN_REPOSITORY` to this checkout. Do not run two Editors against one project.
The build methods prepare `Assets/Scenes/Town.unity` and derive both town prefabs
from retained free meshes and textures. Campus scene/resources/builders are
retired. The existing application identifier stays stable to preserve local
preferences and Membership recovery storage.

Outputs are `native/Builds/macOS/PU Town.app` and
`native/Builds/Windows/PU Town.exe`. Town art previews live in
`towns/{mapId}/previews/`. These are actual Unity camera renders; geometry boards
are separate. Source assets are documented in [the asset guide](../towns/assets/sources/README.md).

Paving is generated as continuous meshes in `Art/Quaternius/TownDerivedMeshes`.
The meshes and Garden prefabs stay local; their metadata, shaders, materials and
small terrain masks are retained. `Prepare` recreates them from the canonical
town layouts. Woodland's west square connection and edge planting are cosmetic;
they add no collision authority. See [the authoring guide](../tools/towns/README.md).

## Run against Java

The backend remains the single reader of the Avatar publication. The native
collection contains the five free KayKit Adventurers, using their free idle,
walking and seated animations. Duplicate presets remain valid; Display Names and
Player Colours identify Players. The existing uniform cosmetic Night sleep pose
is retained. Carried weapons and the Ranger's quiver are excluded from the
runtime export; the unchanged source and hidden quiver remain in private masters.

The native publication and generated platform bundles are local authoring
artifacts. Restore the reviewed private workspace or follow
[Avatar authoring](../tools/native-avatars/README.md) before starting a native
backend from a fresh clone. A bundle build alone is not visual review.

From `backend/`:

```sh
./mvnw spring-boot:run '-Dspring-boot.run.arguments=--server.port=18093 --putown.avatars.publication=file:../towns/assets/avatars/publication.json'
```

Add `--putown.developer.enabled=true` only for direct local Developer testing.
Launch each packaged client with `-server ws://127.0.0.1:18093/ws/game -profile
player-one`; use another profile for another independent restart-intent file.
Native Create selects Woodland Village before loading assets. Health uses
`/health` on the same HTTP origin, with optional `--health` override. Voice setup
is unchanged: [voice guide](../tools/voice/README.md).

Queued arrival-stamped Game events apply at the beginning of `Update`, including
map rules/art changes before reconciliation. Heartbeat timing and voice
revocation remain independent of rendering. The client predicts only its own
Avatar; Java validates every accepted position and recipient view. Roof/foliage
fading only makes already-authorized artwork readable.

## Verification

The opt-in `PU_TOWN_NATIVE_AVATAR_E2E=1` Java publication test checks the real
five-design Room collection. With a native-publication backend running, set that
variable and `PU_TOWN_NATIVE_AVATAR_WS=ws://127.0.0.1:18093/ws/game` for the Unity
PlayMode Room/HTTP/AssetBundle test. `AvatarBuild.ReportAndValidateMacBundles`
checks retained macOS bundle bytes against published prefab, rig and clip identity.

Release acceptance also needs two packaged native clients exercising selection,
Start, movement around buildings, recovery and Night/Townhall on each map.
Windows compilation is separate from Windows hardware/runtime evidence. The
optional `-benchmark-output /absolute/path/result.json -benchmark-seconds 60`
records frame intervals after warmup; it does not measure total process memory,
GPU execution or automatically establish ten-Player voice performance. Historical
migration evidence remains in `docs/verification/2026-10-13-native-migration.md`.

Report version 2 also retains consecutive monotonic-clock intervals, reports
focused and unfocused interval distributions separately, and records available
Unity counters. A focus-changing interval belongs to its starting focus state.
Unavailable counters contain no samples. `Main Thread` includes engine work and
waits; neither that counter nor frame duration establishes GPU execution time.

For development-only scope/allocation/render observations:

```sh
unity build native --target StandaloneOSX --execute-method PUtown.Editor.NativeBuild.BuildMacProfile --editor-version 6000.6.0f1 --allow-dirty-build --log-file /tmp/putown-profile-build.log
```

This writes `native/Builds/Profile/PU Town.app`. Launch it with the same benchmark
arguments to record `PUtown.ApplyFrame`, `Movement`, `Avatars`, `Interface` and
`Occlusion` scopes. Compare release performance separately: profiling adds work,
and release Players may lack allocation/render counters. Record the machine,
resolution, preset, phase, Player count, focus and background workload with every
capture. The [Woodland verification record](../docs/verification/2026-10-14-woodland-performance-polish.md)
separates packaged observations from automated checks and platform limits.
