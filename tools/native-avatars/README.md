# Native Avatar authoring

Native Avatar authoring stays outside the Player application. The Java backend remains the single reader of the configured publication artifact; new Rooms resolve it once and existing Rooms retain their complete immutable collection, including the platform bytes.

The migration supports existing version 1 sprite publications without changing their wire payload. `GET /rooms/{roomCode}/avatars` still returns version 1. `GET /rooms/{roomCode}/avatars?version=2` returns native designs only and responds `409` when a Room's pinned collection lacks a complete native representation. Unknown versions receive `400`; unknown/expired Room Codes receive `404`. A native-only collection similarly returns `409` to the default sprite request. A version 2 publication can include both complete sprite sheets and its required native representation while transitional consumers remain active.

A version 2 publication is `{ "version": 2, "presets": [...] }`. Each preset has a stable `id`, a Player-facing `name` of 1–24 Unicode code points, and a `native` object. IDs match `[a-z0-9][a-z0-9-]{0,63}`. Duplicate IDs, empty collections, unknown fields and incomplete representations are refused before replacing the current collection. The native HTTP response adds the backend's content-derived `collectionId` and emits only `{id, name, native}` entries.

```json
{
  "version": 1,
  "masterId": "kaykit-knight",
  "masterRevision": 1,
  "model": {
    "sourceSha256": "<64 lowercase hexadecimal characters>",
    "rootNode": "avatar",
    "heightMetres": 1.7,
    "pivot": "feet",
    "forwardAxis": "+z"
  },
  "rig": { "type": "humanoid", "avatarName": "avatarAvatar", "hipsBone": "hips" },
  "animations": {
    "standing": { "clipName": "Standing", "durationSeconds": 1.06666672, "loop": true },
    "walking": { "clipName": "Walking", "durationSeconds": 1.06666672, "loop": true },
    "seated": { "clipName": "Seated", "durationSeconds": 3.60000014, "loop": true }
  },
  "platformAssets": [
    {
      "platform": "windows-x86_64",
      "format": "unity-assetbundle",
      "unityVersion": "6000.6.0f1",
      "assetName": "assets/art/avatars/kaykit-knight/avatar.prefab",
      "sha256": "<64 lowercase hexadecimal characters>",
      "byteLength": 123,
      "data": "<raw base64 bytes, without a data URL prefix>"
    },
    {
      "platform": "macos-universal",
      "format": "unity-assetbundle",
      "unityVersion": "6000.6.0f1",
      "assetName": "assets/art/avatars/kaykit-knight/avatar.prefab",
      "sha256": "<64 lowercase hexadecimal characters>",
      "byteLength": 123,
      "data": "<raw base64 bytes, without a data URL prefix>"
    }
  ]
}
```

The representation has its own version, independent of WebSocket protocol version 1. `masterRevision` is a positive 32-bit integer. Model height and all clip durations are finite positive numbers. Standing, walking and seated clips loop. Both supported desktop platform bundles are required, built with the same recorded Unity version. Every bundle is 8 bytes to 64 MiB, starts with `UnityFS\0`, and matches its SHA-256 and byte count. The Java reader validates the manifest and integrity, while the actual Unity loader additionally checks the prefab, valid Humanoid Avatar, bound renderers, controller and three matching clips. A Unity container signature alone does not prove mesh, animation or platform runtime acceptance.

Bundle bytes travel inline to preserve the existing Room pinning lifetime without an independent asset catalogue or file reader. Download once per collection, verify the hashes, and create every Avatar from its published `assetName` before presenting the Room. `model.sourceSha256` identifies the reviewed exported GLB/FBX; Blender master provenance and private QA records stay in the authoring workspace. Client rendering never supplies catalogue membership or cosmetic authorization.

The active publication contains all five free **KayKit Adventurers 2.0**: Barbarian, Knight, Mage, Ranger and Rogue, with stable IDs `kaykit-barbarian`, `kaykit-knight`, `kaykit-mage`, `kaykit-ranger` and `kaykit-rogue`. The private workspace is `towns/assets/avatars/`; original downloads, exact hashes and included CC0 licenses are recorded in [the town source inventory](../../towns/assets/sources/README.md). No paid edition or external model-generation service was used.

`kaykit_author.py` derives each immutable master in a fresh Blender process from the supplied Medium-rig GLB, keeping the original mesh topology, UVs, weights and atlas. It selects `Idle_A` from General, `Walking_A` from MovementBasic and `Sit_Chair_Idle` from Simulation in **KayKit Character Animations 1.1**. Imported Blender bone-display helper meshes are excluded. Carried weapons are not imported; the Ranger's source quiver remains hidden in the editable master and is excluded from the runtime export. Existing master revisions are refused: use an explicit new revision and register it before rebuilding a changed source.

`PUtown.Editor.KayKitAvatarBuild.BuildCandidates` imports the FBX and unchanged atlas, maps the 23-joint source rig to Unity Humanoid, creates `Standing`, `Walking` and `Seated` states, normalizes the standing mesh surface to 1.7 metres with its feet at ground level, and builds both desktop bundles. Root motion is disabled. It checks the registered master hash and writes drafts with empty review checks. `KayKitAvatarBuild.RenderCandidates` creates actual Unity front/back/side/walking/seated evidence through the common `AvatarBuild` renderer. Inspect the outputs and record the required review before publishing; rebuilding clears a draft's approval and does not replace publication. No Windows runtime pass is inferred from a build.

