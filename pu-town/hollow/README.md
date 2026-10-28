# The Hollow — PU Town's woodland map

2560×1440 px (80×45 tiles of 32 px): a hamlet in a forest clearing. The forest walls the town in on
every side; a river with two plank bridges runs down the west past the **Orchard**, the **Farm** and
its **Pasture** to a **Fishing Camp**; the cobbled oval of the **Town Square** holds the Emergency
button on an old stone dais, with the **Manor** on its north side; the **Market** lane runs along
the south; **East Homes** and the **Smithy** (with its smith at the anvil) line the east road; and
a path between the homes climbs through a gate to the **Shrine**, a glade of statues, standing
stones and a portal. The **Moon Pond** sits beside the manor.

| File | Use |
|---|---|
| `gen.py` | Builds everything below: `python gen.py` (needs Pillow, numpy, `tar`) |
| `pu-town.json` | Tiled JSON with every tileset embedded; the client loads it as is |
| `pu-town.collision.json` | Obstacles, Seats/spawns, zones, task spots and the walkable grid (`#` = blocked) |
| `build/` | The 2× tilesets the map names (`terrain/`, `objects/`) |
| `preview-day.png`, `preview-night.png`, `preview-collision.png` | Pictures for reference; the game doesn't use them |

`gen.py` reads the asset archives from `~/Desktop/assets` (`--assets DIR` to change), unpacks them
into the temp folder, writes the map here, then — unless `--no-serve` — copies `pu-town.json`,
`pu-town.collision.json` and `build/` into `frontend/public/maps/pu-town/` and rewrites the obstacle
lists in `RoomRules.java` and `room-rules.ts`, so the server, the client and the drawing always agree.
It refuses to write a map that breaks the game's rules: every Seat open and with a clear walk to the
button, the square's north–south line clear, the manor's front wall at exactly y 512, and every
walkable tile reachable from the button (pockets are sealed).

## Layers (bottom to top)
- `ground` (tiles): grass over bare earth, autotiled from the Fan-tasy *Grounds* Wang set.
- `water` (tiles): river and pond; their tiles animate (the client steps them).
- `road` (tiles): cobbled square, roads and lanes.
- `fences` (tiles): the paddock.
- `floor_decor` (objects): bridges, the dais, stepping stones, flowers, shadows — beneath everyone.
- `objects` (objects, y-sorted against the Avatars): buildings, trees, props, animals, the smith.
- `lights` (points, hidden): `radius`, `color` and `flicker` for every lamp, hearth, window,
  campfire, shrine stone and the square itself. The client's night mode lights the town from these.
- `collision`, `spawns`, `zones`, `points` (data): as in `pu-town.collision.json`.

## Day and night
Night is drawn by the client (`frontend/src/night-sky.ts`), not baked into the map: a blue shade over
the town, lifted around each light and around every Avatar (each carries a small lantern), warm
glows over the lamps and fires, and fireflies over the grass. It is cosmetic and per viewer: the
☀/☾ button in the corner of the town or the **N** key switches it, the browser remembers the
choice, and `?time=night` / `?time=day` sets it from the address. Vision is unchanged.

## Credits
- **The Fan-tasy Tileset (Free)** by Gustavo Vituri — ground, roads, water, houses, trees, props,
  campfire, flowers, shadows.
- **Sprout Lands — Basic pack** by Cup Nooble — cows, chickens, coop, crops, fences, apple trees,
  mushrooms, lily pads. *Assets — From: Sprout Lands — By: Cup Nooble.* Used under its licence:
  non-commercial use, modification allowed, credit required, the pack itself not redistributed.
- **Resurrected RPG** — the shrine's statues, portal, obelisk, standing stone, pillars, gazebo,
  dais and stepping stones.
- **Idle Working** — the smith at the anvil.
- The bridges are drawn by `gen.py` in the Sprout Lands palette; the autumn trees are the
  Fan-tasy trees recoloured by `gen.py`.

Only the pieces the map uses are copied into the game, cut and scaled; the packs themselves stay
outside the repository. The previous island map (Tiny Swords) is still in `pu-town/` one level up.
