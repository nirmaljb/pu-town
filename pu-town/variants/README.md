# Three furnished, animated PU Town maps

**Sunwater Village** is the playable default. Village and **Blackthorn Hollow** are 7680 × 4320px (240 × 135 tiles at 32px). **Silver Jubilee Campus**, retained under the `cyberpunk` asset/wire identifier, is 4096 × 4480px (128 × 140 tiles).

All three maps use the supplied `tilesets.rar` terrain, detailed whole-building and furniture sprites, and multi-frame trees, bushes, animals and water effects. The former 16px exterior studies are superseded. Village uses the original warm colors; horror uses desaturated slate and autumn colors; Silver Jubilee Campus uses the same supplied grass, interior floors/brickwork, barracks roof artwork, desks, chairs, shelving, windows and animated oak/pine/bush sheets, with a warm night tint. Its road geometry and radial building footprints follow the owner’s campus references. The screenshots are design references only and are not redistributed as map textures. Moving scenery remains cosmetic; collision footprints are fixed and server-owned.

## Interiors

- Village: Chapel, Inn, Smithy, General Store, Mill house, Farmhouse, Market tavern, Woodland lodge, Harbor store and Workshop.
- Horror: Abandoned abbey, Mortuary, Old infirmary, Deadwood refuge, Flooded mill and Quarantine ward.
- Silver Jubilee Campus: Block A Seminar Room, Block B Research Lab, School of Social Sciences, Electronic Media, UMSARC and Central Building. Unidentified buildings use neutral names and all interiors are gameplay interpretations.

Open-top rooms use differentiated floors and furniture; campus teaching rooms and labs reuse the supplied furniture. Their entrances and central aisles remain open. Existing village Task destinations and four original interior identities are retained. Village district interiors are also synchronized with backend/frontend area boundaries. All room centres, retained Seats and Task markers are reachable from the square.

## Preview and authoring

Serve this folder with `python3 -m http.server 5188 --bind 127.0.0.1` and visit http://127.0.0.1:5188. The viewer supports live animation, pan/zoom, theme selection, direct interior navigation and landmarks. It honors the operating system's reduced-motion preference. The Player app honors its own reduced-motion setting.

Each theme contains `map.json` (editable Tiled JSON), `collision.json`, `tiles.png`, `supplied/` object sheets, `interiors.json`, `motion.json`, `base-map.png`, `full-map.png`, `overview.png`, `square-detail.png` and individual `interior-*.png` previews. `base-map.png` omits animated sprites, allowing the viewer to play frames without painting duplicates. The Tiled objects retain their actual frame metadata for Phaser. Copy the complete theme directory when editing it outside the repository.

From the repository root, with Pillow installed:

```sh
python3 pu-town/variants/generate.py
python3 pu-town/variants/publish.py
```

The deterministic generator validates flood-fill connectivity and 14px foot clearance at Seat/Task destinations. `publish.py` copies the village and all referenced sheets, then regenerates shared collision rectangles, ten interior areas and twenty backend Task locations. The Host can choose each theme in the Lobby. The publisher also emits each town’s rules into frontend assets and backend resources, so movement, Tasks and interior privacy follow the accepted selection. To regenerate only the campus and publish its catalogue without rebuilding the other artwork:

```sh
python3 -c 'import sys; sys.path.insert(0,"pu-town/variants"); import generate; from campus import generate_campus; generate_campus(generate)'
python3 pu-town/variants/publish_catalogue.py
```

Each map owns its bounds and Meeting Area; publication preserves the overview aspect ratio. The campus has six rooms, two open academic courtyards, ten Task destinations, an outer road loop, an inner ring and a southern roundabout. Multiplayer travel balance still needs human playtesting.

## Sources and rights

The supplied archive is retained as extracted PNG/TSX sources in `assets/supplied/tilesets/`. Its SHA-256 is recorded in `assets/sources.json`. **No license file was included in the archive; it is not labeled CC0 and redistribution rights are not inferred.** The user's explicit request authorizes its local use, without establishing a third-party license.

The earlier Kenney CC0 archives remain vendored with their own licenses and source hashes. Those licenses cover those archives only. Credits in the Player app distinguish the supplied material from the former CC0 atlases.

[Dave Tamayo's Fungle design account](https://www.davetamayo.com/innersloth-features1/thefungle) and [Amit Patel's route analysis](https://www.redblobgames.com/pathfinding/all-pairs/) informed multiple routes and clear entrances. Their application here is design inference, not proof of map balance.
