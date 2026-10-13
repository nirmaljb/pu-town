Native Avatar authoring stays outside the Player application. The Java backend remains the single reader of the configured publication artifact; new Rooms resolve it once and existing Rooms retain their complete immutable collection, including the platform bytes.

The migration supports existing version 1 sprite publications without changing their wire payload. `GET /rooms/{roomCode}/avatars` still returns version 1. `GET /rooms/{roomCode}/avatars?version=2` returns native designs only and responds `409` when a Room's pinned collection lacks a complete native representation. Unknown versions receive `400`; unknown/expired Room Codes receive `404`. A native-only collection similarly returns `409` to the default sprite request. A version 2 publication can include both complete sprite sheets and its required native representation while transitional consumers remain active.

A version 2 publication is `{ "version": 2, "presets": [...] }`. Each preset has a stable `id`, a Player-facing `name` of 1–24 Unicode code points, and a `native` object. IDs match `[a-z0-9][a-z0-9-]{0,63}`. Duplicate IDs, empty collections, unknown fields and incomplete representations are refused before replacing the current collection. The native HTTP response adds the backend's content-derived `collectionId` and emits only `{id, name, native}` entries.

```json
{
  "version": 1,
  "masterId": "campus-ash",
  "masterRevision": 2,
  "model": {
    "sourceSha256": "<64 lowercase hexadecimal characters>",
    "rootNode": "avatar",
    "heightMetres": 1.7,
    "pivot": "feet",
    "forwardAxis": "+z"
  },
  "rig": { "type": "humanoid", "avatarName": "avatarAvatar", "hipsBone": "pelvis" },
  "animations": {
    "standing": { "clipName": "Standing", "durationSeconds": 2.50000024, "loop": true },
    "walking": { "clipName": "Walking", "durationSeconds": 1.33333337, "loop": true },
    "seated": { "clipName": "Seated", "durationSeconds": 1.66666675, "loop": true }
  },
  "platformAssets": [
    {
      "platform": "windows-x86_64",
      "format": "unity-assetbundle",
      "unityVersion": "6000.6.0f1",
      "assetName": "assets/art/avatars/campus-ash/avatar.prefab",
      "sha256": "<64 lowercase hexadecimal characters>",
      "byteLength": 123,
      "data": "<raw base64 bytes, without a data URL prefix>"
    },
    {
      "platform": "macos-universal",
      "format": "unity-assetbundle",
      "unityVersion": "6000.6.0f1",
      "assetName": "assets/art/avatars/campus-ash/avatar.prefab",
      "sha256": "<64 lowercase hexadecimal characters>",
      "byteLength": 123,
      "data": "<raw base64 bytes, without a data URL prefix>"
    }
  ]
}
```

The representation has its own version, independent of WebSocket protocol version 1. `masterRevision` is a positive 32-bit integer. Model height and all clip durations are finite positive numbers. Standing, walking and seated clips loop. Both supported desktop platform bundles are required, built with the same recorded Unity version. Every bundle is 8 bytes to 64 MiB, starts with `UnityFS\0`, and matches its SHA-256 and byte count. The Java reader validates the manifest and integrity, while the actual Unity loader additionally checks the prefab, valid Humanoid Avatar, bound renderers, controller and three matching clips. A Unity container signature alone does not prove mesh, animation or platform runtime acceptance.

Bundle bytes travel inline to preserve the existing Room pinning lifetime without an independent asset catalogue or file reader. Download once per collection, verify the hashes, and create every Avatar from its published `assetName` before presenting the Room. `model.sourceSha256` identifies the reviewed exported GLB/FBX; Blender master provenance and private QA records stay in the authoring workspace. Client rendering never supplies catalogue membership or cosmetic authorization.

The active publication is Ash and Lea, using the exact retained free Quaternius Standard releases documented in [the source inventory](../../campus/assets/sources/quaternius-character/README.md). `quaternius_author.py` combines the supplied base/head, hairstyles, plain clothed components and in-place actions inside fresh Blender processes. The packed editable derivatives retain imported topology, UVs, skinning, textures and a hidden unchanged full body for inspection. Revision 1 is preserved with its rejected full-body overlap; revision 2 explicitly selects a nonempty skinned head and excludes the base body from the runtime export. [The extracted-input guide](../../campus/assets/avatars/sources/quaternius/README.md) records bone mapping, texture repairs and regeneration commands. The script refuses existing master revisions; a repair requires an explicit new revision and private registration.