Use the saved prefab's actual `name` for `model.rootNode`; the input GameObject name can differ after `SaveAsPrefabAsset`. All five current designs have root `avatar`, Humanoid Avatar `avatarAvatar`, source Hips bone `hips`, and +Z forward. Standing and walking loops are `1.06666672` seconds; seated is `3.60000014` seconds in the current Unity exports. The per-design reports remain authoritative for these identities and durations. `AvatarBuild.ReportAndValidateMacBundles` reads the local publication and retained macOS bundles, writes each `unity-bundle-report.json`, and refuses differences in root identity, instantiated Humanoid identity, clip duration/loop, bundle bytes, hash or Unity version. Set `PU_TOWN_REPOSITORY` to the repository's absolute path when invoking editor methods from an isolated project.

The older Rowan/Mira and Quaternius Ash/Lea sources, registered masters and review evidence under `campus/assets/avatars/` are historical. Their rigs and clip durations differ from KayKit. They are outside the active publication and must not be used as template identities for it.

The opt-in PlayMode test `PUtown.IntegrationTests.NativeAvatarRoomTests.PublishedRoomAvatarsLoadAndInstantiateWithTheirDeclaredIdentity` creates a real Room, applies its native Woodland Village selection through Game frames, fetches that Room's pinned collection through the strict runtime loader, and instantiates every published design to inspect its Humanoid bones and three playable clips. Set `PU_TOWN_NATIVE_AVATAR_E2E=1` and `PU_TOWN_NATIVE_AVATAR_WS=ws://127.0.0.1:8080/ws/game` against a Java backend configured for this native publication. A metadata republish requires a new Room; existing Rooms preserve the collection they pinned.

Restore the reviewed private workspace for an existing revision, or derive a new one from the pinned local sources. For example, author the next Knight revision in Blender **5.2.2 LTS**, then register it using a provenance file for the actual source/license:

```sh
Blender --background --factory-startup --python tools/native-avatars/kaykit_author.py -- kaykit-knight 2
python3 tools/native-avatars/authoring.py --workspace towns/assets/avatars register-master kaykit-knight 2 towns/assets/avatars/sources/kaykit-knight/v2/avatar.blend provenance.json
unity run native --editor-version 6000.6.0f1 -- -executeMethod PUtown.Editor.KayKitAvatarBuild.BuildCandidates
unity run native --editor-version 6000.6.0f1 -- -executeMethod PUtown.Editor.KayKitAvatarBuild.RenderCandidates
```

`KayKitAvatarBuild` currently selects the five registered revision 1 masters; changing a master revision requires updating that authoring configuration deliberately before rebuilding. Run one Unity Editor against a project at a time. After reviewing and recording the new drafts, validate and publish the complete collection:

```sh
python3 tools/native-avatars/authoring.py --workspace towns/assets/avatars validate kaykit-barbarian kaykit-knight kaykit-mage kaykit-ranger kaykit-rogue
python3 tools/native-avatars/authoring.py --workspace towns/assets/avatars --publication towns/assets/avatars/publication.json publish kaykit-barbarian kaykit-knight kaykit-mage kaykit-ranger kaykit-rogue
python3 tools/native-avatars/test_authoring.py
```

Use `authoring.py --workspace towns/assets/avatars save design.json` to save a reviewed private design. Review checks cannot be inferred from generation or bundle compilation.

A provenance JSON records `author`, `source`, `license`, `licenseRecordedAt` (ISO date), and `exportEntitlement`. Registration retains an immutable source copy and its SHA-256. Repairs require a new revision and renewed dependent design checks.

A private saved design has `{id, name, native, review}`. Its model replaces public `sourceSha256` with private workspace-relative `sourceFile`; each platform asset replaces public integrity/data fields with private `file`. The review has `sourceSha256`, `platformSha256` keyed by both platform IDs, `checks` containing exactly `silhouette`, `scale-pivot`, `uv-normals`, `deformation`, `native-materials`, `standing`, `walking`, `seated`, and nonempty workspace-relative `evidenceFiles`. Publication refuses a changed model or bundle until its recorded review is renewed. Evidence records require a human or agent to perform the stated inspection; the CLI checks their presence and identity and does not invent an art review.

Saving a draft and registering a master never changes publication. Publish validates every selected distinct design, embeds runtime bundles, fsyncs the complete temporary JSON, then atomically replaces the chosen artifact. A running backend keeps its last good collection when the file is malformed, missing or incomplete; cold startup fails explicitly. Do not expose this workspace, masters, drafts, scripts or review records through the Player build.

Downloaded archives, extracted binary imports, Blender masters, duplicate exports, platform bundles and the embedded publication stay local under the repository upload policy. Source metadata, reviews and selected smaller native imports remain in Git. A fresh clone cannot recreate immutable master hashes merely by downloading packs; restore a reviewed private workspace or author and review a new revision. See [local asset storage](../native-assets/README.md). The real authored-publication Java test is opt-in with `PU_TOWN_NATIVE_AVATAR_E2E=1`; ordinary server tests keep their self-contained contract fixtures.
