# Supplied town artwork

The active native environments are Woodland Village and Market Town. They use
retained free Quaternius Nature and Medieval Village sources, plus Chair_1, Bench
and Table_Large from the existing Fantasy Props imports. Kalapet campus art is
retired from the Player build.

Exact source hashes, included licenses, selected meshes/textures and material
maps are in [the source inventory](../../../../towns/assets/sources/README.md).
The importer verifies original ZIP bytes and copies selected models/textures
unchanged. Derived channel textures live in `TownDerivedTextures`; generated
materials live in `TownMaterials`. None of the active runtime textures exceed
5 MiB. Local archive/master/bundle/publication exclusions remain in `.gitignore`.

`GeneratedTownBuild.Prepare` uses each town's canonical JSON and builds
`Resources/Towns/{mapId}Garden.prefab`. Walls and roofs fit solid authoritative
building footprints. Closed doors and shutters decorate filled walls; there are
no enterable interiors. Market counters and wells use published obstacles.
Meeting chairs keep all ten retained Seats clear. Art has no movement Colliders.

Original Built-in shaders preserve supplied texture/material detail. Town Ground
adds subtle meadow/earth variation; Foliage supplies cutout leaves and decorative
wind. A `_Visibility` dither parameter lets the camera fade intervening vegetation.
Opaque buildings use a local fade material only when needed. `Building:` and
`Vegetation:` groups define these presentation objects, independently of accepted
movement, Hearing and server-authorized Vision.

From the repository root:

```sh
python3 tools/towns/publish.py --check
unity run native --editor-version 6000.6.0f1 -- -executeMethod PUtown.Editor.GeneratedTownBuild.BuildAndReview -logFile /tmp/putown-town-review.log
```

Actual Editor camera renders and mesh/material counts live in each
`towns/{mapId}/previews/`. Inspect these after material/placement changes. Geometry
boards, Editor renders, packaged gameplay and hardware performance are distinct
evidence; a render or successful build cannot establish ten-Player runtime load.
