"""Generates the PU Town Tiled map (TMX + JSON) in the Tiny Swords style.

Terrain is authored on a 64 px block grid (Tiny Swords tile size) and written to 32 px tile layers
(each 64 px tile is split into its four quarters), so the world stays 80x45 tiles of 32 px = 2560x1440.
Buildings, trees, rocks, sheep... are Tiled tile objects (one spritesheet tileset each, animated where
the art is animated) so the game can y-sort them against the players.
"""
import json, os, random, shutil, math, sys
from collections import deque
from PIL import Image

random.seed(11)
ROOT = r"D:/pu-town map"
OUT = os.path.join(ROOT, "pu-town")
NEW = os.path.join(ROOT, "Tiny Swords (Free Pack)/Tiny Swords (Free Pack)")
OLD = os.path.join(ROOT, "Tiny Swords/Tiny Swords (Update 010)")
GRASS_SHEET = sys.argv[1] if len(sys.argv) > 1 else "Tilemap_color3.png"

# SuperRetroWorld interior pack: walls/floors as tiles, furniture cut out as sprites
import interior
import tempfile
BUILD = os.path.join(tempfile.gettempdir(), "pu-town-build")
os.makedirs(os.path.join(BUILD, "furniture"), exist_ok=True)
INTERIOR_ATLAS = os.path.join(BUILD, "interior.png")
Image.fromarray(interior.load_atlas()).save(INTERIOR_ATLAS)
FURN = {}
for _n, (_im, _kind) in interior.cut_all().items():
    _p = os.path.join(BUILD, "furniture", f"{_n}.png"); _im.save(_p)
    FURN[_n] = (_p, _im.width, _im.height, _kind)

T, W, H = 32, 80, 45            # tile grid
BW, BH = 40, 23                 # 64 px block grid (last block row is half off the map)
PX_W, PX_H = W * T, H * T
BUTTON = (1280, 742)

# ============================ blocks ============================
def bmask(v=False): return [[v] * BW for _ in range(BH)]
def brect(m, x0, y0, x1, y1, v=True):
    for y in range(max(0, y0), min(BH - 1, y1) + 1):
        for x in range(max(0, x0), min(BW - 1, x1) + 1):
            m[y][x] = v

island, sand_only, pond = bmask(), bmask(), bmask()

# island with a ragged coast
brect(island, 1, 1, 38, 21)
for (x0, y0, x1, y1) in [(1, 1, 2, 1), (1, 2, 1, 2), (37, 1, 38, 1), (38, 2, 38, 2), (1, 21, 3, 21), (1, 20, 1, 20),
                         (36, 21, 38, 21), (38, 20, 38, 20), (9, 1, 12, 1), (27, 1, 29, 1), (1, 7, 1, 9),
                         (38, 7, 38, 8), (24, 21, 27, 21), (38, 15, 38, 16), (13, 21, 15, 21)]:
    brect(island, x0, y0, x1, y1, False)

# pond (south-west), inside the island
brect(pond, 2, 16, 6, 19); brect(pond, 3, 15, 5, 15); brect(pond, 3, 20, 5, 20)
for y in range(BH):
    for x in range(BW):
        if pond[y][x]: island[y][x] = False

# sand: paths, plaza, market, beach (grass is left out here)
brect(sand_only, 15, 8, 24, 14)          # Town Square (button 1280,742 sits in its middle)
brect(sand_only, 2, 11, 37, 12)          # high street (east-west)
brect(sand_only, 19, 15, 20, 21)         # south street to the beach
brect(sand_only, 8, 4, 9, 10)            # farm lane
brect(sand_only, 30, 6, 31, 10)          # chapel lane
brect(sand_only, 2, 13, 12, 14)          # market square
brect(sand_only, 21, 17, 31, 17)         # residence lane (ends at the inn's side door)
brect(sand_only, 11, 18, 18, 18)         # smithy yard
brect(sand_only, 25, 6, 27, 8)           # archery yard
brect(sand_only, 24, 7, 24, 7)
# south beach
for x in range(BW):
    if island[21][x]: sand_only[21][x] = True
for y in range(BH):
    for x in range(BW):
        if not island[y][x]: sand_only[y][x] = False

grass = [[island[y][x] and not sand_only[y][x] for x in range(BW)] for y in range(BH)]

# ============================ tile layers ============================
LAYERS = ["water", "sand", "grass", "bridge", "floor", "walls"]
L = {n: [[0] * W for _ in range(H)] for n in LAYERS}

