# KayKit native Avatar workspace

The active native collection uses all five free **KayKit Adventurers 2.0** with
**KayKit Character Animations 1.1**: Barbarian (`kaykit-barbarian`), Knight
(`kaykit-knight`), Mage (`kaykit-mage`), Ranger (`kaykit-ranger`) and Rogue
(`kaykit-rogue`). The exact free archives, hashes and included CC0 licenses are
recorded in [the source inventory](../sources/README.md).

Each private Blender master retains original topology, UVs, skin weights and its
unchanged supplied atlas. `Idle_A`, `Walking_A` and `Sit_Chair_Idle` become Unity
`Standing`, `Walking` and `Seated`. Carried weapons are excluded. The Ranger's
quiver remains hidden in the editable master and outside its runtime export.
The source Medium rig maps to a valid Humanoid with source Hips bone `hips`.

All current prefabs have root `avatar`, Humanoid Avatar `avatarAvatar`, +Z forward,
feet pivot and measured standing mesh height 1.7 metres. Standing and walking
loop for `1.06666672` seconds and seated for `3.60000014` seconds. Root motion is
disabled. `exports/{id}/unity-report.json` and `unity-pose-report.json` record the
actual per-design identities and costs. Unity front/back/side/walking/seated PNGs
and `review.json` record inspected visual evidence. A bundle build does not
establish Windows runtime or sustained gameplay performance.

`masters/{id}/v1/master.json` records each immutable private master and provenance.
`drafts/` stores source/bundle hashes and the required review checks.
`exports/{id}/` retains compact reports and rendered evidence in Git. Original
archives, editable `.blend` files, duplicate FBX/texture exports, target bundles
and `publication.json` remain ignored local artifacts under the upload policy.
Restore the reviewed private workspace or author and review a new revision;
downloading the packs cannot recreate an earlier Blender master's exact hash.

The Java backend is the sole reader of `publication.json`, a validated version 2
collection containing both supported Unity 6000.6.0f1 platform bundles for all
five designs. From `backend/`, configure
`--putown.avatars.publication=file:../towns/assets/avatars/publication.json`.
Rooms pin the complete collection at creation, so publication affects new Rooms
only. The Unity Player fetches that Room's collection over HTTP; no authoring
catalogue or draft is shipped as an independent Player catalogue.

[The authoring guide](../../../tools/native-avatars/README.md) covers source
registration, candidate creation, render review, strict validation and atomic
publication. Saving a draft or rebuilding a candidate never publishes it.
