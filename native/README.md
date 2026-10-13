# Native campus migration

This Unity application is the migration source for GitHub #58. The Java server remains authoritative. The browser and its checks remain available until native coverage, both platform acceptance and legacy retirement in #86 are complete. Do not treat the current migration artifacts as final #87 acceptance.

Pins: Unity **6000.6.0f1** (`f7f8ed4d1e24`), Blender **5.2.2 LTS**, official Unity CLI **1.0.0-beta.8**, Pipeline **0.8.0-exp.1**, Newtonsoft **3.2.1**, and official LiveKit Unity SDK **2.1.0** at `356bf5dfe079fd981cd514271b32d6cfe5d5516f`. `Packages/packages-lock.json` records the resolved packages. The upstream LiveKit package uses Git LFS for desktop libraries. This repository keeps downloaded Standard archives, editable Blender masters, generated bundles/publication and textures over 5 MiB local. Follow [local asset storage](../tools/native-assets/README.md) to restore the ten excluded textures from the recorded Standard packs before opening or building a fresh clone. Mac and Windows Mono build support are required; the checked builds do not enable Pipeline runtime control.

Open this `native/` directory in the pinned Editor. From the repository root, with `UNITY_EDITOR` set to the full Editor executable path:

```sh
python3 tools/native-assets/restore.py --check
python3 tools/campus/publish.py --check
"$UNITY_EDITOR" -batchmode -nographics -projectPath "$PWD/native" -runTests -testPlatform EditMode -testResults /tmp/putown-native-tests.xml -logFile /tmp/putown-native-tests.log
"$UNITY_EDITOR" -batchmode -quit -projectPath "$PWD/native" -executeMethod PUtown.Editor.NativeBuild.BuildMac -logFile /tmp/putown-mac-build.log
"$UNITY_EDITOR" -batchmode -quit -projectPath "$PWD/native" -executeMethod PUtown.Editor.NativeBuild.BuildWindows -logFile /tmp/putown-windows-build.log
```

Close this project's Editor normally before using batch commands on it. To preserve an open Editor while checking source, copy `Assets/`, `Packages/` and `ProjectSettings/` into an isolated directory and point `-projectPath` there. Set `PU_TOWN_REPOSITORY` to the absolute repository path so source inventories and reports resolve to that checkout. The build methods create the editable Game scene and invoke `PUtown.Editor.QuaterniusCampusBuild.Prepare` to derive the active `CampusGarden.prefab` from retained FBX sources and canonical campus rectangles. Art has no authoritative Colliders; canonical Java geometry owns accepted movement, interiors and Task reachability.

The garden combines the free Standard editions of Stylized Nature MegaKit, Downtown City MegaKit and neutral furniture from Fantasy Props MegaKit. It uses supplied textured foliage, modern facade modules, paving, furniture and retained Seats, with selected original campus landmarks. Runtime loads this combined garden; historical campus art prefabs remain authoring history. [The garden asset guide](Assets/Art/Quaternius/README.md) describes material mapping, original ground/water/foliage shaders, regeneration and actual camera previews. The exact retained releases include the older explicit CC0 notices, with archive hashes and license evidence in [the source inventory](../campus/assets/sources/quaternius/README.md); the creator's newer generic website license differs. Check that inventory when changing a source release.

Build outputs are `Builds/macOS/PU Town.app` and `Builds/Windows/PU Town.exe`. They and the candidate native Avatar publication are local generated artifacts. Restore a reviewed private Avatar workspace or author/review/publish new designs before starting a native-only backend from a fresh clone; see [local asset storage](../tools/native-assets/README.md). The publication contains both platform bundles, while the server's default sprite publication stays transitional. From `backend/`, start a native-only test server with:

```sh
./mvnw spring-boot:run '-Dspring-boot.run.arguments=--server.port=18093 --putown.avatars.publication=file:../campus/assets/avatars/publication.json'
```

`file:` makes this an explicit filesystem path for Spring. Add `--putown.developer.enabled=true` only for local Developer testing. Follow [the voice setup](../tools/voice/README.md) before starting Java if voice is needed. The SDK connects through Java's `/voice` gateway, never directly to SFU credentials.

Launch each packaged client with `-server ws://127.0.0.1:18093/ws/game -profile player-one`. Health checks use `/health` on that server's HTTP origin; `--health` optionally overrides it. A different `-profile` creates an independent restart-intent file on the same machine; it is not a Player identity. Create selects `campus` authoritatively before assets are loaded. Join requires a native campus Room; unsupported legacy maps and unavailable native Avatar representations produce explicit feedback.

The active native Avatar collection is Ash and Lea. Their retained Standard character sources, editable clothed masters, revision history and publication steps are documented in [the Avatar workspace](../campus/assets/avatars/README.md) and [the authoring guide](../tools/native-avatars/README.md). New Rooms obtain that collection from the backend's configured publication; the Unity build does not supply a second catalogue.

The native runtime queues arrival-stamped messages and applies state at the start of `Update`. Heartbeat timing and media revocation do not wait for frames. Recovery retains the server-issued identity, Seat, accepted appearance and authorized views. Intentional Leave clears restart intent. UI controls for Roles, editable Night choices, confirmed ballots, all Tasks, proximity chat, Solo Practice and local Developer scenarios use the existing contract.

Settings stores local display/audio/microphone preferences. Runtime audio uses original synthesized wind, birds and restrained score; received movement cues are limited to the authorized field. Voice and effects share master/category routing. See [native media checks](../tools/native-voice/README.md) for the opt-in real Java/LiveKit/Unity DSP test and its limits.

For an opt-in render-loop observation, add `-benchmark-output /absolute/path/result.json -benchmark-seconds 60` when launching a package. It warms up for five seconds and records frame intervals, Unity allocator memory, machine/settings and applied public phase/Player-count ranges. Record scene routes and voice topology separately. This observer does not measure total process/media memory or GPU execution time and does not automatically establish the ten-Player acceptance target.

With a native-publication backend running, set `PU_TOWN_NATIVE_AVATAR_E2E=1` and `PU_TOWN_NATIVE_AVATAR_WS=ws://127.0.0.1:18093/ws/game` for the opt-in PlayMode Room/HTTP/AssetBundle test. It instantiates every published Humanoid and checks exact root, rig and playable clip identity. `PUtown.Editor.AvatarBuild.ReportAndValidateMacBundles` performs the equivalent publication identity check for retained macOS bundle exports; set `PU_TOWN_REPOSITORY` to the repository root when using an isolated Editor.

Source-preserving authoring and provenance are documented in [campus assets](../campus/assets/README.md), [Avatar publication](../tools/native-avatars/README.md) and [campus geometry](../campus/README.md). The [verification ledger](../docs/verification/2026-10-13-native-migration.md) distinguishes deterministic tests, build outputs, camera renders, packaged runtime and unavailable hardware acceptance.