`PUtown.Editor.QuaterniusAvatarBuild.BuildCandidates` imports the current exported FBX and supplied textures, maps the 65-joint source rig to Unity Humanoid, restores native materials, creates `Standing`, `Walking` and `Seated` states, normalizes height/pivot and builds both desktop bundles. It checks the registered master hash and writes drafts with empty review checks. `RenderCandidates` creates actual Unity front/back/side/walking/seated evidence. Inspect the current outputs and record the required review before publishing; rebuilding a draft clears its approval and does not replace publication. The recorded reports supply exact clip durations and Avatar identities. No Windows runtime pass is inferred from a build.

Use the saved prefab's actual `name` for `model.rootNode`; the input GameObject name can differ after `SaveAsPrefabAsset`. Ash and Lea have root `avatar`, Humanoid Avatar `avatarAvatar`, and source Hips bone `pelvis`. `AvatarBuild.ReportAndValidateMacBundles` reads the publication and retained macOS bundles, writes each `unity-bundle-report.json`, and refuses differences in root identity, instantiated Humanoid identity, clip duration/loop, bundle bytes, hash or Unity version. It does not rebuild or alter a bundle. Set `PU_TOWN_REPOSITORY` to the repository's absolute path when invoking these editor methods from an isolated project so the publication and evidence resolve to the intended workspace.

Rowan and Mira remain historical starters authored through `blender_author.py` inside Blender MCP, with preserved v1/v2 sources, immutable registered masters and pose evidence. `AvatarBuild.BuildAndReview` remains their import/build path. Their rig's `Hips` name and original clip durations differ from the current Quaternius collection; never copy those identities into a new design. No paid character asset or external model-generation service was used.

The opt-in PlayMode test `PUtown.IntegrationTests.NativeAvatarRoomTests.PublishedRoomAvatarsLoadAndInstantiateWithTheirDeclaredIdentity` creates a real Room, applies its native campus selection through Game frames, fetches that Room's pinned collection through the strict runtime loader, and instantiates every published design to inspect its Humanoid bones and three playable clips. Set `PU_TOWN_NATIVE_AVATAR_E2E=1` and `PU_TOWN_NATIVE_AVATAR_WS=ws://127.0.0.1:8080/ws/game` against a Java backend configured for this native publication. A metadata republish requires a new Room; existing Rooms preserve the collection they pinned.

Use the private workspace commands from the repository root:

```sh
python3 tools/native-avatars/authoring.py --workspace campus/assets/avatars register-master campus-ash 3 campus/assets/avatars/sources/campus-ash/v3/avatar.blend provenance.json
python3 tools/native-avatars/authoring.py --workspace campus/assets/avatars save design.json
python3 tools/native-avatars/authoring.py --workspace campus/assets/avatars validate campus-ash campus-lea
python3 tools/native-avatars/authoring.py --workspace campus/assets/avatars --publication campus/assets/avatars/publication.json publish campus-ash campus-lea
python3 tools/native-avatars/test_authoring.py
```

A provenance JSON records `author`, `source`, `license`, `licenseRecordedAt` (ISO date), and `exportEntitlement`. Registration retains an immutable source copy and its SHA-256. Repairs require a new revision and renewed dependent design checks.

A private saved design has `{id, name, native, review}`. Its model replaces public `sourceSha256` with private workspace-relative `sourceFile`; each platform asset replaces public integrity/data fields with private `file`. The review has `sourceSha256`, `platformSha256` keyed by both platform IDs, `checks` containing exactly `silhouette`, `scale-pivot`, `uv-normals`, `deformation`, `native-materials`, `standing`, `walking`, `seated`, and nonempty workspace-relative `evidenceFiles`. Publication refuses a changed model or bundle until its recorded review is renewed. Evidence records require a human or agent to perform the stated inspection; the CLI checks their presence and identity and does not invent an art review.

Saving a draft and registering a master never changes publication. Publish validates every selected distinct design, embeds runtime bundles, fsyncs the complete temporary JSON, then atomically replaces the chosen artifact. A running backend keeps its last good collection when the file is malformed, missing or incomplete; cold startup fails explicitly. Do not expose this workspace, masters, drafts, scripts or review records through the Player build.

Downloaded archives, extracted binary imports, Blender masters, duplicate exports, platform bundles and the embedded publication stay local under the repository upload policy. Source metadata, reviews and selected smaller native imports remain in Git. A fresh clone cannot recreate immutable master hashes merely by downloading packs; restore a reviewed private workspace or author and review a new revision. See [local asset storage](../native-assets/README.md). The real authored-publication Java test is opt-in with `PU_TOWN_NATIVE_AVATAR_E2E=1`; ordinary server tests keep their self-contained contract fixtures.
