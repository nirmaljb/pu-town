# Three furnished, animated PU Town maps

Each map is 7680 × 4320px (240 × 135 tiles at 32px), nine times the original area. **Sunwater Village** is the playable default. **Blackthorn Hollow** and **Neon Ward** are editable alternatives.

All three now use the supplied `tilesets.rar` terrain, detailed whole-building and furniture sprites, and multi-frame trees, bushes, animals and water effects. The former 16px exterior studies are superseded. Village uses the original warm colors; horror uses desaturated slate and autumn colors; cyberpunk uses blue/cyan recolors with neon details. Moving scenery remains cosmetic; collision footprints are fixed and server-owned.

## Interiors

- Village: Chapel, Inn, Smithy, General Store, Mill house, Farmhouse, Market tavern, Woodland lodge, Harbor store and Workshop.
- Horror: Abandoned abbey, Mortuary, Old infirmary, Deadwood refuge, Flooded mill and Quarantine ward.
- Cyberpunk: Data exchange, Hydroponics lab, Night market lounge, Transit control, Canal power station and Repair bay.

Open-top rooms use differentiated floors, shelves, tables, beds, counters, rugs and workstations from the supplied pack. Their entrances and central aisles remain open. Existing village Task destinations and four original interior identities are retained. Village district interiors are also synchronized with backend/frontend area boundaries. All room centres, retained Seats and Task markers are reachable from the square.

## Preview and authoring

Serve this folder with `python3 -m http.server 5188 --bind 127.0.0.1` and visit http://127.0.0.1:5188. The viewer supports live animation, pan/zoom, theme selection, direct interior navigation and landmarks. It honors the operating system's reduced-motion preference. The Player app honors its own reduced-motion setting.

Each theme contains `map.json` (editable Tiled JSON), `collision.json`, `tiles.png`, `supplied/` object sheets, `interiors.json`, `motion.json`, `base-map.png`, `full-map.png`, `overview.png`, `square-detail.png` and individual `interior-*.png` previews. `base-map.png` omits animated sprites, allowing the viewer to play frames without painting duplicates. The Tiled objects retain their actual frame metadata for Phaser. Copy the complete theme directory when editing it outside the repository.

From the repository root, with Pillow installed:

```sh
python3 pu-town/variants/generate.py
python3 pu-town/variants/publish.py
```

The deterministic generator validates flood-fill connectivity and 14px foot clearance at Seat/Task destinations. `publish.py` copies the village and all referenced sheets, then regenerates shared collision rectangles, ten interior areas and twenty backend Task locations. Alternative interior markers are design locations, not runtime map-selection options. Multiplayer travel balance still needs human playtesting.

## Sources and rights

The supplied archive is retained as extracted PNG/TSX sources in `assets/supplied/tilesets/`. Its SHA-256 is recorded in `assets/sources.json`. **No license file was included in the archive; it is not labeled CC0 and redistribution rights are not inferred.** The user's explicit request authorizes its local use, without establishing a third-party license.

The earlier Kenney CC0 archives remain vendored with their own licenses and source hashes. Those licenses cover those archives only. Credits in the Player app distinguish the supplied material from the former CC0 atlases.

[Dave Tamayo's Fungle design account](https://www.davetamayo.com/innersloth-features1/thefungle) and [Amit Patel's route analysis](https://www.redblobgames.com/pathfinding/all-pairs/) informed multiple routes and clear entrances. Their application here is design inference, not proof of map balance.
