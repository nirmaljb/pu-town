# Historical native Avatar workspace

The active native collection has moved to [the five KayKit Adventurers](../../../towns/assets/avatars/README.md). This directory retains the retired Quaternius and Blender starter provenance and review evidence. It is outside the active publication and Player build.

The retired native collection in local `publication.json` was **Ash** (`campus-ash`) and **Lea** (`campus-lea`). Each combines retained Quaternius free Standard base/head, hairstyle, plain Peasant clothing and in-place animation exports. The original full base body remains hidden in the editable Blender master and is excluded from the clothed runtime representation. Original pack archives, included CC0 notices, upload dates and hashes live in [the character source inventory](../sources/quaternius-character/README.md); its license record distinguishes these specific older releases from the creator's newer general website license.

`publication.json` is the validated native version 2 artifact for the Java backend's existing single publication reader. It is not copied into the Unity Player catalogue. During migration the default sprite publication remains in `backend/data/published-avatars.json`; historical native integration selected this artifact with `--putown.avatars.publication=file:../campus/assets/avatars/publication.json` when starting from `backend/`. Rooms pin the artifact they resolve at creation. Re-Publishing affects new Rooms only.

The publication contains Windows x86_64 and macOS universal Unity 6000.6.0f1 AssetBundles for both designs, with embedded bytes, SHA-256 and length. The native prefabs, textured materials and looping Animator controllers are in `native/Assets/Art/Avatars/`. Both models have prefab root `avatar`, valid Humanoid Avatar `avatarAvatar`, Hips mapping to source bone `pelvis`, feet pivot, +Z forward and normalized 1.7-metre height. Controller states and clips are `Standing` (approximately 2.5 seconds), `Walking` (1.333 seconds) and `Seated` (1.667 seconds); manifests retain their actual Unity durations. Root motion is disabled.

Both platform bundles built successfully in an isolated Unity project. Ten actual Unity front/back/side/walking/seated renders were inspected after the explicit v2 head-crop repair: continuous clothing and head/neck joins, dark hair, supplied albedo/normal maps and bound pose deformation are visible. Revision 1 is preserved byte for byte and records the rejected full-body overlap; revision 2 excludes that body from export. Registered immutable master copies, source hashes and provenance live under `masters/`. See each design's `native-review.md`, `repair-record.md`, `unity-report.json` and `unity-pose-report.json`. These inspections establish rendered model evidence; packaged gameplay, sustained performance and Windows runtime acceptance require their own checks.

| Design | Unity vertices | Triangles | Skinned parts | Windows bundle | macOS bundle |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ash | 12,459 | 18,791 | 8 | 6,585,466 bytes | 6,602,272 bytes |
| Lea | 16,831 | 22,120 | 8 | 5,419,428 bytes | 5,397,133 bytes |

These are measured asset costs, not a frame-rate result. No paid Source/Pro assets or external model-generation service was used. The Peasant clothing retains leather boots/cuffs from the licensed source. Rowan and Mira are historical Blender MCP starters; their original v1/v2 sources, registered masters, drafts and evidence remain retained, but they were outside that retired Quaternius publication.

Draft JSON, reviews, source masters, Blender/Unity scripts and authoring operations remain outside the Player application. [The authoring guide](../../../tools/native-avatars/README.md) documents source registration, validation, review hashes and atomic publication. The actual CLI is `tools/native-avatars/authoring.py`; changing a model or platform bundle invalidates its recorded review until the design is re-inspected.

Large private authoring binaries, duplicated exports, generated bundles and publication are excluded from Git. Their existing local bytes are preserved. A fresh clone must restore a reviewed private workspace or author/review new revisions before publishing; see [local asset storage](../../../tools/native-assets/README.md).
