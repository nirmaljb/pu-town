# Quaternius campus garden

The active garden combines selected original FBX models and PNG textures from three free Quaternius Standard packs:

| Import folder | Retained pack | Selection |
| --- | --- | --- |
| `Nature/` | Stylized Nature MegaKit | Broadleaf trees, shrubs, grass, flowers and stones: 26 models, 20 textures |
| `City/` | Downtown City MegaKit | Modern facade, roof, paving, planter and service pieces: 38 models, 33 textures |
| `Props/` | Fantasy Props MegaKit | Neutral furniture, books, containers and dining props: 31 models, 13 textures |

The complete original ZIP archives, their included `License_Standard.txt` files, SHA-256 hashes and source URLs live in [the retained source inventory](../../../../campus/assets/sources/quaternius/README.md). These exact releases carry the older explicit CC0 1.0 dedication. The current generic Quaternius website license presents a newer QAL license; the inventory preserves that discrepancy and page evidence. Keep each archive with its own license and provenance when changing the selection. Paid Pro/Source engine projects and shaders were not acquired.

Complete Standard archives are local downloads excluded by `.gitignore`. Before a fresh-clone Unity build, follow [local asset storage](../../../../tools/native-assets/README.md) to restore the original textures over 5 MiB from hash-pinned archives. Check an archive's length and SHA-256 against `provenance.json` before extracting a replacement. The `Nature-selection.json`, `City-selection.json` and `Props-selection.json` inventories identify every copied model/texture path, original hash and exact material mapping. Keep unmodified imports in `Models/` and `Textures/`; generated materials and channel conversions belong in `Materials/` and `DerivedTextures/`.

Nature and City use the supplied Unity FBX exports; Props uses the supplied general FBX. Material mappings come from each pack's matching glTF exports. Supplied OpenGL normal maps are imported as normal maps; alternate Unreal versions are excluded. Albedo retains sRGB sampling, while ORM and derived maps are linear. City/Props ORM channels are occlusion R, roughness G and metallic B. The builder derives Unity Standard metallic R and smoothness A (`1-G`), plus grayscale occlusion from R. Source textures stay unchanged. Standard's missing paid fake-interior shader receives a muted fallback, and glass uses a simple transparent Standard material.

`PUtown.Editor.QuaterniusCampusBuild.Prepare` imports the selected sources, creates shared instanced materials, prepares `Assets/PUtown/Resources/Campus/GardenGround.mat`, and saves `Assets/PUtown/Resources/Campus/CampusGarden.prefab`. The combined garden contains textured building modules, furniture, Seat chairs, path planting, groves and water. Original campus lantern, solar, gate and court pieces supply selected identity details. Facade and paving fits follow canonical rectangles; furniture and vegetation use uniform fits. `Exterior:`, `Furniture:`, `Seat:` and `Landscape:` identifiers let the runtime apply existing visibility and avoid duplicate fallback art. The builder removes art Colliders. Cosmetic planting and shading do not change collision, interior separation, Task reachability or server-authorized sight.

The shaders in this directory are original project code for Unity's built-in rendering pipeline:

- `QuaterniusFoliage.shader` uses supplied albedo/normal detail, double-sided alpha cutout and matching shadow cutout. The autumn bush material receives a green garden tint while retaining texture detail and transparency.
- `CampusGardenGround.shader` combines the supplied City soil texture with subtle world-space green/earth variation and low smoothness.
- `CampusGardenWater.shader` adds gentle animated normals and teal variation. Its ground/sand shoreline fades inside the exact canonical water rectangle, without moving the mesh or its gameplay boundary.
- `CampusSurfaceNoise.cginc` supplies shared deterministic surface variation for ground and shoreline shading.

From the repository root, close the project's Editor before running batch authoring. With `UNITY_EDITOR` set to the pinned Unity executable:

```sh
python3 tools/campus/publish.py --check
"$UNITY_EDITOR" -batchmode -quit -projectPath "$PWD/native" -executeMethod PUtown.Editor.QuaterniusCampusBuild.BuildAndReview -logFile /tmp/putown-garden-review.log
```

`Prepare` regenerates assets without rendering previews. `BuildAndReview` also creates actual Editor camera renders under `campus/assets/sources/quaternius/previews/` and writes `unity-garden-costs.json`. The preview camera uses pitch 48°, yaw 35°, distance 8.5 m, focus height 0.85 m and field of view 45°, with Day/Night lighting. `render-context.json` records the actual Avatar prefab selected for the preview. For an isolated Unity checkout, set `PU_TOWN_REPOSITORY` to the source repository's absolute path before running either method. Copy back intended generated assets together with their `.meta` files; retain the original imports and archive hashes.

Inspect the new renders after every material or placement change. They show authored geometry and shading, and mesh/material counts describe asset cost. Packaged gameplay, frame pacing, ten-Player voice load and Windows runtime acceptance require separate checks. Active Ash/Lea Avatar authoring and publication are documented in [the Avatar workspace](../../../../campus/assets/avatars/README.md), outside this environment builder.
