# Quaternius Standard authoring inputs

Selected unchanged files were extracted from the three archives retained under
`campus/assets/sources/quaternius-character/`. License and exact archive hashes
are recorded there. These directories are private authoring inputs, excluded
from the Player runtime.

`base-characters/` contains the free full bodies, compatible hairstyle exports
and textures. `modular-outfits/` contains textured Peasant/Ranger outfits and
plain Peasant palette alternatives. `animation-library/` contains the creator's
in-place and root-motion FBX/GLB files and original instructions.

All inspected character/outfit skins and the animation skeleton use 65 joints.
The important Unity Humanoid mapping is:

| Unity bone | Source bone |
| --- | --- |
| Hips | `pelvis` |
| Spine / Chest / UpperChest | `spine_01` / `spine_02` / `spine_03` |
| Neck / Head | `neck_01` / `Head` |
| Shoulders | `clavicle_l` / `clavicle_r` |
| Upper arms / lower arms / hands | `upperarm_l/r` / `lowerarm_l/r` / `hand_l/r` |
| Upper legs / lower legs / feet / toes | `thigh_l/r` / `calf_l/r` / `foot_l/r` / `ball_l/r` |

The useful free actions include `Idle_Loop`, `Walk_Loop`, `Walk_Formal_Loop`,
`Sitting_Idle_Loop`, `Sitting_Enter`, `Sitting_Exit`, `Fixing_Kneeling` and
`PickUp_Table`. `animation-library/inspection.json` records all actual GLB action
and bone names. The native movement contract uses in-place animation, with root
motion disabled.

To regenerate the two new private derivatives from the retained inputs, run
each in a separate fresh Blender 5.2.2 process from the repository root:

```sh
Blender --background --factory-startup --python tools/native-avatars/quaternius_author.py -- campus-ash
Blender --background --factory-startup --python tools/native-avatars/quaternius_author.py -- campus-lea
```

In a checkout that already retains revision 2, inspect that master directly.
For an intentional new derivation or repair, append a new revision number, for
example `-- campus-ash 3`. The script rejects an existing source/master revision
instead of replacing it. Register the new master through the private workshop
before building its draft; publication still requires a new review.

The script combines plain clothed outfit components with a derived head and a
supplied hairstyle, copies three supplied in-place actions and packs retained
textures into an editable master. The unchanged original full body remains
hidden in the master so the head crop is reviewable. Stale `_png.png` texture
URI aliases in the Standard export are resolved in a temporary import document;
the original files and archive hashes remain unchanged.

The active Ash/Lea publication uses master revision 2. Revision 1 selected a rig widget
through an overly broad mesh filter, leaving the full base body beneath the
clothes. It is preserved byte for byte; revision 2 explicitly selects the
Superhero body, validates a nonempty skinned head crop and excludes the original
body from export. Each corrected design has eight nonempty skinned meshes:
head, eyes, eyebrows, four clothed parts and hairstyle. Blender's actual exported
mesh counts are 18,791 triangles for Ash and 22,120 for Lea; these counts do not
establish runtime frame performance. Ten actual Unity front/back/side/walking/
seated renders were inspected for the corrected designs before publication;
the reports and review records are retained under `exports/campus-ash/` and
`exports/campus-lea/`. Windows compilation does not establish Windows rendering.

`PUtown.Editor.QuaterniusAvatarBuild.BuildCandidates` imports each exported FBX
into Unity, maps the actual Humanoid bones, restores native textured materials,
creates three animation states, normalizes height/pivot and builds platform
bundles. It writes private drafts with empty review checks and never replaces
the pinned publication. Actual silhouette, clothing fit, materials, deformation,
walking and seating must be reviewed before publication.

Native material adaptation retains the supplied base-color and normal maps,
converts packed roughness/metallic channels to Standard shader smoothness,
uses the supplied alternate Peasant cloth palette for Lea and tints the supplied
hair map dark brown. Original maps remain unchanged. Texture imports use a
1,024-pixel maximum with mipmaps; final compressed runtime cost is measured in
Unity separately.
