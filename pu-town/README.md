# PU Town map (Tiny Swords)

2560×1440 px (80×45 tiles, 32 px): an island town built from **Tiny Swords** (Free Pack + Update 010 for sand,
the dock, the gold mine, the scarecrow and small decorations), with four open-top rooms (Chapel, Inn, Smithy,
General Store) furnished from the **SuperRetroWorld Interior Pack**. Matches the game's world size and keeps the emergency
button spot (1280, 742) open in the middle of the Town Square. The previous Pipoya map is in `old-pipoya/`.

| File | Use |
|---|---|
| `pu-town.tmx` + `tilesets/**/*.tsx` | Edit it in Tiled |
| `pu-town.json` | Tiled JSON with the tilesets embedded, so Phaser can load it directly |
| `tilesets/terrain/*.png` | Water, sand, grass, dock and interior (walls/floors) sheets, used as 32 px tiles |
| `tilesets/objects/*.png` | One horizontal spritesheet per object (buildings, trees, bushes, sheep, rocks, foam, and `int_*` furniture) |
| `pu-town.collision.json` | Plain data for the server and client rules: obstacles, spawns, zones, task spots, and a walkable grid (`#` = blocked) |
| `pu-town-preview.png`, `pu-town-collision-preview.png` | Pictures of the map for reference; the game doesn't need them |
| `generator/gen.py` + `interior.py` | Rebuilds everything above (`python generator/gen.py`, needs Pillow + numpy and the Tiny Swords / SuperRetroWorld folders next to `pu-town/`) |

## Layers (bottom to top)
- `water` (tiles): sea colour everywhere.
- `foam` (objects): animated surf under every coast. Draw it below the terrain.
- `sand`, `grass`, `bridge` (tiles): the island, paths, plaza, beach and pond dock. Tiny Swords tiles are 64 px, so each
  one is written as four 32 px quarters.
- `floor`, `walls` (tiles): the rooms. Each room is a floor, a 2-tile wall face along its north side, and a thin wall
  outline around it, with gaps for doors. The rooms have no roof (Among Us style): you can always see inside.
- `floor_decor` (tile objects): rugs and doormats. Draw them below the players; they don't block.
- `objects` (tile objects, property `ysort = true`): buildings, trees, bushes, rocks, sheep, signs, resources. Tiled's
  object `y` is the **bottom** of the sprite. Give each sprite `depth = y` and the players `depth = their feet y`, so
  players walk behind roofs and tree tops. Animated sheets (trees, bushes, sheep, foam, water rocks, duck) carry their
  frame list and timing in the tileset's `animation`. The object `type` is the asset key (e.g. `pine`, `house1_blue`).
  Buildings also have a `name` (Town Hall, Barn, Watchtower...). Room furniture is here too (`int_*`), so players
  can walk behind shelves and fireplaces.

Object layers with data:
- `collision`: merged rectangles (sea, pond, building bodies, room walls, furniture, tree trunks, big rocks and bushes). Replace
  `RoomRules.OBSTACLES` / `OBSTACLES` in `room-rules.ts` with these. Every walkable tile is reachable from the button.
- `spawns`: 10 points arranged around the button.
- `points`: `emergency_button` (1280, 742), plus 14 optional `task` spots (feed the sheep, mine gold, fish from the dock...).
- `zones`: outdoor areas (type `zone`): Town Square, Town Hall, Farm, Orchard, Watchtower, Gold Mine, Archery Range,
  Graveyard, Market, Pond, Smithy Yard, Lumber Yard, Residences, Meadow, Beach. The rooms have type `room`: Chapel
  (door south), Inn (doors west and south), Smithy (door south) and General Store (door north onto the high street).
  In `pu-town.collision.json` every zone has `"indoor": true/false`.

## Phaser sketch
```ts
// preload()
this.load.tilemapTiledJSON('pu-town', 'maps/pu-town/pu-town.json');
for (const n of ['water', 'sand', 'grass', 'bridge', 'interior']) this.load.image(n, `maps/pu-town/tilesets/terrain/${n}.png`);
// object sheets: load each object tileset as a spritesheet (frame size = the tileset's tilewidth/tileheight)
// e.g. this.load.spritesheet('pine', 'maps/pu-town/tilesets/objects/pine.png', { frameWidth: 192, frameHeight: 256 });

// create()
const map = this.make.tilemap({ key: 'pu-town' });
const terrain = ['water', 'sand', 'grass', 'bridge', 'interior'].map(n => map.addTilesetImage(n, n)!);
map.createLayer('water', terrain)!.setDepth(-30);
map.createLayer('sand', terrain)!.setDepth(-10);
map.createLayer('grass', terrain)!.setDepth(-9);
map.createLayer('bridge', terrain)!.setDepth(-8);
map.createLayer('floor', terrain)!.setDepth(-7);
map.createLayer('walls', terrain)!.setDepth(-6);
const sheetOf = (gid: number) => map.tilesets.find(t => gid >= t.firstgid && gid < t.firstgid + t.total)!;
const spawn = (o: Phaser.Types.Tilemaps.TiledObject, depth: number) => {
  const ts = sheetOf(o.gid!);
  const s = this.add.sprite(o.x!, o.y!, ts.name, 0).setOrigin(0, 1).setDepth(depth).setFlipX(!!o.flippedHorizontal);
  const frames = (ts.tileData as any)?.[0]?.animation;
  if (frames) {
    const key = `${ts.name}-anim`;
    if (!this.anims.exists(key)) this.anims.create({ key, repeat: -1,
      frames: frames.map((f: any) => ({ key: ts.name, frame: f.tileid, duration: f.duration })) });
    s.play({ key, startFrame: Phaser.Math.Between(0, frames.length - 1) });
  }
};
map.getObjectLayer('foam')!.objects.forEach(o => spawn(o, -20));     // below sand/grass
map.getObjectLayer('floor_decor')!.objects.forEach(o => spawn(o, -5)); // rugs, below the players
map.getObjectLayer('objects')!.objects.forEach(o => spawn(o, o.y!));  // y-sorted with the avatars
```