# terrain tilesets (32 px slices of the 64 px sheets)
TERRAIN_TS = [  # name, image path (relative to OUT/tilesets), source, w, h
    ("water", "terrain/water.png", os.path.join(NEW, "Terrain/Tileset/Water Background color.png")),
    ("sand", "terrain/sand.png", os.path.join(OLD, "Terrain/Ground/Tilemap_Flat.png")),
    ("grass", "terrain/grass.png", os.path.join(NEW, "Terrain/Tileset", GRASS_SHEET)),
    ("bridge", "terrain/bridge.png", os.path.join(OLD, "Terrain/Bridge/Bridge_All.png")),
    ("interior", "terrain/interior.png", INTERIOR_ATLAS),
]
tsinfo, gid = {}, 1
for name, rel, src in TERRAIN_TS:
    iw, ih = Image.open(src).size
    tsinfo[name] = dict(first=gid, rel=rel, src=src, iw=iw, ih=ih, cols=iw // T, count=(iw // T) * (ih // T))
    gid += tsinfo[name]["count"]

def quarter(ts, col64, row64, qx, qy):
    t = tsinfo[ts]
    return t["first"] + (2 * row64 + qy) * t["cols"] + (2 * col64 + qx)

def autotile(layer, m, ts, c0):
    """Tiny Swords 4x4 flat block: 3x3 nine-slice + 1-wide column + 1-high row + single."""
    def on(x, y): return 0 <= x < BW and 0 <= y < BH and m[y][x]
    for by in range(BH):
        for bx in range(BW):
            if not m[by][bx]: continue
            N, S, Wd, E = on(bx, by - 1), on(bx, by + 1), on(bx - 1, by), on(bx + 1, by)
            c = 1 if (Wd and E) else 0 if E else 2 if Wd else 3
            r = 1 if (N and S) else 0 if S else 2 if N else 3
            for qy in range(2):
                for qx in range(2):
                    x, y = bx * 2 + qx, by * 2 + qy
                    if x < W and y < H:
                        L[layer][y][x] = quarter(ts, c0 + c, r, qx, qy)

for y in range(H):
    for x in range(W):
        L["water"][y][x] = tsinfo["water"]["first"]
autotile("sand", island, "sand", 5)
autotile("grass", grass, "grass", 0)

# ============================ objects ============================
# key: (file, frame_w, frame_h, frames, ms_per_frame, footprint (x0,y0,x1,y1) in frame px or None)
def B(color, name): return os.path.join(NEW, f"Buildings/{color} Buildings/{name}.png")
ASSETS = {}
for color in ("Blue", "Red", "Yellow", "Purple", "Black"):
    c = color.lower()
    ASSETS[f"castle_{c}"] = (B(color, "Castle"), 320, 256, 1, 0, (18, 120, 302, 238))
    ASSETS[f"barracks_{c}"] = (B(color, "Barracks"), 192, 256, 1, 0, (10, 128, 182, 236))
    ASSETS[f"archery_{c}"] = (B(color, "Archery"), 192, 256, 1, 0, (8, 128, 184, 232))
    ASSETS[f"monastery_{c}"] = (B(color, "Monastery"), 192, 320, 1, 0, (22, 168, 170, 300))
    ASSETS[f"tower_{c}"] = (B(color, "Tower"), 128, 256, 1, 0, (10, 128, 118, 222))
    ASSETS[f"house1_{c}"] = (B(color, "House1"), 128, 192, 1, 0, (12, 84, 116, 166))
    ASSETS[f"house2_{c}"] = (B(color, "House2"), 128, 192, 1, 0, (6, 92, 122, 170))
    ASSETS[f"house3_{c}"] = (B(color, "House3"), 128, 192, 1, 0, (8, 92, 120, 166))
R = os.path.join(NEW, "Terrain/Resources")
D = os.path.join(NEW, "Terrain/Decorations")
ASSETS.update({
    "pine": (f"{R}/Wood/Trees/Tree1.png", 192, 256, 8, 120, (78, 208, 114, 240)),
    "pine_tall": (f"{R}/Wood/Trees/Tree2.png", 192, 256, 8, 120, (78, 216, 114, 248)),
    "oak": (f"{R}/Wood/Trees/Tree3.png", 192, 192, 8, 120, (80, 144, 112, 170)),
    "oak_autumn": (f"{R}/Wood/Trees/Tree4.png", 192, 192, 8, 120, (80, 142, 112, 168)),
    "stump1": (f"{R}/Wood/Trees/Stump 1.png", 192, 256, 1, 0, (76, 206, 122, 240)),
    "stump2": (f"{R}/Wood/Trees/Stump 2.png", 192, 256, 1, 0, (74, 214, 116, 245)),
    "stump3": (f"{R}/Wood/Trees/Stump 3.png", 192, 256, 1, 0, None),
    "wood": (f"{R}/Wood/Wood Resource/Wood Resource.png", 64, 64, 1, 0, None),
    "meat": (f"{R}/Meat/Meat Resource/Meat Resource.png", 64, 64, 1, 0, None),
    "sheep": (f"{R}/Meat/Sheep/Sheep_Idle.png", 128, 128, 6, 140, None),
    "sheep_grazing": (f"{R}/Meat/Sheep/Sheep_Grass.png", 128, 128, 12, 140, None),
    "gold_pile": (f"{R}/Gold/Gold Resource/Gold_Resource.png", 128, 128, 1, 0, None),
    "gold_stone1": (f"{R}/Gold/Gold Stones/Gold Stone 1.png", 128, 128, 1, 0, None),
    "gold_stone4": (f"{R}/Gold/Gold Stones/Gold Stone 4.png", 128, 128, 1, 0, (36, 50, 98, 86)),
    "gold_stone6": (f"{R}/Gold/Gold Stones/Gold Stone 6.png", 128, 128, 1, 0, (18, 50, 110, 98)),
    "hammer": (f"{R}/Tools/Tool_01.png", 64, 64, 1, 0, None),
    "axe": (f"{R}/Tools/Tool_02.png", 64, 64, 1, 0, None),
    "pickaxe": (f"{R}/Tools/Tool_04.png", 64, 64, 1, 0, None),
    "bush1": (f"{D}/Bushes/Bushe1.png", 128, 128, 8, 130, (34, 54, 96, 80)),
    "bush2": (f"{D}/Bushes/Bushe2.png", 128, 128, 8, 130, None),
    "bush3": (f"{D}/Bushes/Bushe3.png", 128, 128, 8, 130, (26, 54, 100, 84)),
    "bush4": (f"{D}/Bushes/Bushe4.png", 128, 128, 8, 130, None),
    "rock1": (f"{D}/Rocks/Rock1.png", 64, 64, 1, 0, None),
    "rock2": (f"{D}/Rocks/Rock2.png", 64, 64, 1, 0, (8, 30, 56, 58)),
    "rock3": (f"{D}/Rocks/Rock3.png", 64, 64, 1, 0, None),
    "rock4": (f"{D}/Rocks/Rock4.png", 64, 64, 1, 0, (6, 28, 58, 60)),
    "water_rock1": (f"{D}/Rocks in the Water/Water Rocks_01.png", 64, 64, 16, 110, None),
    "water_rock2": (f"{D}/Rocks in the Water/Water Rocks_02.png", 64, 64, 16, 110, None),
    "water_rock3": (f"{D}/Rocks in the Water/Water Rocks_03.png", 64, 64, 16, 110, None),
    "duck": (f"{D}/Rubber Duck/Rubber duck.png", 32, 32, 3, 250, None),
    "foam": (os.path.join(NEW, "Terrain/Tileset/Water Foam.png"), 192, 192, 16, 90, None),
    "gold_mine": (os.path.join(OLD, "Resources/Gold Mine/GoldMine_Inactive.png"), 192, 128, 1, 0, (20, 44, 172, 112)),
    "scarecrow": (os.path.join(OLD, "Deco/18.png"), 192, 192, 1, 0, (82, 140, 114, 168)),
    "sign_skull": (os.path.join(OLD, "Deco/16.png"), 64, 128, 1, 0, (22, 82, 44, 104)),
    "sign_arrow": (os.path.join(OLD, "Deco/17.png"), 64, 128, 1, 0, (22, 82, 44, 104)),
})
for n, (pth, fw, fh, kind) in FURN.items():
    ASSETS[f"int_{n}"] = (pth, fw, fh, 1, 0, (2, int(fh * 0.45), fw - 2, fh) if kind == "solid" else None)
for i in range(1, 16):
    ASSETS[f"deco{i:02d}"] = (os.path.join(OLD, f"Deco/{i:02d}.png"), 64, 64, 1, 0,
                              (14, 30, 50, 58) if i in (6, 9) else None)
FRONT, BACK, RUGS = "objects", "foam", "floor_decor"
objects = {FRONT: [], BACK: [], RUGS: []}

blocked = [[False] * W for _ in range(H)]
reserved = [[False] * W for _ in range(H)]   # cells covered by something (keeps scatter off them)

def cells_of(x0, y0, x1, y1):
    out = [(cx, cy) for cy in range(H) for cx in range(W)
           if x0 <= cx * T + 16 < x1 and y0 <= cy * T + 16 < y1]
    if not out:
        out = [(int((x0 + x1) / 2) // T, int((y0 + y1) / 2) // T)]
    return out

def place(key, x, y, name="", layer=FRONT, flip=False):
    """x, y: top-left of the frame in world px."""
    f, fw, fh, n, ms, fp = ASSETS[key]
    objects[layer].append(dict(key=key, x=x, y=y + fh, w=fw, h=fh, name=name, flip=flip))
    if layer == FRONT:
        bb = Image.open(f).convert("RGBA").crop((0, 0, fw, fh)).getbbox()
        if bb:
            for cx, cy in cells_of(x + bb[0] + 8, y + bb[1] + 8, x + bb[2] - 8, y + bb[3] - 8):
                if 0 <= cx < W and 0 <= cy < H: reserved[cy][cx] = True
        if fp:
            fx0, fy0, fx1, fy1 = fp
            if flip: fx0, fx1 = fw - fx1, fw - fx0
            for cx, cy in cells_of(x + fx0, y + fy0, x + fx1, y + fy1):
                if 0 <= cx < W and 0 <= cy < H: blocked[cy][cx] = True

def at_base(key, cx, by, **kw):
    """Place so the frame's visible bottom-centre sits at (cx, by) world px."""
    f, fw, fh, n, ms, fp = ASSETS[key]
    bb = Image.open(f).convert("RGBA").crop((0, 0, fw, fh)).getbbox()
    place(key, round(cx - (bb[0] + bb[2]) / 2), round(by - bb[3]), **kw)

def blk(bx, by): return bx * 64, by * 64

# ---------------- Town Hall (castle) north of the square ----------------
at_base("castle_blue", 1280, 512, name="Town Hall")
# ---------------- Town Square ----------------
for (x, y) in [(1000, 560), (1580, 530)]:
    at_base("sign_arrow", x, y)
for (x, y, k) in [(1570, 948, "bush2"), (1000, 740, "deco10"), (1560, 740, "deco10")]:
    at_base(k, x, y)
# kept clear of the Meeting chairs, which ring the button at 330 x 205 px
for (x, y) in [(990, 1020), (1570, 1020)]:
    at_base("oak", x, y)

# ---------------- Farm (north-west) ----------------
at_base("house1_yellow", 150 + 64, 300, name="Farmhouse")
at_base("barracks_yellow", 400, 300, name="Barn")
at_base("scarecrow", 250, 520)
for (x, y) in [(180, 420), (220, 470), (300, 420), (340, 470), (140, 500), (380, 520), (430, 440)]:
    at_base(random.choice(["deco12", "deco13", "deco13"]), x, y)
for (x, y, k) in [(130, 600, "sheep"), (210, 640, "sheep_grazing"), (330, 610, "sheep"), (430, 650, "sheep_grazing"),
                  (270, 690, "sheep")]:
    at_base(k, x, y, flip=random.random() < .5)
at_base("wood", 480, 250); at_base("axe", 510, 240)

# ---------------- Orchard (north, west of the hall) ----------------
for i, (x, y) in enumerate([(700, 250), (820, 230), (940, 260), (650, 380), (770, 360), (890, 390),
                            (700, 500), (820, 480), (960, 470)]):
    at_base("oak_autumn" if i % 3 != 1 else "oak", x, y)

# ---------------- Watchtower & archery range & gold mine (north, east of the hall) ----------------
at_base("tower_red", 1540, 380, name="Watchtower")
at_base("archery_red", 1690, 520, name="Archery Range")
at_base("gold_mine", 1760, 240, name="Gold Mine")
for (x, y, k) in [(1620, 220, "gold_stone4"), (1720, 310, "gold_stone6"), (1830, 300, "gold_stone1"),
                  (1650, 300, "pickaxe")]:
    at_base(k, x, y)

# ---------------- Monastery & graveyard (north-east) ----------------
for (x, y, k) in [(2170, 300, "sign_skull"), (2260, 330, "deco14"), (2330, 280, "deco15"), (2200, 400, "deco15"),
                  (2320, 400, "sign_skull"), (2250, 470, "deco14"), (2380, 460, "deco15"), (2140, 480, "deco04")]:
    at_base(k, x, y)
for (x, y) in [(2250, 190), (2420, 200), (2430, 360)]:
    at_base("pine", x, y)

# ---------------- Market (west, south of the high street) ----------------
for (x, y, k) in [(190, 880, "meat"), (230, 900, "meat"), (320, 880, "wood"), (360, 900, "wood"), (340, 860, "wood"),
                  (400, 935, "gold_pile"), (140, 950, "bush4")]:
    at_base(k, x, y)

# ---------------- Pond & dock (south-west) ----------------
for k, (bx, by) in enumerate([(4, 14), (4, 15), (4, 16), (4, 17)]):
    piece = 3 if k == 0 else (9 if k == 3 else 6)
    pc, pr = piece % 3, piece // 3
    for qy in range(2):
        for qx in range(2):
            L["bridge"][by * 2 + qy][bx * 2 + qx] = quarter("bridge", pc, pr, qx, qy)
place("duck", 5 * 64 + 20, 18 * 64 + 30, layer=FRONT)
for (x, y, k) in [(3 * 64 + 20, 18 * 64 + 10, "water_rock2"), (2 * 64 + 20, 16 * 64 + 20, "water_rock1")]:
    place(k, x, y)
for (x, y, k) in [(150, 960, "deco07"), (600, 1250, "deco08"), (130, 1320, "bush3"), (540, 1260, "rock3")]:
    at_base(k, x, y)

# ---------------- Smithy (south) ----------------
for (x, y, k) in [(760, 1200, "hammer"), (790, 1215, "pickaxe"), (1060, 1190, "rock4"), (1030, 1215, "rock1"),
                  (1100, 1150, "wood"), (1120, 1170, "wood")]:
    at_base(k, x, y)

# ---------------- Lumber yard (south, east of the street) ----------------
for (x, y, k) in [(1440, 1060, "stump1"), (1560, 1030, "stump2"), (1480, 1170, "stump3"), (1620, 1150, "stump1"),
                  (1700, 1060, "stump2")]:
    at_base(k, x, y)
for (x, y, k) in [(1420, 1120, "wood"), (1450, 1130, "wood"), (1600, 1100, "wood"), (1530, 1110, "axe")]:
    at_base(k, x, y)
for (x, y, k) in [(1760, 1200, "pine"), (1640, 1330, "pine_tall")]:
    at_base(k, x, y)

# ---------------- Residences (south-east, along the high street) ----------------
for i, (x, k) in enumerate([(1880, "house1_blue"), (2010, "house2_yellow")]):
    at_base(k, x, 1080, name=["Cottage", "Mayor's House"][i])

# ---------------- Meadow (south-east) ----------------
for (x, y, k) in [(1990, 1290, "sheep"), (2170, 1320, "sheep_grazing"), (2310, 1280, "sheep"),
                  (2090, 1250, "deco01"), (2120, 1265, "deco02"), (2000, 1340, "deco03"), (2440, 1260, "deco11"),
                  (1900, 1330, "bush2"), (2400, 1340, "bush3")]:
    at_base(k, x, y, flip=random.random() < .5)

# ---------------- North coast pines ----------------
for (x, y, k) in [(140, 190, "pine"), (1060, 170, "pine"), (1200, 150, "pine_tall"),
                  (1380, 160, "pine"), (2440, 560, "pine_tall"), (2420, 700, "pine"), (100, 560, "pine"),
                  (1150, 1330, "pine"), (1450, 1330, "pine_tall"), (2330, 580, "oak"), (1880, 560, "oak"),
                  (560, 590, "oak"), (1900, 740, "bush1"), (560, 700, "bush3")]:
    at_base(k, x, y)

# ============================ interiors (open-top rooms) ============================
ATL_COLS = 48
def itile(c, r): return tsinfo["interior"]["first"] + r * ATL_COLS + c
FRAME = {"tl": (1, 11), "t": (2, 11), "tr": (3, 11), "l": (0, 13), "r": (4, 13), "bl": (1, 15), "b": (2, 15), "br": (3, 15)}
rooms = []

def room(name, x0, y0, x1, y1, floor, wall, doors):
    """Ring-inclusive cell rect. Row y0+1..y0+2 is the wall face, the rest is floor.
    doors: list of (side, a, b) with side in top/bottom/left/right and a..b the cell range along that side."""
    door_cells = set()
    for side, a, b in doors:
        for k in range(a, b + 1):
            door_cells.add({"top": (k, y0), "bottom": (k, y1), "left": (x0, k), "right": (x1, k)}[side])
    top_door_cols = {k for side, a, b in doors if side == "top" for k in range(a, b + 1)}
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            reserved[y][x] = True
            ring = x in (x0, x1) or y in (y0, y1)
            if ring:
                if (x, y) in door_cells:
                    L["floor"][y][x] = itile(*floor); blocked[y][x] = False
                    continue
                k = ("t" if y == y0 else "b" if y == y1 else "") + ("l" if x == x0 else "r" if x == x1 else "")
                L["walls"][y][x] = itile(*FRAME[k]); blocked[y][x] = True
            elif y <= y0 + 2 and x not in top_door_cols:
                L["floor"][y][x] = itile(wall[0], wall[1] + (y - y0 - 1)); blocked[y][x] = True
            else:
                L["floor"][y][x] = itile(*floor); blocked[y][x] = False
    rooms.append((name, x0, y0, x1, y1))

def furn(n, x, y, layer=None):
    """Sprite n with its left edge at cell column x (float ok) and its bottom on the bottom of cell row y."""
    p, fw, fh, kind = FURN[n]
    lay = layer or (RUGS if kind == "floor" else FRONT)
    place(f"int_{n}", round(x * T), round((y + 1) * T - fh), layer=lay)

def wall_item(n, cx, y0):
    """Centre sprite n on the wall face of a room whose top ring row is y0; cx in cells (centre)."""
    p, fw, fh, kind = FURN[n]
    place(f"int_{n}", round(cx * T - fw / 2), round((y0 + 2) * T - fh / 2 + 2), layer=FRONT)

STONE_FLOOR, WOOD_FLOOR, WARM_FLOOR, CHAPEL_FLOOR = (6, 9), (1, 8), (2, 7), (4, 8)
GREY_WALL, BRICK_WALL, YELLOW_WALL, BLUE_WALL = (0, 2), (2, 2), (5, 0), (1, 0)

# ---- Chapel (north-east) ----
room("Chapel", 58, 3, 67, 12, CHAPEL_FLOOR, GREY_WALL, [("bottom", 62, 63)])
for cx in (60, 65.5): wall_item("win_round", cx, 3)
wall_item("win_glass", 63, 3)
furn("rug_red", 61.5, 8); furn("mat_red", 62, 11)
furn("altar", 62, 6)
furn("candle", 61.2, 6); furn("candle", 64.2, 6)
furn("flowers3", 59, 6); furn("flowers1", 66, 6)
for y in (8, 10):
    furn("sofa", 59, y); furn("sofa", 65, y)
furn("palm_pot", 59, 11); furn("palm_pot", 66, 11)

# ---- Inn (south-east) ----
room("Inn", 65, 26, 76, 36, WOOD_FLOOR, BRICK_WALL, [("left", 34, 35), ("bottom", 70, 71)])
wall_item("shelf_potions", 67, 26); wall_item("shelf_jars", 68.5, 26); wall_item("win_wide", 71, 26)
wall_item("painting", 73, 26); wall_item("clock", 69.7, 26)
furn("bar_l", 66, 31)
furn("barrel", 66, 33); furn("barrel", 67, 33); furn("crate", 66, 32.4)
furn("fireplace", 74, 29)
furn("table_red", 70, 31); furn("stool", 69, 30.6); furn("stool", 72, 30.6)
furn("table_red", 70.5, 34.3)
furn("chair_l", 69.5, 34); furn("chair_r", 72.6, 34)
furn("rug_green", 73, 33.6)
furn("bed_blue", 75, 32); furn("nightstand_candle", 74, 31.5)
furn("mat_brown", 70, 35)

# ---- Smithy (south) ----
room("Smithy", 23, 27, 32, 35, STONE_FLOOR, GREY_WALL, [("bottom", 27, 28)])
wall_item("shelf_pots", 27, 27); wall_item("win_square", 29.5, 27); wall_item("boards", 31, 27)
furn("fireplace", 24, 30)
furn("cauldron_hot", 26, 30); furn("cauldron", 26, 32)
furn("table_long", 28.6, 31.4)
place("hammer", 29 * T + 10, 30 * T + 8); place("pickaxe", 30 * T + 10, 30 * T + 4)
furn("chest_iron", 31, 30); furn("crates", 29.8, 34); furn("barrel", 24, 34); furn("logs", 25, 34)
furn("mat_grey", 27, 34)

# ---- General Store (west, on the market) ----
room("General Store", 14, 26, 21, 35, WARM_FLOOR, YELLOW_WALL, [("top", 17, 18)])
furn("shelf", 15, 29); furn("shelf_dishes", 19, 29)
furn("counter_goods", 15, 31.6); furn("counter", 19, 31.6)
furn("crate", 15, 34); furn("barrel", 20, 34); furn("rug_blue", 16.5, 34)
furn("mat_blue", 17, 29)

# ============================ water / collision ============================
for y in range(H):
    for x in range(W):
        bx, by = x // 2, y // 2
        if not island[by][bx]:
            blocked[y][x] = True
for y in range(H):
    for x in range(W):
        if L["bridge"][y][x]: blocked[y][x] = False

# foam under every land edge that touches water
def water_b(bx, by): return not (0 <= bx < BW and 0 <= by < BH) or not island[by][bx]
for by in range(BH):
    for bx in range(BW):
        if island[by][bx] and any(water_b(bx + dx, by + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            place("foam", bx * 64 - 64, by * 64 - 64, layer=BACK)

# a few rocks out at sea
for (x, y, k) in [(40, 300, "water_rock1"), (2490, 980, "water_rock3"), (1610, 1380, "water_rock2"),
                  (640, 30, "water_rock3"), (2490, 180, "water_rock2")]:
    place(k, x, y)

# scatter small plants / mushrooms / pebbles on open grass
for _ in range(150):
    x, y = random.randint(3, W - 4), random.randint(3, H - 4)
    if not grass[y // 2][x // 2] or reserved[y][x] or blocked[y][x]: continue
    if any(reserved[yy][xx] for yy in range(y - 1, y + 2) for xx in range(x - 1, x + 2)): continue
    k = random.choice(["deco10", "deco10", "deco11", "deco01", "deco04", "deco07", "deco02", "deco05", "deco08"])
    at_base(k, x * T + 16 + random.randint(-8, 8), y * T + 28)
    reserved[y][x] = True

# keep the button area open
bx_, by_ = BUTTON[0] // T, BUTTON[1] // T
assert not blocked[by_][bx_]

# every walkable cell must be reachable from the button; fill unreachable pockets
seen = [[False] * W for _ in range(H)]
q = deque([(bx_, by_)]); seen[by_][bx_] = True
while q:
    x, y = q.popleft()
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < W and 0 <= ny < H and not seen[ny][nx] and not blocked[ny][nx]:
            seen[ny][nx] = True; q.append((nx, ny))
pockets = 0
for y in range(H):
    for x in range(W):
        if not blocked[y][x] and not seen[y][x]:
            blocked[y][x] = True; pockets += 1
print("filled unreachable cells:", pockets)

def merge_rects():
    rects, used = [], [[False] * W for _ in range(H)]
    for y in range(H):
        x = 0
        while x < W:
            if blocked[y][x] and not used[y][x]:
                x1 = x
                while x1 + 1 < W and blocked[y][x1 + 1] and not used[y][x1 + 1]: x1 += 1
                y1 = y
                while y1 + 1 < H and all(blocked[y1 + 1][i] and not used[y1 + 1][i] for i in range(x, x1 + 1)): y1 += 1
                for yy in range(y, y1 + 1):
                    for xx in range(x, x1 + 1): used[yy][xx] = True
                rects.append((x * T, y * T, (x1 - x + 1) * T, (y1 - y + 1) * T))
                x = x1 + 1
            else:
                x += 1
    return rects
collision = merge_rects()

spawns = []
for k in range(10):
    a = -math.pi / 2 + k * 2 * math.pi / 10
    sx, sy = round(BUTTON[0] + 150 * math.cos(a)), round(BUTTON[1] + 110 * math.sin(a))
    assert not blocked[sy // T][sx // T], (sx, sy)
    spawns.append((sx, sy))

zones = [  # name, x0, y0, x1, y1 in 32 px tiles (inclusive)
    ("Town Square", 30, 16, 49, 29), ("Town Hall", 34, 3, 45, 15), ("Farm", 2, 2, 16, 23),
    ("Orchard", 17, 2, 31, 16), ("Watchtower", 46, 3, 50, 15), ("Gold Mine", 51, 2, 57, 9),
    ("Archery Range", 51, 10, 57, 17), ("Graveyard", 68, 2, 77, 15), ("Market", 2, 26, 13, 29),
    ("Pond", 2, 30, 13, 42), ("Smithy Yard", 22, 36, 37, 40), ("Lumber Yard", 41, 29, 57, 41),
    ("Residences", 58, 25, 64, 34), ("Meadow", 58, 37, 77, 42), ("Beach", 30, 41, 57, 43),
] + [(n, x0, y0, x1, y1) for n, x0, y0, x1, y1 in rooms]
indoor = {n for n, *_ in rooms}
tasks = [
    ("Feed the sheep", 280, 600), ("Harvest pumpkins", 300, 460), ("Pick apples", 840, 420),
    ("Pray at the altar", 2016, 300), ("Restock the shelves", 560, 1000), ("Fish from the dock", 288, 1110),
    ("Stoke the forge", 800, 1030), ("Chop firewood", 1570, 1110), ("Mine gold", 1760, 300),
    ("Practice archery", 1690, 560), ("Sign the town ledger", 1280, 544), ("Serve drinks at the inn", 2190, 980),
    ("Tidy the graves", 2260, 380), ("Keep watch from the tower", 1540, 420),
]
for n, x, y in tasks:
    assert not blocked[y // T][x // T] and seen[y // T][x // T], n

# ============================ write ============================
old = os.path.join(OUT, "old-pipoya")
if os.path.exists(os.path.join(OUT, "pu-town.tmx")) and not os.path.exists(old):
    os.makedirs(old)
    for f in os.listdir(OUT):
        if f != "old-pipoya": shutil.move(os.path.join(OUT, f), os.path.join(old, f))
for d in ("tilesets/terrain", "tilesets/objects"):
    if os.path.isdir(os.path.join(OUT, d)): shutil.rmtree(os.path.join(OUT, d))
    os.makedirs(os.path.join(OUT, d))

for name, t in tsinfo.items():
    shutil.copy(t["src"], os.path.join(OUT, "tilesets", t["rel"]))

used_keys = sorted({o["key"] for lay in objects.values() for o in lay})
obj_ts = {}
for key in used_keys:
    f, fw, fh, n, ms, fp = ASSETS[key]
    im = Image.open(f)
    # store only the frames we use, as one horizontal strip
    strip = im.convert("RGBA").crop((0, 0, fw * n, fh))
    rel = f"objects/{key}.png"
    strip.save(os.path.join(OUT, "tilesets", rel))
    obj_ts[key] = dict(first=gid, rel=rel, fw=fw, fh=fh, n=n, ms=ms)
    gid += n

FLIP_H = 0x80000000
oid = [1]
def tile_obj(o):
    t = obj_ts[o["key"]]
    d = {"id": oid[0], "name": o["name"], "type": o["key"], "gid": t["first"] | (FLIP_H if o["flip"] else 0),
         "x": o["x"], "y": o["y"], "width": o["w"], "height": o["h"], "rotation": 0, "visible": True}
    oid[0] += 1
    return d
def obj(name, typ, x, y, w=0, h=0, point=False):
    o = {"id": oid[0], "name": name, "type": typ, "x": x, "y": y, "width": w, "height": h, "rotation": 0, "visible": True}
    if point: o["point"] = True
    oid[0] += 1
    return o

objects[FRONT].sort(key=lambda o: o["y"])
groups = [
    ("foam", [tile_obj(o) for o in objects[BACK]], True, {}),
    ("floor_decor", [tile_obj(o) for o in objects[RUGS]], True, {}),
    ("objects", [tile_obj(o) for o in objects[FRONT]], True, {"ysort": True}),
    ("collision", [obj("", "obstacle", *r) for r in collision], False, {}),
    ("spawns", [obj(f"spawn_{i}", "spawn", x, y, point=True) for i, (x, y) in enumerate(spawns)], True, {}),
    ("zones", [obj(n, "room" if n in indoor else "zone", x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T) for n, x0, y0, x1, y1 in zones], True, {}),
    ("points", [obj("emergency_button", "emergency_button", *BUTTON, point=True)] +
               [obj(n, "task", x, y, point=True) for n, x, y in tasks], True, {}),
]
# layer order bottom -> top
ORDER = [("tile", "water"), ("obj", "foam"), ("tile", "sand"), ("tile", "grass"), ("tile", "bridge"),
         ("tile", "floor"), ("tile", "walls"), ("obj", "floor_decor"), ("obj", "objects"), ("obj", "collision"), ("obj", "spawns"), ("obj", "zones"), ("obj", "points")]
gmap = {g[0]: g for g in groups}

def tsx(name, img, tw, th, cols, count, iw, ih, anim=None):
    s = ['<?xml version="1.0" encoding="UTF-8"?>',
         f'<tileset version="1.10" tiledversion="1.11.0" name="{name}" tilewidth="{tw}" tileheight="{th}" tilecount="{count}" columns="{cols}"' +
         (' objectalignment="bottomleft"' if anim is not None else '') + '>',
         f' <image source="{os.path.basename(img)}" width="{iw}" height="{ih}"/>']
    if anim:
        s.append(' <tile id="0">\n  <animation>')
        s += [f'   <frame tileid="{i}" duration="{anim[1]}"/>' for i in range(anim[0])]
        s.append('  </animation>\n </tile>')
    s.append('</tileset>')
    return "\n".join(s) + "\n"

tileset_refs = []
for name, t in tsinfo.items():
    p = f"tilesets/terrain/{name}.tsx"
    open(os.path.join(OUT, p), "w", encoding="utf-8").write(tsx(name, t["rel"], T, T, t["cols"], t["count"], t["iw"], t["ih"]))
    tileset_refs.append((t["first"], p))
for key, t in obj_ts.items():
    p = f"tilesets/objects/{key}.tsx"
    open(os.path.join(OUT, p), "w", encoding="utf-8").write(
        tsx(key, t["rel"], t["fw"], t["fh"], t["n"], t["n"], t["fw"] * t["n"], t["fh"], anim=(t["n"], t["ms"]) if t["n"] > 1 else ()))
    tileset_refs.append((t["first"], p))

nlayers = len(ORDER)
t_ = ['<?xml version="1.0" encoding="UTF-8"?>',
      f'<map version="1.10" tiledversion="1.11.0" orientation="orthogonal" renderorder="right-down" width="{W}" height="{H}" tilewidth="{T}" tileheight="{T}" infinite="0" backgroundcolor="#47aba9" nextlayerid="{nlayers + 1}" nextobjectid="{oid[0]}">',
      ' <properties>',
      f'  <property name="emergencyButtonX" type="int" value="{BUTTON[0]}"/>',
      f'  <property name="emergencyButtonY" type="int" value="{BUTTON[1]}"/>',
      ' </properties>']
for first, p in tileset_refs:
    t_.append(f' <tileset firstgid="{first}" source="{p}"/>')
def esc(s): return s.replace("&", "&amp;").replace('"', "&quot;").replace("'", "&apos;")
for lid, (kind, n) in enumerate(ORDER, 1):
    if kind == "tile":
        t_.append(f' <layer id="{lid}" name="{n}" width="{W}" height="{H}">\n  <data encoding="csv">')
        t_.append(",\n".join(",".join(str(g) for g in row) for row in L[n]))
        t_.append('</data>\n </layer>')
    else:
        _, objs, visible, props = gmap[n]
        t_.append(f' <objectgroup id="{lid}" name="{n}"' + ('' if visible else ' visible="0"') + '>')
        if props:
            t_.append('  <properties>\n' + "\n".join(f'   <property name="{k}" type="bool" value="{str(v).lower()}"/>' for k, v in props.items()) + '\n  </properties>')
        for o in objs:
            a = f'id="{o["id"]}"' + (f' name="{esc(o["name"])}"' if o["name"] else "") + f' type="{o["type"]}"'
            if "gid" in o:
                t_.append(f'  <object {a} gid="{o["gid"]}" x="{o["x"]}" y="{o["y"]}" width="{o["width"]}" height="{o["height"]}"/>')
            elif o.get("point"):
                t_.append(f'  <object {a} x="{o["x"]}" y="{o["y"]}">\n   <point/>\n  </object>')
            else:
                t_.append(f'  <object {a} x="{o["x"]}" y="{o["y"]}" width="{o["width"]}" height="{o["height"]}"/>')
        t_.append(' </objectgroup>')
t_.append('</map>')
open(os.path.join(OUT, "pu-town.tmx"), "w", encoding="utf-8").write("\n".join(t_) + "\n")

# JSON with embedded tilesets (Phaser: this.load.tilemapTiledJSON)
j = {"compressionlevel": -1, "type": "map", "version": "1.10", "tiledversion": "1.11.0", "orientation": "orthogonal",
     "renderorder": "right-down", "infinite": False, "width": W, "height": H, "tilewidth": T, "tileheight": T,
     "backgroundcolor": "#47aba9", "nextlayerid": nlayers + 1, "nextobjectid": oid[0],
     "properties": [{"name": "emergencyButtonX", "type": "int", "value": BUTTON[0]},
                    {"name": "emergencyButtonY", "type": "int", "value": BUTTON[1]}],
     "tilesets": [], "layers": []}
for name, t in tsinfo.items():
    j["tilesets"].append({"firstgid": t["first"], "name": name, "image": f"tilesets/{t['rel']}", "imagewidth": t["iw"],
                          "imageheight": t["ih"], "tilewidth": T, "tileheight": T, "columns": t["cols"],
                          "tilecount": t["count"], "margin": 0, "spacing": 0})
for key, t in obj_ts.items():
    ts = {"firstgid": t["first"], "name": key, "image": f"tilesets/{t['rel']}", "imagewidth": t["fw"] * t["n"],
          "imageheight": t["fh"], "tilewidth": t["fw"], "tileheight": t["fh"], "columns": t["n"], "tilecount": t["n"],
          "margin": 0, "spacing": 0, "objectalignment": "bottomleft"}
    if t["n"] > 1:
        ts["tiles"] = [{"id": 0, "animation": [{"tileid": i, "duration": t["ms"]} for i in range(t["n"])]}]
    j["tilesets"].append(ts)
for lid, (kind, n) in enumerate(ORDER, 1):
    if kind == "tile":
        j["layers"].append({"id": lid, "name": n, "type": "tilelayer", "width": W, "height": H, "x": 0, "y": 0,
                            "opacity": 1, "visible": True, "data": [g for row in L[n] for g in row]})
    else:
        _, objs, visible, props = gmap[n]
        lay = {"id": lid, "name": n, "type": "objectgroup", "draworder": "topdown", "x": 0, "y": 0,
               "opacity": 1, "visible": visible, "objects": objs}
        if props: lay["properties"] = [{"name": k, "type": "bool", "value": v} for k, v in props.items()]
        j["layers"].append(lay)
json.dump(j, open(os.path.join(OUT, "pu-town.json"), "w"), separators=(",", ":"))

json.dump({"world": {"width": PX_W, "height": PX_H}, "tileSize": T,
           "emergencyButton": {"x": BUTTON[0], "y": BUTTON[1]},
           "obstacles": [{"x": x, "y": y, "width": w, "height": h} for x, y, w, h in collision],
           "spawns": [{"x": x, "y": y} for x, y in spawns],
           "zones": [{"name": n, "indoor": n in indoor, "x": x0 * T, "y": y0 * T, "width": (x1 - x0 + 1) * T, "height": (y1 - y0 + 1) * T} for n, x0, y0, x1, y1 in zones],
           "tasks": [{"name": n, "x": x, "y": y} for n, x, y in tasks],
           "walkable": ["".join("#" if c else "." for c in row) for row in blocked]},
          open(os.path.join(OUT, "pu-town.collision.json"), "w"), indent=1)
print("obstacle rects", len(collision), "objects", len(objects[FRONT]), "foam", len(objects[BACK]), "tilesets", len(tileset_refs))

# ============================ previews ============================
from PIL import ImageDraw
cache = {}
def frame(key, flip):
    t = obj_ts[key]
    if (key, flip) not in cache:
        im = Image.open(os.path.join(OUT, "tilesets", t["rel"])).convert("RGBA").crop((0, 0, t["fw"], t["fh"]))
        cache[(key, flip)] = im.transpose(Image.FLIP_LEFT_RIGHT) if flip else im
    return cache[(key, flip)]
timgs = {n: Image.open(os.path.join(OUT, "tilesets", t["rel"])).convert("RGBA") for n, t in tsinfo.items()}
def tile(g):
    for n, t in reversed(list(tsinfo.items())):
        if g >= t["first"]:
            i = g - t["first"]
            return timgs[n].crop(((i % t["cols"]) * T, (i // t["cols"]) * T, (i % t["cols"]) * T + T, (i // t["cols"]) * T + T))
im = Image.new("RGBA", (PX_W, PX_H), (71, 171, 169, 255))
for kind, n in ORDER:
    if kind == "tile":
        if n == "water": continue
        for y in range(H):
            for x in range(W):
                if L[n][y][x]: im.alpha_composite(tile(L[n][y][x]), (x * T, y * T))
    elif n in ("foam", "floor_decor", "objects"):
        for o in objects[{"foam": BACK, "floor_decor": RUGS, "objects": FRONT}[n]]:
            f = frame(o["key"], o["flip"])
            x, y = o["x"], o["y"] - o["h"]
            sx, sy = max(0, -x), max(0, -y)
            f = f.crop((sx, sy, min(f.width, PX_W - x), min(f.height, PX_H - y)))
            if f.width > 0 and f.height > 0: im.alpha_composite(f, (x + sx, y + sy))
im.save(os.path.join(OUT, "pu-town-preview.png"))
dbg = im.copy(); d = ImageDraw.Draw(dbg, "RGBA")
for x, y, w, h in collision: d.rectangle([x, y, x + w - 1, y + h - 1], fill=(255, 0, 0, 70), outline=(255, 0, 0, 160))
for x, y in spawns: d.ellipse([x - 8, y - 8, x + 8, y + 8], fill=(0, 120, 255, 220))
d.ellipse([BUTTON[0] - 12, BUTTON[1] - 12, BUTTON[0] + 12, BUTTON[1] + 12], fill=(255, 220, 0, 255))
for n, x, y in tasks: d.rectangle([x - 7, y - 7, x + 7, y + 7], fill=(0, 220, 120, 230))
for n, x0, y0, x1, y1 in zones:
    d.rectangle([x0 * T, y0 * T, (x1 + 1) * T - 1, (y1 + 1) * T - 1], outline=(255, 255, 255, 120))
    d.text((x0 * T + 6, y0 * T + 4), n, fill=(255, 255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0, 255))
dbg.save(os.path.join(OUT, "pu-town-collision-preview.png"))
