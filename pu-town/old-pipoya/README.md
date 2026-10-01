# PU Town map

2560×1440 px (80×45 tiles, 32 px), built from the Pipoya RPG Tileset 32x32. Matches the game's world size and
leaves the emergency button spot (1280, 742) open in the middle of the Town Square.

| File | Use |
|---|---|
| `pu-town.tmx` + `tilesets/*.tsx` | Edit it in Tiled |
| `pu-town.json` | Tiled JSON with the tilesets embedded, so Phaser can load it directly (`this.load.tilemapTiledJSON`) |
| `tilesets/*.png` | Tileset images; both map files look for them at `tilesets/` |
| `pu-town.collision.json` | Plain data for the server and client rules: obstacles, spawns, zones, task spots, and a walkable grid (`#` = blocked) |
| `pu-town-preview.png`, `pu-town-collision-preview.png` | Pictures of the map for reference; the game doesn't need them |

## Layers (bottom to top)
`ground`, `terrain` (paths and plaza), `grass_detail`, `water` (animated in Tiled), `buildings`, `details`, `props`
are drawn **below** the players. `above` holds tree canopies, roof ridges, awnings and lamp tops. Draw it **above**
the players (it has the property `depth = above-players`) so avatars can walk behind them.

Object layers:
- `collision`: 120 merged rectangles (the whole forest border, buildings, trees, water, props). Replace
  `RoomRules.OBSTACLES` / `OBSTACLES` in `room-rules.ts` with these. Every walkable tile is reachable from the button.
- `spawns`: 10 points arranged around the button.
- `points`: `emergency_button` (1280, 742), plus 12 optional `task` spots for Among Us style tasks later.
- `zones`: named areas (Town Square, Town Hall, Farm, Orchard, Fountain Garden, Chapel, Graveyard, Market, Pond,
  Smithy, Lumber Yard, Residences, Meadow). You can use them for location names or task placement.

## Phaser sketch
```ts
this.load.tilemapTiledJSON('pu-town', 'maps/pu-town/pu-town.json');
this.load.image('base', 'maps/pu-town/tilesets/[Base]BaseChip_pipo.png'); // likewise for paths, water, flowers
// create():
const map = this.make.tilemap({ key: 'pu-town' });
const sets = ['base', 'paths', 'water', 'flowers'].map(n => map.addTilesetImage(n, n)!);
for (const l of ['ground','terrain','grass_detail','water','buildings','details','props']) map.createLayer(l, sets);
map.createLayer('above', sets)!.setDepth(1000);   // above avatars
```
