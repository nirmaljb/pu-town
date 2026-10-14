# Watabou town authoring

The two fixed native towns come from actual execution of
[TownGeneratorOS](https://github.com/watabou/TownGeneratorOS), pinned to
`7fbc87a9398cc508af24de93f79cf2ad027f352b`. Woodland Village uses size `8`, seed
`20261014`; Market Town uses size `12`, seed `20261015`. These are authoring
settings, never per-Room runtime generation.

`vendor/TownGeneratorOS` retains the exact relevant upstream geometry, ward and
utility source bytes, original README/project configuration and GPL-3.0 license.
`vendor/OpenFL` retains the exact OpenFL 8.9.0 math/error support types needed by
the exporter, their object pool, package metadata and MIT license.
`vendor/upstream.json` records every selected file hash. This is the selected
source generator; no alternative generator or handcrafted substitute supplies
the streets or districts.

The separate `ExportLayout.hx` constructs `Model` and serializes its public
geometry without creating a Stage, CityMap or game window. The headless source
copy lives under ignored `.scratch/native/towns/`. Three compatibility edits are
applied to that copy: remove an unused `openfl.Lib` import, qualify an abstract
array extension call, and annotate an existing Float density array. Geometry
algorithms and seeded randomness remain unchanged. The display application's
Lime/msignal dependencies are not loaded by this math-only entry point.

Generation was verified with the local Haxe `4.3.7` macOS distribution recorded
in the manifest. Install/use that compiler independently, or unpack its official
archive under `.scratch/native/towns/`; keep compiler binaries and downloaded
archives local. `PU_TOWN_HAXE=/absolute/path/to/haxe` selects a compiler explicitly.
No compiler is required for ordinary publication/checking of the saved layouts.

```sh
# Execute the original seeded models and retain their actual exported geometry.
python3 tools/towns/export.py
python3 tools/towns/export.py --check

# Fit modular exterior footprints and retain the original district/street plan.
python3 tools/towns/author.py
python3 tools/towns/author.py --check

# Validate and publish matching Java/Unity geometry.
python3 tools/towns/publish.py
python3 tools/towns/publish.py --check
python3 tools/towns/test_towns.py

# Optional Pillow review board of the actual geometry, not final supplied artwork.
python3 tools/towns/render_preview.py
```

`towns/{woodland,market}/watabou.json` is the raw model export, including source
polygons, typed wards, building/prop/grove geometry, gates, walls and roads.
`recipe.json` records the compact crop, conversion scale and foliage seed.
`layout.json` is the canonical playable publication. `author.py` regenerates it
deterministically from those inputs and records the raw export's SHA-256.

The adapter preserves the original main road bends and district polygons. It
clips distant outer roads to compact playable bounds, fits axis-aligned modules
at original building centres within their wards, and omits footprints that are
too small or crowded for a 2.4-metre minimum exterior. Market fountain/statue
polygons and park grove polygons preserve their semantics and never become house
obstacles. The raw walls remain provenance; this slice does not create a separate
walk-blocking city-wall system. Both towns use non-enterable buildings, empty
interiors and disabled Tasks.

Each fitted building and its authoritative solid rectangle have identical
coordinates. Shared feet radius is `14`, server accepted speed `240`, native
predicted speed `225`, and conversion `100` server units per Unity unit. All ten
retained Seats use the existing `(330,205)` offsets around the source plaza.
Vegetation is decorative. Solid wells and market tables are explicit canonical
furnishings with matching art and authoritative obstacles; other landmark dressing
introduces no hidden collision or visibility rule.

Publication writes byte-identical files to
`backend/src/main/resources/maps/{mapId}.json` and
`native/Assets/PUtown/Resources/Towns/{mapId}.json`. Native artwork uses the distinct
`Resources/Towns/{mapId}Garden.prefab` path. `reachability.json` records independently
collision-checked routes to all Seats, public landmarks and preserved road
endpoints. The longest public outward trips are 17.13 seconds for Woodland and
15.49 seconds for Market at native walking speed, within the accepted 15–20
second target. These measurements exclude conversation and pauses.

`--check` verifies source hashes, deterministic authoring, exact shared constants,
solid exterior alignment, outdoor/Task boundaries, all public/Seat access, road
clearance, travel budget and publication freshness. The boundary tests also
reject enabled workload, art/collision drift and a landmark inside a solid house.

Unity's `GeneratedTownBuild.Prepare` makes one continuous, mitered paving strip
per saved road and one elliptical square surface covering the retained Seats.
Original stone textures use world-space UVs so stone scale stays consistent at
bends. Woodland adds a cosmetic strip through the open west approach to the
square, plus planting at the square's edges. These surfaces and plants add no
Colliders and do not change `layout.json`, authoritative obstacles or reachability.

The ground shader combines the existing meadow textures with fine procedural
detail and a derived 512×512 mask for earth shoulders beside paving and building
foundations. The mask is a presentation input, never a collision map. Original
asset provenance and licenses remain unchanged.

Generated mesh `.asset` files in `native/Assets/Art/Quaternius/TownDerivedMeshes`
and town Garden prefabs are local build artifacts. Retain their `.meta` files and
the small mask PNGs/materials; regeneration upserts meshes while keeping GUIDs.
Run the native `BuildAndReview` method for actual camera renders of both towns,
and inspect Woodland's square and west approach before committing a visual change.
