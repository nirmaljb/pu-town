"""Generates the PU Town Tiled map (TMX + JSON) from the Pipoya 32x32 tileset."""
import json, os, random, shutil, math
from blob import LAYOUT
from lib import load_sample, SM

random.seed(7)
W, H, T = 80, 45, 32
OUT = r"D:/pu-town map/pu-town"

# ---- tilesets (firstgid, name, image, cols, count) ----
TILESETS = [
    (1,    "base",    "[Base]BaseChip_pipo.png", 8, 1064, 256, 4256),
    (1065, "paths",   "[A]Grass_pipo.png",       8, 528,  256, 2112),
    (1593, "water",   "[A]Water_pipo.png",       64, 3072, 2048, 1536),
    (4665, "flowers", "[A]Flower_pipo.png",      8, 48,   256, 384),
]
def B(i): return 1 + i
def P(block, i): return 1065 + block * 48 + i
def WA(i, frame=0): return 1593 + (i // 8) * 64 + frame * 8 + (i % 8)
def FL(i): return 4665 + i
SAND, DIRT, LIGHTSAND, STONE = 0, 1, 2, 3
OVL_LIGHT, OVL_DARK = 7, 8

LAYERS = ["ground", "terrain", "grass_detail", "water", "buildings", "details", "props", "above"]
L = {n: [[0] * W for _ in range(H)] for n in LAYERS}
blocked = [[False] * W for _ in range(H)]
occupied = [[False] * W for _ in range(H)]   # anything placed (keeps random decor off it)

def inb(x, y): return 0 <= x < W and 0 <= y < H
def put(layer, x, y, gid, block=False):
    if not inb(x, y): return
    L[layer][y][x] = gid
    occupied[y][x] = True
    if block: blocked[y][x] = True
def block_rect(x0, y0, x1, y1, v=True):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if inb(x, y): blocked[y][x] = v; occupied[y][x] = True

# ---- masks ----
def mask(): return [[False] * W for _ in range(H)]
def rect(m, x0, y0, x1, y1, v=True):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if inb(x, y): m[y][x] = v
def ellipse(m, cx, cy, rx, ry, v=True):
    for y in range(H):
        for x in range(W):
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1: m[y][x] = v

def blob_paint(layer, m, tile_of, joins=None):
    """Autotile mask m with the 47-tile blob layout. joins: extra mask counted as connected."""
    def on(x, y):
        if not inb(x, y): return True
        return m[y][x] or (joins is not None and joins[y][x])
    for y in range(H):
        for x in range(W):
            if not m[y][x]: continue
            N, E, S, Wd = on(x, y - 1), on(x + 1, y), on(x, y + 1), on(x - 1, y)
            s = N | E << 1 | S << 2 | Wd << 3
            if N and E and on(x + 1, y - 1): s |= 16
            if S and E and on(x + 1, y + 1): s |= 32
            if S and Wd and on(x - 1, y + 1): s |= 64
            if N and Wd and on(x - 1, y - 1): s |= 128
            L[layer][y][x] = tile_of(LAYOUT[s])

# ================= GROUND =================
for y in range(H):
    for x in range(W):
        L["ground"][y][x] = B(0)

sand, stone, dirt, water, flowers = mask(), mask(), mask(), mask(), mask()

# main roads
rect(sand, 3, 22, 76, 24)             # east-west high street
rect(sand, 39, 30, 41, 40)            # south street
rect(sand, 15, 11, 17, 21)            # farm lane
rect(sand, 64, 13, 66, 21)            # chapel lane
rect(sand, 52, 14, 54, 21)            # garden lane
rect(sand, 4, 25, 25, 31)             # market square
rect(sand, 42, 34, 76, 35)            # residence lane
rect(sand, 22, 38, 41, 40)            # smithy yard / pond walk
rect(sand, 22, 32, 24, 37)            # market -> pond walk
# town square (stone)
rect(stone, 31, 16, 49, 29)
rect(stone, 38, 15, 42, 15)
rect(stone, 50, 7, 56, 13)            # fountain garden
for y in range(H):
    for x in range(W):
        if stone[y][x]: sand[y][x] = False

blob_paint("terrain", sand, lambda i: P(SAND, i), joins=stone)
blob_paint("terrain", stone, lambda i: P(STONE, i), joins=sand)

# pond (south-west)
ellipse(water, 13, 37, 8.6, 3.8)
blob_paint("water", water, lambda i: WA(i))
for y in range(H):
    for x in range(W):
        if water[y][x]: blocked[y][x] = True; occupied[y][x] = True

# ================= FOREST BORDER =================
def tree(x, y, kind="green", block=True):
    top = {"green": (8, 9), "dark": (10, 11), "autumn": (12, 13), "dead": (14, 15)}[kind]
    bot = {"green": (16, 17), "dark": (18, 19), "autumn": (20, 21), "dead": (22, 23)}[kind]
    for i in range(2):
        put("above", x + i, y, B(top[i]))
        put("props", x + i, y + 1, B(bot[i]), block=block)
        if inb(x + i, y): occupied[y][x + i] = True

def can_tree(x, y):
    return all(inb(x + i, y + j) and not occupied[y + j][x + i] and not sand[y + j][x + i]
               and not stone[y + j][x + i] and not water[y + j][x + i] for i in range(2) for j in range(2))

def forest(x0, y0, x1, y1):
    kinds = ["green", "green", "green", "dark"]
    for r in range(y0 - 1, y1 + 1):
        for c in range(x0 - 1 + (r % 2), x1 + 1, 2):
            k = random.choice(kinds)
            top = {"green": (8, 9), "dark": (10, 11)}[k]
            bot = {"green": (16, 17), "dark": (18, 19)}[k]
            for i in range(2):
                if x0 <= c + i <= x1 and y0 <= r <= y1: put("above", c + i, r, B(top[i]))
                if x0 <= c + i <= x1 and y0 <= r + 1 <= y1: put("props", c + i, r + 1, B(bot[i]))
    block_rect(x0, y0, x1, y1)

forest(0, 0, 79, 2)
forest(0, 42, 79, 44)
forest(0, 3, 2, 41)
forest(77, 3, 79, 41)

# ================= BUILDINGS =================
def building(x, y, w, top_rows, front_rows, wall, roof, door=None, windows=(), chimney=None,
             win_tile=(594, 602), extra=None):
    rows = [560 + roof] * top_rows + [568 + roof] + [576 + roof] * front_rows + [584 + roof]
    h = len(rows) + 2
    for r, t in enumerate(rows):
        for i in range(w):
            put("above" if r == 0 else "buildings", x + i, y + r, B(t))
    wy = y + len(rows)
    for i in range(w):
        col = 0 if i == 0 else (2 if i == w - 1 else 1)
        put("buildings", x + i, wy, B(wall + col))
        put("buildings", x + i, wy + 1, B(wall + 8 + col))
    if door is not None:
        put("buildings", x + door, wy, B(wall + 7))
        put("buildings", x + door, wy + 1, B(wall + 15))
        put("details", x + door, wy, B(wall + 6))
    for d in windows:
        put("details", x + d, wy, B(win_tile[0])); put("details", x + d, wy + 1, B(win_tile[1]))
    if chimney is not None:
        for k, t in enumerate((567, 575, 583)):
            put("above" if k == 0 else "details", x + chimney, y + k, B(t))
    block_rect(x, y + 1, x + w - 1, y + h - 1)
    return (x, y, w, h, x + door if door is not None else None, wy + 1)

# Town Hall (north of the square)
hall = building(33, 7, 15, 2, 3, 432, 2, door=7, windows=(1, 3, 5, 9, 11, 13), win_tile=(598, 606))
put("details", 39, 14, B(828)); put("details", 39, 15, B(836))
put("details", 41, 14, B(828)); put("details", 41, 15, B(836))
put("details", 40, 9, B(810)); put("details", 40, 10, B(818))    # clock on the gable

# Chapel (north-east)
chapel = building(60, 4, 11, 1, 4, 384, 3, door=5, windows=(1, 3, 7, 9))
put("details", 65, 5, B(614))                                     # cross on the roof

# Smithy (south)
smithy = building(28, 32, 9, 1, 1, 352, 0, door=4, windows=(2, 6), chimney=7, win_tile=(592, 600))
put("details", 30, 36, B(656))                                    # sword sign

# Residences (south-east)
h1 = building(54, 27, 7, 1, 2, 384, 1, door=3, windows=(1, 5), chimney=1)
h2 = building(62, 27, 6, 1, 2, 400, 2, door=3, windows=(1, 4), chimney=4, win_tile=(595, 603))
inn = building(69, 27, 7, 1, 2, 496, 6, door=3, windows=(1, 5), win_tile=(597, 605))
put("details", 71, 32, B(664))                                    # INN sign

# ================= FARM (stamp from sample map) =================
S = load_sample()
def remap(g):
    if g == 0: return 0
    if 577 <= g < 1641: return g - 577 + 1
    if 1641 <= g < 2169: return None      # sample path tiles: repainted by our autotiler
    if 5241 <= g: return g - 5241 + 4665
    return None
def stamp(sx0, sy0, sx1, sy1, dx, dy, skip_block_rows=()):
    for sy in range(sy0, sy1 + 1):
        for sx in range(sx0, sx1 + 1):
            x, y = sx - sx0 + dx, sy - sy0 + dy
            for sl, dl in (("grass", "grass_detail"), ("farm", "buildings"), ("farm_up", "details"),
                           ("building", "buildings"), ("building_up", "details")):
                g = remap(S[sl][sy][sx])
                if g:
                    put(dl, x, y, g)
                    if sl in ("farm", "farm_up", "building") and (sy - sy0) not in skip_block_rows:
                        blocked[y][x] = True
# fields + barn: sample (1,3)-(16,10) -> (4,4)
stamp(1, 3, 16, 10, 4, 4, skip_block_rows=(0,))
# barn roof top row belongs above the players
for x in range(11, 18):
    if L["buildings"][4][x]: L["above"][4][x] = L["buildings"][4][x]; L["buildings"][4][x] = 0
# re-open the barn door approach & fence gaps are fine; hay bales & well below the field
# drop the half laundry line cut off by the stamp edge
for x in (17, 18, 19):
    for n in ("buildings", "details"):
        if L[n][11][x] in (B(246), B(247), B(254), B(255), B(262), B(263), B(270), B(271), B(278), B(279), B(286), B(287)):
            L[n][11][x] = 0; blocked[11][x] = False
put("props", 5, 13, B(873), True); put("props", 6, 13, B(873), True)
put("props", 8, 14, B(226), True)                                  # well
put("props", 9, 14, B(864), True)                                  # bucket

# ================= MARKET STALLS =================
def stall(x, y, goods):
    for i in range(5):
        put("above", x + i, y, B(909)); put("above", x + i, y + 1, B(917))
    put("details", x, y + 2, B(933)); put("details", x + 4, y + 2, B(933))
    for i in range(1, 4): put("details", x + i, y + 2, B(925))
    put("buildings", x, y + 3, B(941)); put("buildings", x + 4, y + 3, B(941))
    put("buildings", x, y + 4, B(949)); put("buildings", x + 4, y + 4, B(949))
    for i, t in enumerate((673, 674, 675)): put("buildings", x + 1 + i, y + 4, B(t))
    for i, t in enumerate(goods): put("details", x + 1 + i, y + 4, B(t))
    block_rect(x, y + 2, x + 4, y + 4)
stall(5, 25, (981, 980, 983))
stall(12, 25, (877, 878, 879))
stall(19, 25, (962, 964, 1010))
for (x, y, t) in [(4, 30, 875), (5, 30, 875), (11, 30, 860), (17, 30, 868), (18, 30, 872), (24, 30, 874),
                  (24, 26, 856), (24, 27, 857)]:
    put("props", x, y, B(t), True)
put("props", 10, 31, B(236), True)                                 # price board

# ================= POND & PIER =================
for y in range(33, 38):
    for i in range(3):
        row = 0 if y == 33 else (2 if y == 37 else 1)
        put("props", 12 + i, y, B(264 + row * 8 + i))
        blocked[y][12 + i] = False
for (x, y, t) in [(8, 36, 59), (17, 38, 58), (19, 36, 59), (9, 39, 58), (16, 35, 58)]:
    put("props", x, y, B(t))
put("props", 22, 35, B(63), True); put("props", 22, 36, B(71), True)   # hollow log
put("props", 4, 33, B(64), True); put("props", 20, 41, B(65), True)

# ================= TOWN SQUARE =================
for (x, y) in [(36, 19), (44, 19), (36, 27), (44, 27)]:
    put("props", x, y, B(943), True)
for (x, y) in [(32, 17), (48, 17), (32, 28), (48, 28)]:
    put("above", x, y - 1, B(907)); put("props", x, y, B(915), True)
for (x, y) in [(37, 17), (43, 17)]:
    put("above", x, y - 1, B(908)); put("props", x, y, B(916), True)
put("props", 33, 19, B(230), True); put("props", 34, 19, B(231), True)
put("props", 33, 20, B(238), True); put("props", 34, 20, B(239), True)
put("props", 47, 20, B(229), True); put("props", 47, 21, B(237), True)   # signpost

# fountain garden (north-east of the hall)
for j in range(3):
    for i in range(3):
        put("buildings", 52 + i, 9 + j, B(928 + j * 8 + i), True)
for (x, y) in [(50, 7), (56, 7), (50, 13), (56, 13)]:
    put("props", x, y, B(935), True)

# ================= CHAPEL GRAVEYARD =================
for x in range(58, 75, 2):
    if 63 <= x <= 67: continue
    put("props", x, 15, B(67 if x % 4 == 2 else 68), True)
    put("props", x, 17, B(68 if x % 4 == 2 else 67), True)
for j in range(2):
    for i in range(2):
        put("props", 72 + i, 14 + j, B(939 + j * 8 + i), True)
for x in list(range(57, 63)) + list(range(68, 76)):
    put("props", x, 19, B(41), True)
tree(57, 13, "dead")
tree(75, 16, "dead")

# ================= SMITHY YARD =================
put("above", 28, 38, B(1048)); put("props", 28, 39, B(1056), True)
put("above", 29, 38, B(1049)); put("props", 29, 39, B(1057), True)
put("props", 36, 38, B(875), True); put("props", 37, 38, B(875), True)
put("props", 37, 39, B(860), True)
put("props", 26, 36, B(866), True); put("props", 27, 36, B(867), True)

# ================= LUMBER YARD (south, east of the street) =================
for (x, y) in [(44, 37), (47, 39)]:
    put("props", x, y, B(46), True); put("props", x + 1, y, B(47), True)
for (x, y, t) in [(49, 37, 866), (50, 37, 866), (51, 37, 867), (44, 40, 44), (50, 40, 45), (47, 36, 873)]:
    put("props", x, y, B(t), True)

# ================= RESIDENCE extras =================
for (x, y, t) in [(61, 33, 875), (76, 32, 875), (68, 33, 856), (53, 32, 857)]:
    put("props", x, y, B(t), True)
put("props", 66, 38, B(226), True)                                 # meadow well
ellipse(flowers, 64, 39, 6.5, 2.2)
for y in range(H):
    for x in range(W):
        if flowers[y][x] and (occupied[y][x] or sand[y][x]): flowers[y][x] = False
blob_paint("grass_detail", flowers, lambda i: FL(i))
for y in range(H):
    for x in range(W):
        if flowers[y][x]: occupied[y][x] = True

# ================= SCATTERED TREES =================
planted = [
    (20, 4, "autumn"), (23, 6, "autumn"), (26, 4, "autumn"), (20, 9, "autumn"), (24, 11, "autumn"),
    (27, 8, "autumn"), (29, 12, "green"), (21, 15, "green"), (26, 16, "green"), (30, 4, "dark"),
    (49, 3, "green"), (57, 4, "dark"), (48, 15, "green"), (58, 9, "green"), (72, 4, "dark"), (74, 8, "green"),
    (5, 16, "green"), (10, 17, "green"), (19, 17, "dark"),
    (27, 26, "green"), (29, 29, "dark"), (26, 32, "green"), (50, 27, "green"), (51, 31, "dark"),
    (46, 30, "green"), (56, 37, "green"), (71, 37, "dark"), (74, 39, "green"), (53, 40, "green"),
    (3, 34, "dark"), (24, 34, "green"), (32, 40, "green"), (43, 32, "green"), (60, 40, "green"),
    (75, 25, "green"), (8, 20, "green"),
]
for x, y, k in planted:
    if can_tree(x, y): tree(x, y, k)

# ================= GRASS VARIATION =================
patches = mask()
for _ in range(14):
    cx, cy = random.randint(4, 75), random.randint(4, 40)
    ellipse(patches, cx, cy, random.uniform(2, 4.5), random.uniform(1.5, 3))
for y in range(H):
    for x in range(W):
        if patches[y][x] and (sand[y][x] or stone[y][x] or water[y][x] or flowers[y][x]
                              or L["grass_detail"][y][x] or blocked[y][x]):
            patches[y][x] = False
blob_paint("grass_detail", patches, lambda i: P(OVL_DARK, i))
for y in range(3, 42):
    for x in range(3, 77):
        if occupied[y][x] or sand[y][x] or stone[y][x] or water[y][x] or L["grass_detail"][y][x]:
            continue
        r = random.random()
        if r < 0.05: L["grass_detail"][y][x] = B(random.choice((48, 49, 49, 51)))
        elif r < 0.07: L["grass_detail"][y][x] = B(random.choice((52, 53)))

# ================= OBJECTS =================
BUTTON = (1280, 742)
assert not blocked[BUTTON[1] // T][BUTTON[0] // T]

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

zones = [
    ("Town Square", 31, 16, 49, 29), ("Town Hall", 33, 7, 47, 15), ("Farm", 3, 3, 19, 17),
    ("Orchard", 20, 3, 31, 20), ("Fountain Garden", 48, 3, 58, 20), ("Chapel", 59, 3, 76, 12),
    ("Graveyard", 56, 13, 76, 20), ("Market", 3, 25, 26, 31), ("Pond", 3, 32, 25, 41),
    ("Smithy", 26, 31, 38, 41), ("Lumber Yard", 42, 30, 53, 41), ("Residences", 53, 25, 76, 35),
    ("Meadow", 54, 36, 76, 41),
]
tasks = [  # optional hooks for future Among-Us-style tasks
    ("Water the crops", 12 * T + 16, 13 * T + 16), ("Draw water from the well", 8 * T + 16, 15 * T + 16),
    ("Ring the chapel bell", 65 * T + 16, 14 * T + 16), ("Restock the market", 13 * T + 16, 30 * T + 16),
    ("Fish at the pier", 13 * T + 16, 36 * T + 16), ("Stoke the forge", 32 * T + 16, 38 * T + 16),
    ("Chop firewood", 49 * T + 16, 38 * T + 16), ("Clean the fountain", 53 * T + 16, 12 * T + 24),
    ("Sign the town ledger", 40 * T + 16, 16 * T + 16), ("Pick flowers", 64 * T + 16, 39 * T + 16),
    ("Tidy the graves", 66 * T + 16, 16 * T + 16), ("Deliver mail to the inn", 72 * T + 16, 34 * T + 16),
]
for _, x, y in tasks:
    assert not blocked[y // T][x // T], _

# ================= WRITE =================
os.makedirs(os.path.join(OUT, "tilesets"), exist_ok=True)
for _, _, img, *_ in TILESETS:
    shutil.copy(os.path.join(SM, img), os.path.join(OUT, "tilesets", img))

# water animation: the sheet holds 8 frames side by side (8 columns each)
water_anim = {}
for i in range(47):
    base = (i // 8) * 64 + (i % 8)
    water_anim[base] = [base + f * 8 for f in range(8)]

def tsx_name(name): return f"tilesets/{name}.tsx"
for first, name, img, cols, count, iw, ih in TILESETS:
    s = [f'<?xml version="1.0" encoding="UTF-8"?>',
         f'<tileset version="1.10" tiledversion="1.11.0" name="{name}" tilewidth="32" tileheight="32" tilecount="{count}" columns="{cols}">',
         f' <image source="{img}" width="{iw}" height="{ih}"/>']
    if name == "water":
        for tid, frames in water_anim.items():
            s.append(f' <tile id="{tid}">\n  <animation>')
            s += [f'   <frame tileid="{f}" duration="180"/>' for f in frames]
            s.append('  </animation>\n </tile>')
    s.append('</tileset>')
    open(os.path.join(OUT, tsx_name(name)), "w", encoding="utf-8").write("\n".join(s) + "\n")

above_layers = {"above"}
objgroups = []
oid = [1]
def obj(name, typ, x, y, w=0, h=0, point=False, props=None):
    o = {"id": oid[0], "name": name, "type": typ, "x": x, "y": y, "width": w, "height": h, "rotation": 0, "visible": True}
    if point: o["point"] = True
    if props: o["properties"] = props
    oid[0] += 1
    return o
objgroups.append(("collision", [obj("", "obstacle", *r) for r in collision], False))
objgroups.append(("spawns", [obj(f"spawn_{i}", "spawn", x, y, point=True) for i, (x, y) in enumerate(spawns)], True))
objgroups.append(("zones", [obj(n, "zone", x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T) for n, x0, y0, x1, y1 in zones], True))
objgroups.append(("points", [obj("emergency_button", "emergency_button", *BUTTON, point=True)] +
                  [obj(n, "task", x, y, point=True) for n, x, y in tasks], True))

# --- TMX ---
t = ['<?xml version="1.0" encoding="UTF-8"?>',
     f'<map version="1.10" tiledversion="1.11.0" orientation="orthogonal" renderorder="right-down" width="{W}" height="{H}" tilewidth="{T}" tileheight="{T}" infinite="0" nextlayerid="{len(LAYERS) + len(objgroups) + 1}" nextobjectid="{oid[0]}">',
     ' <properties>',
     f'  <property name="emergencyButtonX" type="int" value="{BUTTON[0]}"/>',
     f'  <property name="emergencyButtonY" type="int" value="{BUTTON[1]}"/>',
     ' </properties>']
for first, name, *_ in TILESETS:
    t.append(f' <tileset firstgid="{first}" source="{tsx_name(name)}"/>')
lid = 1
for n in LAYERS:
    t.append(f' <layer id="{lid}" name="{n}" width="{W}" height="{H}">')
    if n in above_layers:
        t.append('  <properties>\n   <property name="depth" value="above-players"/>\n  </properties>')
    t.append('  <data encoding="csv">')
    t.append(",\n".join(",".join(str(g) for g in row) for row in L[n]))
    t.append('</data>\n </layer>'); lid += 1
for n, objs, visible in objgroups:
    t.append(f' <objectgroup id="{lid}" name="{n}"' + ('' if visible else ' visible="0"') + '>'); lid += 1
    for o in objs:
        attrs = f'id="{o["id"]}"' + (f' name="{o["name"]}"' if o["name"] else "") + f' type="{o["type"]}" x="{o["x"]}" y="{o["y"]}"'
        if o.get("point"): t.append(f'  <object {attrs}>\n   <point/>\n  </object>')
        else: t.append(f'  <object {attrs} width="{o["width"]}" height="{o["height"]}"/>')
    t.append(' </objectgroup>')
t.append('</map>')
open(os.path.join(OUT, "pu-town.tmx"), "w", encoding="utf-8").write("\n".join(t) + "\n")

# --- JSON (embedded tilesets; loads directly in Phaser: this.load.tilemapTiledJSON) ---
j = {"compressionlevel": -1, "type": "map", "version": "1.10", "tiledversion": "1.11.0",
     "orientation": "orthogonal", "renderorder": "right-down", "infinite": False,
     "width": W, "height": H, "tilewidth": T, "tileheight": T,
     "nextlayerid": len(LAYERS) + len(objgroups) + 1, "nextobjectid": oid[0],
     "properties": [{"name": "emergencyButtonX", "type": "int", "value": BUTTON[0]},
                    {"name": "emergencyButtonY", "type": "int", "value": BUTTON[1]}],
     "tilesets": [], "layers": []}
for first, name, img, cols, count, iw, ih in TILESETS:
    ts = {"firstgid": first, "name": name, "image": f"tilesets/{img}", "imagewidth": iw, "imageheight": ih,
          "tilewidth": T, "tileheight": T, "columns": cols, "tilecount": count, "margin": 0, "spacing": 0}
    if name == "water":
        ts["tiles"] = [{"id": tid, "animation": [{"tileid": f, "duration": 180} for f in fr]} for tid, fr in water_anim.items()]
    j["tilesets"].append(ts)
lid = 1
for n in LAYERS:
    lay = {"id": lid, "name": n, "type": "tilelayer", "width": W, "height": H, "x": 0, "y": 0,
           "opacity": 1, "visible": True, "data": [g for row in L[n] for g in row]}
    if n in above_layers: lay["properties"] = [{"name": "depth", "type": "string", "value": "above-players"}]
    j["layers"].append(lay); lid += 1
for n, objs, visible in objgroups:
    j["layers"].append({"id": lid, "name": n, "type": "objectgroup", "draworder": "topdown", "x": 0, "y": 0,
                        "opacity": 1, "visible": visible, "objects": objs}); lid += 1
json.dump(j, open(os.path.join(OUT, "pu-town.json"), "w"), separators=(",", ":"))

# --- plain data for server-side rules (RoomRules / room-rules.ts) ---
json.dump({"world": {"width": W * T, "height": H * T}, "tileSize": T,
           "emergencyButton": {"x": BUTTON[0], "y": BUTTON[1]},
           "obstacles": [{"x": x, "y": y, "width": w, "height": h} for x, y, w, h in collision],
           "spawns": [{"x": x, "y": y} for x, y in spawns],
           "zones": [{"name": n, "x": x0 * T, "y": y0 * T, "width": (x1 - x0 + 1) * T, "height": (y1 - y0 + 1) * T} for n, x0, y0, x1, y1 in zones],
           "tasks": [{"name": n, "x": x, "y": y} for n, x, y in tasks],
           "walkable": ["".join("#" if c else "." for c in row) for row in blocked]},
          open(os.path.join(OUT, "pu-town.collision.json"), "w"), indent=1)
print("rects", len(collision))

# --- preview ---
if __name__ == "__main__":
    from PIL import Image, ImageDraw
    imgs = {}
    def timg(g):
        for first, name, img, cols, *_ in reversed(TILESETS):
            if g >= first:
                if img not in imgs: imgs[img] = Image.open(os.path.join(SM, img)).convert("RGBA")
                i = g - first
                return imgs[img].crop(((i % cols) * T, (i // cols) * T, (i % cols) * T + T, (i // cols) * T + T))
    im = Image.new("RGBA", (W * T, H * T))
    for n in LAYERS:
        for y in range(H):
            for x in range(W):
                if L[n][y][x]: im.alpha_composite(timg(L[n][y][x]), (x * T, y * T))
    im.save(os.path.join(OUT, "pu-town-preview.png"))
    dbg = im.copy(); d = ImageDraw.Draw(dbg, "RGBA")
    for x, y, w, h in collision: d.rectangle([x, y, x + w - 1, y + h - 1], fill=(255, 0, 0, 70), outline=(255, 0, 0, 160))
    for x, y in spawns: d.ellipse([x - 8, y - 8, x + 8, y + 8], fill=(0, 120, 255, 220))
    d.ellipse([BUTTON[0] - 12, BUTTON[1] - 12, BUTTON[0] + 12, BUTTON[1] + 12], fill=(255, 220, 0, 255))
    for n, x, y in tasks: d.rectangle([x - 7, y - 7, x + 7, y + 7], fill=(0, 220, 120, 230))
    for n, x0, y0, x1, y1 in zones: d.text((x0 * T + 6, y0 * T + 4), n, fill=(255, 255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0, 255))
    dbg.save(os.path.join(OUT, "pu-town-collision-preview.png"))
