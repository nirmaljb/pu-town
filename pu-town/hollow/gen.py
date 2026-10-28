"""Generates the Hollow — PU Town's woodland map — as a Tiled JSON map plus its collision data.

The town sits in a clearing walled in by forest: a river with two plank bridges runs down its west
side past the orchard, the farm and a fishing camp; the cobbled Town Square and its manor hold the
middle; a market lane runs along the south; houses and a smithy line the east road; and an old
stone shrine with a portal stands in the north-east glade. Lamp posts, hearths, windows and the
portal are written to a `lights` layer, which the client uses to draw the town at night.

Art (all drawn at 2x, so its 16 px tiles become the game's 32 px tiles):
  * The Fan-tasy Tileset (Free) — ground, roads, water, houses, trees, props, campfire, flowers
  * Sprout Lands Basic pack — cows, chickens, coop, crops, fences, apple trees, mushrooms
  * Resurrected RPG — the shrine's statues, portal, obelisk, pillars and gazebo
  * Idle Working.png — the smith at the anvil

Run: python gen.py [--assets DIR] [--serve DIR]
  --assets  folder holding the three archives and Idle Working.png (default ~/Desktop/assets)
  --serve   also copy the map into the client (default ../../frontend/public/maps/pu-town)
"""
import argparse, colorsys, json, math, os, random, shutil, subprocess, tempfile
import xml.etree.ElementTree as ET
from collections import defaultdict, deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

T, W, H = 32, 80, 45                     # 32 px tiles; the world is 2560 x 1440
S = 2                                    # every source pixel becomes 2x2
PX_W, PX_H = W * T, H * T
BUTTON = (1280, 742)
# The manor's front wall: the game tests walk into it at x 1280, so it must end exactly here.
MANOR_FRONT = 512

random.seed(7)

# ================================================================ sources
ap = argparse.ArgumentParser()
ap.add_argument("--assets", default=os.path.join(os.path.expanduser("~"), "Desktop", "assets"))
ap.add_argument("--serve", default=os.path.join(REPO, "frontend", "public", "maps", "pu-town"))
ap.add_argument("--no-serve", action="store_true")
args = ap.parse_args()

SRC = os.path.join(tempfile.gettempdir(), "pu-town-hollow-sources")
ARCHIVES = {
    "fantasy": "The Fan-tasy Tileset (Free) 1.5.9.zip",
    "sprout": "Sprout Lands - Sprites - Basic pack.zip",
    "resurrected": "Resurrected RPG 1.1.rar",
}
for folder, archive in ARCHIVES.items():
    target = os.path.join(SRC, folder)
    if not os.path.isdir(target):
        os.makedirs(target)
        subprocess.run(["tar", "-xf", os.path.join(args.assets, archive), "-C", target], check=True)
FT = os.path.join(SRC, "fantasy", "The Fan-tasy Tileset (Free)")
FA = os.path.join(FT, "Art")
SP = os.path.join(SRC, "sprout", "Sprout Lands - Sprites - Basic pack")
RS = os.path.join(SRC, "resurrected")
SMITH = os.path.join(args.assets, "Idle Working.png")


def load(path):
    return Image.open(path).convert("RGBA")


def up(im, k=S):
    return im.resize((im.width * k, im.height * k), Image.NEAREST)


# ================================================================ grids
def grid(v=False):
    return [[v] * W for _ in range(H)]


grass = grid(True)      # False = bare dirt
water = grid()
road = grid()
bridge = grid()         # water you can walk over
blocked = grid()
fence = grid()


def inside(x, y):
    return 0 <= x < W and 0 <= y < H


def fill(g, x0, y0, x1, y1, v=True):
    for y in range(max(0, y0), min(H - 1, y1) + 1):
        for x in range(max(0, x0), min(W - 1, x1) + 1):
            g[y][x] = v


def blob(g, cx, cy, rx, ry, v=True, wobble=0.0):
    for y in range(H):
        for x in range(W):
            d = ((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2
            if d <= 1 + wobble * (math.sin(x * 1.7 + y * 0.9) * 0.5):
                g[y][x] = v


# ---------------------------------------------------------------- the forest wall
def edge_depth(i, base, amp, seed):
    return base + int(round(amp * (0.5 + 0.5 * math.sin(i * 0.45 + seed) * math.cos(i * 0.21 + seed * 2))))


forest = grid()
for x in range(W):
    for y in range(edge_depth(x, 3, 2, 1.0)):
        forest[y][x] = True
    for y in range(H - edge_depth(x, 2, 1, 2.0), H):
        forest[y][x] = True
for y in range(H):
    for x in range(edge_depth(y, 2, 2, 3.0)):
        forest[y][x] = True
    for x in range(W - edge_depth(y, 2, 2, 4.0), W):
        forest[y][x] = True
# Thicker groves push in at the corners.
blob(forest, 0, 0, 7, 6)
blob(forest, W, 0, 5, 5)
blob(forest, 0, H, 5, 6)
blob(forest, W, H, 7, 5)


# ---------------------------------------------------------------- the river and the moon pond
def river_x(y):
    return 19.5 + 1.4 * math.sin(y / 5.5) + 0.6 * math.sin(y / 2.3 + 1)


for y in range(H):
    c = river_x(y)
    for x in range(W):
        if abs(x + .5 - c) < 1.9:
            water[y][x] = True
blob(water, 28.5, 7.5, 3.6, 2.6)                     # Moon Pond, north-west of the manor
BRIDGES = [(8, 10), (22, 24)]                         # tile rows the two bridges span
for r0, r1 in BRIDGES:
    for y in range(r0, r1 + 1):
        for x in range(W):
            if water[y][x] and abs(x + .5 - river_x(y)) < 3:
                bridge[y][x] = True

# ---------------------------------------------------------------- roads
blob(road, 40, 23.2, 12.6, 8.4)                       # Town Square, an oval of cobbles round the button
fill(road, 3, 22, 76, 24)                             # high road, west to east
fill(road, 39, 30, 41, 38)                            # south to the market
fill(road, 23, 36, 57, 38)                            # market lane
fill(road, 25, 9, 26, 21)                             # north-west lane up to the orchard bridge
fill(road, 6, 8, 26, 10)                              # orchard road over the north bridge
fill(road, 62, 12, 63, 21)                            # north-east path to the shrine, between the homes
fill(road, 9, 25, 10, 33)                             # farm track to the fishing camp
for g in (road,):
    for y in range(H):
        for x in range(W):
            if water[y][x] and not bridge[y][x]:
                g[y][x] = False
            if forest[y][x]:
                g[y][x] = False

# ---------------------------------------------------------------- bare ground
blob(grass, 66, 9, 10, 5.5, False, wobble=0.4)       # the shrine's worn glade
blob(grass, 9.5, 29.5, 6.5, 3.2, False, wobble=0.3)  # farm field
blob(grass, 22, 40, 4, 2.2, False, wobble=0.3)       # fishing camp
blob(grass, 67, 35, 7, 4, False, wobble=0.3)         # smithy yard
for (cx, cy) in [(45, 12), (35, 13), (72, 27), (48, 34), (14, 16), (7, 40), (33, 41)]:
    blob(grass, cx, cy, random.uniform(1.4, 2.4), random.uniform(1.2, 2), False, wobble=0.4)
for y in range(H):
    for x in range(W):
        if forest[y][x] and random.random() < 0.05:
            grass[y][x] = False

# ================================================================ terrain tiles (Wang sets)
TSX = os.path.join(FT, "Tiled", "Tilesets")


def wangset(file):
    root = ET.parse(os.path.join(TSX, file)).getroot()
    prob = {int(t.get("id")): float(t.get("probability", "1")) for t in root.findall("tile")}
    anim = {}
    for t in root.findall("tile"):
        a = t.find("animation")
        if a is not None:
            anim[int(t.get("id"))] = [(int(f.get("tileid")), int(f.get("duration"))) for f in a]
    table = defaultdict(list)
    for w in root.iter("wangtile"):
        tid = int(w.get("tileid"))
        table[tuple(int(v) for v in w.get("wangid").split(","))].append((tid, prob.get(tid, 1.0)))
    return table, anim, int(root.get("columns")), int(root.get("tilecount"))


def pick(options):
    total = sum(p for _, p in options)
    r = random.uniform(0, total)
    for tid, p in options:
        r -= p
        if r <= 0:
            return tid
    return options[-1][0]


def autotile(g, table, fg, bg, edge=True):
    """Blob autotiling: each terrain cell takes the tile whose 8 neighbours (Tiled wangid order:
    top, top-right, right, bottom-right, bottom, bottom-left, left, top-left) match its own."""
    out = [[None] * W for _ in range(H)]

    def at(x, y):
        return g[y][x] if inside(x, y) else edge

    for y in range(H):
        for x in range(W):
            if not g[y][x]:
                continue
            N, E, S_, Wt = at(x, y - 1), at(x + 1, y), at(x, y + 1), at(x - 1, y)
            NE, SE, SW, NW = at(x + 1, y - 1), at(x + 1, y + 1), at(x - 1, y + 1), at(x - 1, y - 1)
            e = lambda a: fg if a else bg
            c = lambda a, b, d: fg if a and b and d else bg
            key = (e(N), c(N, E, NE), e(E), c(S_, E, SE), e(S_), c(S_, Wt, SW), e(Wt), c(N, Wt, NW))
            if key not in table:
                # A shape the set does not draw: take the closest tile, matching edges first.
                key = min((k for k in table if bg in k or set(k) == {fg}),
                          key=lambda k: sum((2 if i % 2 == 0 else 1) * (k[i] != key[i]) for i in range(8)))
            out[y][x] = pick(table[key])
    return out


ground_table, _, ground_cols, ground_count = wangset("Tileset_Ground.tsx")
water_table, water_anim, water_cols, water_count = wangset("Tileset_Water.tsx")
road_table, _, road_cols, road_count = wangset("Tilesets_Road.tsx")

ground_tiles = autotile(grass, ground_table, 1, 2)
for y in range(H):
    for x in range(W):
        if not grass[y][x]:
            ground_tiles[y][x] = pick(ground_table[(2,) * 8])
water_tiles = autotile(water, water_table, 1, 0)
road_tiles = autotile(road, road_table, 1, 0, edge=False)

# Sprout Lands fences: a 4x4 sheet of posts joined to their neighbours.
FENCE_PIECES = {
    (0, 0, 1, 0): (0, 0), (1, 0, 1, 0): (0, 1), (1, 0, 0, 0): (0, 2), (0, 0, 0, 0): (0, 3),
    (0, 1, 0, 0): (1, 3), (0, 1, 0, 1): (2, 3), (0, 0, 0, 1): (3, 3),
    (0, 1, 1, 0): (1, 0), (0, 1, 1, 1): (2, 0), (0, 0, 1, 1): (3, 0),
    (1, 1, 1, 0): (1, 1), (1, 1, 1, 1): (2, 1), (1, 0, 1, 1): (3, 1),
    (1, 1, 0, 0): (1, 2), (1, 1, 0, 1): (2, 2), (1, 0, 0, 1): (3, 2),
}


def fence_line(x0, y0, x1, y1, gaps=()):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if (x, y) not in gaps:
                fence[y][x] = True


# ================================================================ object art
ART = os.path.join(HERE, "build")
if os.path.isdir(ART):
    shutil.rmtree(ART)
os.makedirs(os.path.join(ART, "objects"))
os.makedirs(os.path.join(ART, "terrain"))

CATALOG = {}   # key -> dict(frames=[Image], dur=ms, foot=(x,y,w,h) in output px or None, lights=[...])


def register(key, frames, dur=0, foot=None, lights=(), scale=S):
    frames = [up(f, scale) if scale != 1 else f for f in frames]
    k = scale
    CATALOG[key] = dict(frames=frames, dur=dur,
                        foot=None if foot is None else tuple(v * k for v in foot),
                        lights=[(lx * k, ly * k, r, col) for lx, ly, r, col in lights])


def strip(im, fw, fh, indices):
    cols = im.width // fw
    return [im.crop(((i % cols) * fw, (i // cols) * fh, (i % cols) * fw + fw, (i // cols) * fh + fh)) for i in indices]


def autumn(im, hue):
    """Recolours a green canopy (leaves only, not the trunk) to an autumn hue."""
    a = np.array(im).astype(np.float32) / 255
    out = a.copy()
    for (yy, xx) in zip(*np.nonzero(a[:, :, 3] > 0)):
        r, g, b, _ = a[yy, xx]
        h, l, s = colorsys.rgb_to_hls(r, g, b)
        if 0.2 < h < 0.5 and s > 0.15:
            nr, ng, nb = colorsys.hls_to_rgb(hue + (h - 0.36) * 0.25, l * 0.98, min(1, s * 1.1))
            out[yy, xx, :3] = (nr, ng, nb)
    return Image.fromarray((out * 255).astype(np.uint8))


WARM, FIRE, COLD, ARCANE = "#ffc26b", "#ff8a3d", "#9fd8ff", "#b79cff"

# Fan-tasy houses and town pieces
B = os.path.join(FA, "Buildings")
register("manor", [load(os.path.join(B, "House_Hay_3.png"))], foot=(0, 64, 175, 64),
         lights=[(78, 110, 150, WARM), (145, 96, 110, WARM), (40, 90, 110, WARM)])
register("barn", [load(os.path.join(B, "House_Hay_2.png"))], foot=(2, 58, 155, 54),
         lights=[(130, 98, 120, WARM), (40, 72, 100, WARM)])
register("cottage", [load(os.path.join(B, "House_Hay_1.png"))], foot=(5, 50, 80, 41),
         lights=[(44, 80, 110, WARM), (20, 70, 80, WARM), (69, 70, 80, WARM)])
register("cottage_purple", [load(os.path.join(B, "House_Hay_4_Purple.png"))], foot=(4, 62, 120, 66),
         lights=[(90, 110, 120, WARM), (40, 96, 90, WARM)])
register("gate", [load(os.path.join(B, "CityWall_Gate_1.png"))], foot=None)
register("well", [load(os.path.join(B, "Well_Hay_1.png"))], foot=(7, 52, 42, 22))

PR = os.path.join(FA, "Props")
register("lamp", [load(os.path.join(PR, "LampPost_3.png"))], foot=(17, 50, 12, 12),
         lights=[(5, 26, 150, WARM), (41, 26, 150, WARM)])
register("bench", [load(os.path.join(PR, "Bench_1.png"))], foot=(0, 8, 14, 22))
register("bench_small", [load(os.path.join(PR, "Bench_3.png"))], foot=(0, 4, 14, 10))
register("board", [load(os.path.join(PR, "BulletinBoard_1.png"))], foot=(0, 28, 44, 14))
register("stump", [load(os.path.join(PR, "Chopped_Tree_1.png"))], foot=(4, 12, 24, 14))
register("crate", [load(os.path.join(PR, "Crate_Large_Empty.png"))], foot=(0, 12, 24, 17))
register("crate_small", [load(os.path.join(PR, "Crate_Medium_Closed.png"))], foot=(0, 9, 16, 12))
register("plant", [load(os.path.join(PR, "Plant_2.png"))])
register("sack", [load(os.path.join(PR, "Sack_3.png"))])
register("sign", [load(os.path.join(PR, "Sign_1.png"))], foot=(8, 14, 8, 8))
register("sign2", [load(os.path.join(PR, "Sign_2.png"))], foot=(8, 14, 8, 8))
register("banner", [load(os.path.join(PR, "Banner_Stick_1_Purple.png"))], foot=(7, 50, 10, 9))
register("trough", [load(os.path.join(PR, "Crate_Water_1.png"))], foot=(0, 8, 30, 14))
register("hearth", [load(os.path.join(PR, "Fireplace_1.png"))], foot=(0, 10, 30, 16),
         lights=[(15, 12, 170, FIRE)])
register("haystack", [load(os.path.join(PR, "HayStack_2.png"))], foot=(0, 10, 29, 22))
register("barrel", [load(os.path.join(PR, "Barrel_Small_Empty.png"))], foot=(0, 8, 16, 12))
register("basket", [load(os.path.join(PR, "Basket_Empty.png"))])
register("stall", [load(os.path.join(PR, "Table_Medium_1.png"))], foot=(0, 14, 42, 25))
camp = load(os.path.join(PR, "Animation", "Animation_Campfire.png"))
register("campfire", strip(camp, 32, 32, range(8)), 100, foot=(4, 16, 24, 14), lights=[(16, 18, 260, FIRE)])


def flower_frames(file, k):
    im = load(os.path.join(PR, "Animation", file))
    col, row = k % 48, k // 48
    return [im.crop((96 * f + 16 * col, 16 * row, 96 * f + 16 * col + 16, 16 * row + 16)) for f in range(8)]


FLOWERS = []
for file, tag in (("Flowers_Red.png", "red"), ("Flowers_White.png", "white")):
    for k in (0, 1, 3, 5, 48, 49, 51):
        key = f"flowers_{tag}_{k}"
        register(key, flower_frames(file, k), 150 if tag == "red" else 120)
        FLOWERS.append(key)

RK = os.path.join(FA, "Rocks")
register("rock_wide", [load(os.path.join(RK, "Rock_Brown_1.png"))], foot=(0, 4, 28, 10))
register("rock_tall", [load(os.path.join(RK, "Rock_Brown_2.png"))], foot=(0, 16, 15, 12))
register("rock", [load(os.path.join(RK, "Rock_Brown_4.png"))], foot=(0, 12, 27, 13))
register("pebble", [load(os.path.join(RK, "Rock_Brown_6.png"))])
register("pebble_small", [load(os.path.join(RK, "Rock_Brown_9.png"))])

TB = os.path.join(FA, "Trees and Bushes")
trees = {
    "pine": ("Tree_Emerald_1.png", (24, 52, 18, 10)),
    "tree_small": ("Tree_Emerald_2.png", (16, 52, 14, 9)),
    "tree": ("Tree_Emerald_3.png", (16, 80, 22, 11)),
    "tree_tall": ("Tree_Emerald_4.png", (16, 82, 18, 10)),
}
for key, (file, foot) in trees.items():
    im = load(os.path.join(TB, file))
    register(key, [im], foot=foot)
    if key != "pine":
        register(key + "_amber", [autumn(im, 0.10)], foot=foot)
        register(key + "_crimson", [autumn(im, 0.02)], foot=foot)
for i, foot in ((1, (2, 14, 36, 13)), (2, None), (3, (2, 12, 24, 14)), (4, None), (5, None), (6, None), (7, None)):
    register(f"bush{i}", [load(os.path.join(TB, f"Bush_Emerald_{i}.png"))], foot=foot)

SH = os.path.join(FA, "Shadows")
for size in ("16x16", "24x24", "32x16", "32x32", "40x40", "48x24", "48x48"):
    shadow = load(os.path.join(SH, f"Shadow_Round_{size}_Medium_Black.png"))
    shadow.putalpha(shadow.getchannel("A").point(lambda a: a * 30 // 100))   # the pack expects a 30% layer
    register(f"shadow_{size}", [shadow])

# Sprout Lands farm
cow = load(os.path.join(SP, "Characters", "Free Cow Sprites.png"))
register("cow", strip(cow, 32, 32, [0, 1, 2, 1]), 380, foot=(6, 16, 22, 12))
register("cow_grazing", strip(cow, 32, 32, [3, 4]), 520, foot=(6, 16, 22, 12))
hen = load(os.path.join(SP, "Characters", "Free Chicken Sprites.png"))
register("chicken", strip(hen, 16, 16, [2, 3, 4, 5]), 260)
register("chicken_idle", strip(hen, 16, 16, [0, 1]), 600)
register("coop", [load(os.path.join(SP, "Objects", "Free_Chicken_House.png"))], foot=(4, 24, 40, 22))
plants = load(os.path.join(SP, "Objects", "Basic_Plants.png"))
for i, key in ((3, "wheat_young"), (4, "wheat"), (9, "eggplant_young"), (10, "eggplant")):
    register(key, strip(plants, 16, 16, [i]))
biome = load(os.path.join(SP, "Objects", "Basic_Grass_Biom_things.png"))
register("apple_tree", [biome.crop((48, 0, 80, 32))], foot=(10, 22, 12, 8))
register("mushrooms", [biome.crop((80, 0, 96, 16))])
register("mushroom", [biome.crop((96, 0, 112, 16))])
register("mushroom_purple", [biome.crop((128, 0, 144, 16))])
register("sunflower", [biome.crop((128, 32, 144, 64))])
register("lily", [biome.crop((112, 64, 128, 80))])
register("log", [biome.crop((80, 32, 112, 48))], foot=(2, 6, 28, 8))

# Resurrected RPG shrine (its own pixels are finer; it is drawn at the same 2x so it sits in scale)
rp = load(os.path.join(RS, "Props.png"))
crop = lambda x, y, w, h: rp.crop((x, y, x + w, y + h))
register("obelisk", [crop(13, 13, 38, 86)], foot=(6, 66, 26, 20), lights=[(19, 40, 110, ARCANE)], scale=1)
register("angel", [crop(202, 13, 57, 166)], foot=(6, 120, 46, 46), scale=1)
register("angel_r", [crop(301, 13, 57, 166)], foot=(6, 120, 46, 46), scale=1)
register("pillar", [crop(149, 38, 46, 62)], foot=(6, 40, 34, 22), scale=1)
register("pillar_broken", [crop(83, 53, 52, 46)], foot=(4, 26, 44, 20), scale=1)
register("standing_stone", [crop(397, 61, 38, 118)], foot=(2, 96, 34, 22), lights=[(19, 30, 90, ARCANE)], scale=1)
register("portal", [crop(13, 154, 167, 104)], foot=(14, 62, 140, 42), lights=[(88, 36, 300, ARCANE), (88, 36, 140, COLD)], scale=1)
register("small_shrine", [crop(205, 195, 37, 52)], foot=(2, 30, 33, 22), lights=[(18, 30, 90, WARM)], scale=1)
register("gazebo", [crop(332, 204, 88, 94)], foot=(6, 52, 76, 42), scale=1)
register("dais", [crop(231, 258, 88, 41)], scale=1)
register("stepping_stones", [crop(217, 325, 108, 67)], scale=1)
register("stepping_arc", [crop(7, 260, 119, 112)], scale=1)

# The smith at the anvil
smith = load(SMITH)
register("smith", strip(smith, 32, 32, range(8)), 140, foot=(6, 18, 20, 14), lights=[(8, 22, 120, FIRE)])


def make_bridge(width, height):
    """A plank bridge in the Sprout Lands palette, crossing east-west, in source pixels."""
    im = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    dark, mid, light, rail, post = (122, 84, 58), (186, 132, 86), (214, 164, 110), (156, 106, 68), (110, 74, 50)
    d.rectangle((0, 3, width - 1, height - 4), fill=dark)
    for x in range(1, width - 1, 4):
        d.rectangle((x, 4, x + 2, height - 5), fill=mid)
        d.line((x, 4, x, height - 5), fill=light)
    for yy in (1, height - 4):
        d.rectangle((0, yy, width - 1, yy + 2), fill=rail)
        d.line((0, yy, width - 1, yy), fill=light)
    for x in list(range(0, width - 3, 12)) + [width - 4]:
        d.rectangle((x, 0, x + 3, 5), fill=post)
        d.rectangle((x, height - 6, x + 3, height - 1), fill=post)
    return im


# ================================================================ placing things
objects, decor, lights_extra = [], [], []
occupied = []        # rough footprints already used, to stop scatter overlapping


def place(key, x, y, flip=False, layer="objects"):
    """Puts an object with its bottom-left corner at (x, y) in world pixels."""
    info = CATALOG[key]
    w, h = info["frames"][0].size
    item = dict(key=key, x=int(x), y=int(y), w=w, h=h, flip=flip)
    (objects if layer == "objects" else decor).append(item)
    if info["foot"] is not None:
        fx, fy, fw, fh = info["foot"]
        if flip:
            fx = w - fx - fw
        occupied.append((x + fx, y - h + fy, fw, fh))
    return item


def place_c(key, cx, by, **kw):
    """Puts an object centred on cx with its bottom at by."""
    return place(key, cx - CATALOG[key]["frames"][0].width // 2, by, **kw)


def free(x, y, w, h, pad=6):
    return not any(x < ox + ow + pad and x + w + pad > ox and y < oy + oh + pad and y + h + pad > oy
                   for ox, oy, ow, oh in occupied)


def cell_ok(px, py, allow_dirt=True):
    x, y = int(px // T), int(py // T)
    return inside(x, y) and not water[y][x] and not road[y][x] and not fence[y][x] and (allow_dirt or grass[y][x])


# ---------------------------------------------------------------- the Town Square and the manor
manor = place_c("manor", BUTTON[0], MANOR_FRONT + 8)
# The Emergency button stands on an old stone dais at the heart of the square.
place_c("dais", BUTTON[0], BUTTON[1] + 22, layer="decor")
for x, y in ((929, 540), (1631, 540), (929, 1000), (1631, 1000)):
    place_c("lamp", x, y)
# Flower beds fill the square's corners outside the oval of cobbles.
for cx, cy in ((960, 560), (1600, 560), (960, 960), (1600, 960)):
    for i in range(9):
        place_c(random.choice(FLOWERS), cx + random.randint(-46, 46), cy + random.randint(-30, 30), layer="decor")
place_c("banner", 1080, 520)
place_c("banner", 1480, 520)
place_c("board", 1180, 1080)
# Benches sit by the square, clear of the high road where it leaves the plaza.
place_c("bench", 905, 650)
place_c("bench", 1655, 650, flip=True)

# Moon Pond and its grove
place("lily", 860, 230)
place("lily", 940, 262)
place_c("bench_small", 1000, 330)
for x, y, k in ((780, 300, "tree_amber"), (1020, 200, "tree_tall"), (760, 180, "tree_small_crimson")):
    place_c(k, x, y)
place_c("small_shrine", 910, 350)

# Behind the manor to the east: the shrine gate
place_c("gate", 2016, 520)          # the shrine gate stands on its path
place_c("haystack", 1600, 430)
place_c("haystack", 1650, 450)

# ---------------------------------------------------------------- the shrine glade (north-east)
place_c("dais", 2110, 400, layer="decor")
place_c("stepping_arc", 2016, 390, layer="decor")
place_c("stepping_stones", 2250, 470, layer="decor")
place_c("portal", 2112, 300)
place_c("angel", 1915, 345)
place_c("angel_r", 2295, 345)
place_c("obelisk", 1840, 280)
place_c("standing_stone", 2400, 300)
place_c("pillar", 1850, 450)
place_c("pillar_broken", 2250, 470)
place_c("gazebo", 2380, 460)
place_c("small_shrine", 2190, 470)
place_c("pillar_broken", 1810, 470, flip=True)

# ---------------------------------------------------------------- the west bank: orchard, farm, fishing camp
for row, y in enumerate((150, 230)):
    for i, x in enumerate(range(140, 520, 92)):
        k = random.choice(["tree_small_amber", "tree_small_crimson", "apple_tree", "tree_small_amber"])
        place_c(k, x + (row * 40) + random.randint(-6, 6), y + random.randint(-4, 4), flip=random.random() < .5)
place_c("basket", 330, 268)
place_c("crate_small", 360, 270)
place_c("sign", 600, 252)

place("barn", 104, 610)
place_c("coop", 470, 600)
place_c("haystack", 120, 660)
place_c("trough", 560, 640)
place_c("hearth", 330, 680)
for x in range(130, 520, 48):
    for y in (900, 960):
        place_c(random.choice(["wheat", "wheat", "wheat_young"]), x + random.randint(-4, 4), y)
for x in range(140, 520, 48):
    place_c(random.choice(["eggplant", "eggplant_young"]), x + random.randint(-4, 4), 1020)
place_c("sunflower", 110, 1010)
place_c("sunflower", 540, 1010)
place_c("sign2", 360, 860)

# Pasture: a fenced paddock south-west, with cows and chickens.
fence_line(3, 34, 15, 34, gaps={(9, 34), (10, 34)})
fence_line(3, 34, 3, 41)
fence_line(15, 34, 15, 41)
fence_line(3, 41, 15, 41)
for x, y, k, f in ((200, 1160, "cow", False), (330, 1230, "cow_grazing", True), (420, 1150, "cow", True),
                   (180, 1290, "cow_grazing", False)):
    place_c(k, x, y, flip=f)
for x, y in ((260, 1300), (300, 1320), (440, 1290), (380, 1110)):
    place_c(random.choice(["chicken", "chicken_idle"]), x, y, flip=random.random() < .5)
place_c("trough", 460, 1220)

# Fishing camp by the river, south
place_c("campfire", 700, 1290)
place_c("log", 640, 1300)
place_c("log", 760, 1320)
place_c("stump", 700, 1240)
place_c("crate", 800, 1270)
place_c("barrel", 830, 1280)

# ---------------------------------------------------------------- the market lane (south)
for i, x in enumerate(range(800, 1800, 150)):
    if 1240 < x < 1340:
        continue
    place_c("stall", x, 1120)
    place_c(random.choice(["crate_small", "sack", "basket"]), x - 34, 1140)
    place_c(random.choice(["barrel", "sack", "crate_small"]), x + 34, 1140)
for x in range(860, 1760, 300):
    place_c("lamp", x, 1260)
place_c("well", 1280, 1300)
place_c("banner", 1210, 1290)
place_c("banner", 1350, 1290)
place_c("haystack", 820, 1310)
place_c("crate", 1790, 1300)

# ---------------------------------------------------------------- the east road: homes and the smithy
place("cottage_purple", 1690, 690)
place("cottage", 2070, 690)
place("cottage", 2270, 690)
place_c("bench", 2470, 680)
place("cottage", 1720, 1000)
place("barn", 2040, 1040)       # the smithy
place_c("hearth", 2010, 1060)
place_c("smith", 1960, 1100)
place_c("stump", 2380, 1090)
place_c("log", 2400, 1140)
place_c("log", 2340, 1170)
place_c("crate", 2010, 1130)
place_c("barrel", 1900, 1120)
place_c("rock", 2440, 1050)
for x in (1770, 2110, 2420):
    place_c("lamp", x, 780)

# Road lamps on the west side and the high road
for x, y in ((820, 780), (330, 780), (640, 280)):
    place_c("lamp", x, y)

# ================================================================ forest and scatter
# Blocked ground so far: water (bridges aside), forest, fences, objects' feet.
for y in range(H):
    for x in range(W):
        if (water[y][x] and not bridge[y][x]) or forest[y][x] or fence[y][x]:
            blocked[y][x] = True

# The forest wall: big trees packed tight, pines most of all.
def in_forest(px, py):
    """Off the map counts as forest; so does any forest tile that is not river."""
    x, y = int(px // T), int(py // T)
    if not inside(x, y):
        return True
    return forest[y][x] and not water[y][x]


# A tree belongs to the wall only if its whole canopy stays over forest, so none hangs over the town.
forest_trees = []
for y in range(-40, PX_H + 90, 36):
    for x in range(-40, PX_W + 40, 42):
        px, py = x + random.randint(-14, 14), y + random.randint(-10, 10)
        k = random.choices(["pine", "tree", "tree_tall", "tree_small", "tree_amber", "tree_tall_crimson",
                            "tree_small_crimson"], [6, 3, 3, 3, 1, 1, 1])[0]
        w, h = CATALOG[k]["frames"][0].size
        if all(in_forest(px + dx, py - dy) for dx in (-w * 0.3, 0, w * 0.3) for dy in (6, h * 0.55)):
            forest_trees.append((k, px, py, random.random() < .5))
for k, px, py, f in forest_trees:
    place_c(k, px, py, flip=f)

# Inner scatter: lone trees, bushes, rocks, flowers, mushrooms.
square = (28 * T, 15 * T, 52 * T, 32 * T)


def scatter(keys, weights, count, layer="objects", tries=4000, need_grass=True, pad=10):
    n = 0
    for _ in range(tries):
        if n >= count:
            break
        k = random.choices(keys, weights)[0]
        w, h = CATALOG[k]["frames"][0].size
        x, y = random.randint(60, PX_W - 60 - w), random.randint(80, PX_H - 40)
        if square[0] - 40 < x + w and x < square[2] + 40 and square[1] - 40 < y and y - h < square[3] + 40:
            continue
        if not all(cell_ok(x + dx, y - dy, not need_grass) and not forest[int((y - dy) // T)][int((x + dx) // T)]
                   for dx in (0, w // 2, w - 1) for dy in (2, min(h, 30))):
            continue
        foot = CATALOG[k]["foot"] or (0, h - 12, w, 12)
        if not free(x + foot[0], y - h + foot[1], foot[2], foot[3], pad):
            continue
        place(k, x, y, flip=random.random() < .5, layer=layer)
        if CATALOG[k]["foot"] is None:
            occupied.append((x + foot[0], y - h + foot[1], foot[2], foot[3]))
        n += 1


scatter(["tree", "tree_tall", "tree_small", "pine", "tree_amber", "tree_small_crimson", "tree_tall_amber"],
        [3, 2, 3, 2, 1, 1, 1], 26, pad=30)
scatter(["bush1", "bush3", "bush2", "bush4", "rock", "rock_wide", "rock_tall", "stump"], [4, 4, 2, 2, 1, 1, 1, 1], 40)
scatter(FLOWERS + ["mushrooms", "mushroom", "mushroom_purple", "bush5", "bush6", "bush7", "pebble", "pebble_small", "plant"],
        [3] * len(FLOWERS) + [2, 2, 2, 3, 3, 3, 2, 2, 2], 170, layer="decor", need_grass=False, pad=2)

# Soft shadows beneath every tree and big rock.
SHADOW_FOR = {"pine": "shadow_48x24", "tree": "shadow_48x24", "tree_tall": "shadow_48x24", "tree_small": "shadow_32x16",
              "apple_tree": "shadow_32x16", "rock": "shadow_24x24", "bush1": "shadow_32x16", "bush3": "shadow_24x24"}
for o in list(objects):
    base = o["key"].replace("_amber", "").replace("_crimson", "")
    if base in SHADOW_FOR:
        sk = SHADOW_FOR[base]
        foot = CATALOG[o["key"]]["foot"]
        fx = o["x"] + (o["w"] - foot[0] - foot[2] if o["flip"] else foot[0]) + foot[2] // 2
        sw, shh = CATALOG[sk]["frames"][0].size
        decor.insert(0, dict(key=sk, x=fx - sw // 2, y=o["y"] - o["h"] + foot[1] + foot[3] + shh // 3, w=sw, h=shh, flip=False))

# ================================================================ collision
for o in objects:
    foot = CATALOG[o["key"]]["foot"]
    if foot is None:
        continue
    fx, fy, fw, fh = foot
    if o["flip"]:
        fx = o["w"] - fx - fw
    x0, y0 = o["x"] + fx, o["y"] - o["h"] + fy
    for ty in range(max(0, int(y0 // T)), min(H, int((y0 + fh) // T) + 1)):
        for tx in range(max(0, int(x0 // T)), min(W, int((x0 + fw) // T) + 1)):
            ox = min(x0 + fw, (tx + 1) * T) - max(x0, tx * T)
            oy = min(y0 + fh, (ty + 1) * T) - max(y0, ty * T)
            if ox > 0 and oy > 0 and ox * oy >= 0.3 * T * T:
                blocked[ty][tx] = True
# The manor's front wall is exactly MANOR_FRONT, whatever the snapping above decided.
mx0, mx1 = manor["x"] // T, (manor["x"] + manor["w"] - 1) // T
for tx in range(mx0, mx1 + 1):
    blocked[MANOR_FRONT // T - 1][tx] = True
    blocked[MANOR_FRONT // T][tx] = False

# Every walkable tile must be reachable from the button; seal any pocket.
bx, by = BUTTON[0] // T, BUTTON[1] // T
seen = {(bx, by)}
queue = deque([(bx, by)])
while queue:
    x, y = queue.popleft()
    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if inside(nx, ny) and not blocked[ny][nx] and (nx, ny) not in seen:
            seen.add((nx, ny))
            queue.append((nx, ny))
sealed = 0
for y in range(H):
    for x in range(W):
        if not blocked[y][x] and (x, y) not in seen:
            blocked[y][x] = True
            sealed += 1


def rectangles(g):
    """Merges blocked tiles into rectangles: runs along each row, stacked while they line up."""
    runs, rects = {}, []
    for y in range(H + 1):
        row = []
        if y < H:
            x = 0
            while x < W:
                if g[y][x]:
                    x0 = x
                    while x < W and g[y][x]:
                        x += 1
                    row.append((x0, x - x0))
                else:
                    x += 1
        nxt = {}
        for key, y0 in runs.items():
            if key in row:
                nxt[key] = y0
            else:
                rects.append((key[0] * T, y0 * T, key[1] * T, (y - y0) * T))
        for key in row:
            if key not in nxt:
                nxt[key] = y
        runs = nxt
    rects.sort(key=lambda r: (r[1], r[0]))
    return [dict(x=x, y=y, width=w, height=h) for x, y, w, h in rects]


obstacles = rectangles(blocked)


def walkable(px, py, r=14):
    if px < r or py < r or px > PX_W - r or py > PX_H - r:
        return False
    return not any(px > o["x"] - r and px < o["x"] + o["width"] + r and py > o["y"] - r and py < o["y"] + o["height"] + r
                   for o in obstacles)


seats = [(BUTTON[0] + round(330 * math.sin(s * 2 * math.pi / 10)), BUTTON[1] + round(-205 * math.cos(s * 2 * math.pi / 10)))
         for s in range(10)]
problems = [f"seat {i} at {p}" for i, p in enumerate(seats) if not walkable(*p)]
for (sx, sy) in seats:   # every Seat must see a clear straight walk to the button
    for t in range(0, 101, 2):
        px, py = sx + (BUTTON[0] - sx) * t / 100, sy + (BUTTON[1] - sy) * t / 100
        if not walkable(px, py):
            problems.append(f"seat {(sx, sy)} blocked toward the button at {(round(px), round(py))}")
            break
for y in range(530, 1001, 5):
    if not walkable(1280, y):
        problems.append(f"the square's north-south line is blocked at y {y}")
if walkable(1280, 505) or walkable(1280, 500):
    problems.append("the manor's front wall does not stop a Player at y 505")
if not walkable(1300, 530):
    problems.append("a Player cannot slide along the manor's front wall")
if problems:
    raise SystemExit("map rules broken:\n  " + "\n  ".join(problems))

# ================================================================ write tilesets and the map
terrain_specs = [
    ("ground", os.path.join(FA, "Ground Tileset", "Tileset_Ground.png"), ground_cols, ground_count, {}),
    ("water", os.path.join(FA, "Water and Sand", "Tileset_Water.png"), water_cols, water_count, water_anim),
    ("road", os.path.join(FA, "Ground Tileset", "Tileset_Road.png"), road_cols, road_count, {}),
    ("fences", os.path.join(SP, "Tilesets", "Fences.png"), 4, 16, {}),
]
tilesets, firstgid = [], 1
gid_of = {}
for name, src, cols, count, anim in terrain_specs:
    im = up(load(src))
    im.save(os.path.join(ART, "terrain", f"{name}.png"))
    ts = dict(firstgid=firstgid, name=name, image=f"tilesets/terrain/{name}.png", imagewidth=im.width,
              imageheight=im.height, tilewidth=T, tileheight=T, columns=cols, tilecount=count, margin=0, spacing=0)
    if anim:
        ts["tiles"] = [dict(id=tid, animation=[dict(tileid=f, duration=d) for f, d in frames])
                       for tid, frames in sorted(anim.items())]
    tilesets.append(ts)
    gid_of[name] = firstgid
    firstgid += count

used = sorted({o["key"] for o in objects + decor})
for key in used:
    info = CATALOG[key]
    frames = info["frames"]
    fw, fh = frames[0].size
    sheet = Image.new("RGBA", (fw * len(frames), fh))
    for i, f in enumerate(frames):
        sheet.alpha_composite(f, (i * fw, 0))
    sheet.save(os.path.join(ART, "objects", f"{key}.png"))
    ts = dict(firstgid=firstgid, name=key, image=f"tilesets/objects/{key}.png", imagewidth=sheet.width,
              imageheight=fh, tilewidth=fw, tileheight=fh, columns=len(frames), tilecount=len(frames),
              margin=0, spacing=0, objectalignment="bottomleft")
    if len(frames) > 1:
        ts["tiles"] = [dict(id=0, animation=[dict(tileid=i, duration=info["dur"]) for i in range(len(frames))])]
    tilesets.append(ts)
    gid_of[key] = firstgid
    firstgid += len(frames)

# Bridges are generated art; each spans its river crossing.
bridge_objects = []
for r0, r1 in BRIDGES:
    xs = [x for y in range(r0, r1 + 1) for x in range(W) if bridge[y][x]]
    x0, x1 = (min(xs) - 1) * T, (max(xs) + 2) * T
    key = f"bridge_{r0}"
    im = up(make_bridge((x1 - x0) // S, ((r1 - r0 + 1) * T + 12) // S))
    im.save(os.path.join(ART, "objects", f"{key}.png"))
    tilesets.append(dict(firstgid=firstgid, name=key, image=f"tilesets/objects/{key}.png", imagewidth=im.width,
                         imageheight=im.height, tilewidth=im.width, tileheight=im.height, columns=1, tilecount=1,
                         margin=0, spacing=0, objectalignment="bottomleft"))
    gid_of[key] = firstgid
    firstgid += 1
    CATALOG[key] = dict(frames=[im], dur=0, foot=None, lights=[])
    bridge_objects.append(dict(key=key, x=x0, y=(r1 + 1) * T + 6, w=im.width, h=im.height, flip=False))
decor = bridge_objects + decor

next_id = [1]


def obj(o):
    gid = gid_of[o["key"]] | (0x80000000 if o["flip"] else 0)
    out = dict(id=next_id[0], name="", type=o["key"], gid=gid, x=o["x"], y=o["y"], width=o["w"], height=o["h"],
               rotation=0, visible=True)
    next_id[0] += 1
    return out


def point(name, kind, x, y, props=None):
    out = dict(id=next_id[0], name=name, type=kind, x=x, y=y, width=0, height=0, rotation=0, visible=True, point=True)
    if props:
        out["properties"] = [dict(name=k, type="int" if isinstance(v, int) else "string", value=v) for k, v in props.items()]
    next_id[0] += 1
    return out


def layer_data(tiles, gid0):
    return [0 if tiles[y][x] is None else gid0 + tiles[y][x] for y in range(H) for x in range(W)]


fence_tiles = [[None] * W for _ in range(H)]
for y in range(H):
    for x in range(W):
        if fence[y][x]:
            f = lambda a, b: int(inside(a, b) and fence[b][a])
            col, row = FENCE_PIECES[(f(x, y - 1), f(x + 1, y), f(x, y + 1), f(x - 1, y))]
            fence_tiles[y][x] = row * 4 + col

lights = []
for o in objects:
    for lx, ly, radius, colour in CATALOG[o["key"]]["lights"]:
        x = o["x"] + (o["w"] - lx if o["flip"] else lx)
        lights.append(point(o["key"], "light", int(x), int(o["y"] - o["h"] + ly),
                            dict(radius=int(radius), color=colour, flicker=int(colour in (FIRE,)))))

# The square's own lantern-light, so the Meetings are never held in the dark.
lights.append(point("Town Square", "light", BUTTON[0], BUTTON[1] - 20, dict(radius=250, color=WARM, flicker=0)))

ZONES = [
    ("Town Square", 29, 16, 22, 15), ("Manor", 34, 7, 12, 9), ("Moon Pond", 23, 3, 11, 9),
    ("Shrine", 54, 3, 23, 12), ("Orchard", 3, 3, 14, 6), ("Farm", 3, 11, 15, 10), ("Fields", 3, 25, 14, 8),
    ("Pasture", 3, 34, 13, 8), ("Fishing Camp", 18, 37, 9, 6), ("Market", 23, 33, 35, 9),
    ("East Homes", 52, 15, 25, 7), ("Smithy", 52, 25, 25, 12), ("River", 16, 0, 7, 45),
]
TASKS = [("Light the shrine", 2112, 420), ("Feed the chickens", 300, 1300), ("Milk the cows", 330, 1240),
         ("Harvest the wheat", 330, 930), ("Fish from the bridge", 610, 760), ("Stoke the forge", 1990, 1150),
         ("Draw water", 1280, 1340), ("Pick apples", 330, 300), ("Read the notice board", 1180, 1110),
         ("Sweep the manor steps", 1280, 545), ("Mend the paddock fence", 300, 1110), ("Count the market crates", 1500, 1160)]
def nearest_walkable(x, y):
    for r in range(0, 160, 4):
        for a in range(0, 360, 15):
            px, py = round(x + r * math.cos(math.radians(a))), round(y + r * math.sin(math.radians(a)))
            if walkable(px, py) and (int(px // T), int(py // T)) in seen:
                return px, py
    raise SystemExit(f"no open ground near {(x, y)}")


TASKS = [(name, *nearest_walkable(x, y)) for name, x, y in TASKS]

layers = [
    dict(id=1, name="ground", type="tilelayer", width=W, height=H, x=0, y=0, opacity=1, visible=True,
         data=layer_data(ground_tiles, gid_of["ground"])),
    dict(id=2, name="water", type="tilelayer", width=W, height=H, x=0, y=0, opacity=1, visible=True,
         data=layer_data(water_tiles, gid_of["water"])),
    dict(id=3, name="road", type="tilelayer", width=W, height=H, x=0, y=0, opacity=1, visible=True,
         data=layer_data(road_tiles, gid_of["road"])),
    dict(id=4, name="fences", type="tilelayer", width=W, height=H, x=0, y=0, opacity=1, visible=True,
         data=layer_data(fence_tiles, gid_of["fences"])),
    dict(id=5, name="floor_decor", type="objectgroup", draworder="topdown", x=0, y=0, opacity=1, visible=True,
         objects=[obj(o) for o in decor]),
    dict(id=6, name="objects", type="objectgroup", draworder="topdown", x=0, y=0, opacity=1, visible=True,
         properties=[dict(name="ysort", type="bool", value=True)], objects=[obj(o) for o in sorted(objects, key=lambda o: o["y"])]),
    dict(id=7, name="lights", type="objectgroup", draworder="topdown", x=0, y=0, opacity=1, visible=False, objects=lights),
    dict(id=8, name="collision", type="objectgroup", draworder="topdown", x=0, y=0, opacity=1, visible=False,
         objects=[dict(id=0, name="", type="obstacle", x=o["x"], y=o["y"], width=o["width"], height=o["height"],
                       rotation=0, visible=True) for o in obstacles]),
    dict(id=9, name="spawns", type="objectgroup", draworder="topdown", x=0, y=0, opacity=1, visible=True,
         objects=[point(f"spawn_{i}", "spawn", x, y) for i, (x, y) in enumerate(seats)]),
    dict(id=10, name="zones", type="objectgroup", draworder="topdown", x=0, y=0, opacity=1, visible=True,
         objects=[dict(id=0, name=n, type="zone", x=x * T, y=y * T, width=w * T, height=h * T, rotation=0, visible=True)
                  for n, x, y, w, h in ZONES]),
    dict(id=11, name="points", type="objectgroup", draworder="topdown", x=0, y=0, opacity=1, visible=True,
         objects=[point("emergency_button", "emergency_button", *BUTTON)] + [point(n, "task", x, y) for n, x, y in TASKS]),
]
for layer in layers[7:]:
    for o in layer["objects"]:
        if o["id"] == 0:
            o["id"] = next_id[0]
            next_id[0] += 1

tmj = dict(compressionlevel=-1, type="map", version="1.10", tiledversion="1.11.0", orientation="orthogonal",
           renderorder="right-down", infinite=False, width=W, height=H, tilewidth=T, tileheight=T,
           backgroundcolor="#2f5a3a", nextlayerid=len(layers) + 1, nextobjectid=next_id[0],
           properties=[dict(name="emergencyButtonX", type="int", value=BUTTON[0]),
                       dict(name="emergencyButtonY", type="int", value=BUTTON[1])],
           layers=layers, tilesets=tilesets)
collision = dict(
    world=dict(width=PX_W, height=PX_H), tileSize=T, emergencyButton=dict(x=BUTTON[0], y=BUTTON[1]),
    obstacles=obstacles, spawns=[dict(x=x, y=y) for x, y in seats],
    zones=[dict(name=n, indoor=False, x=x * T, y=y * T, width=w * T, height=h * T) for n, x, y, w, h in ZONES],
    tasks=[dict(name=n, x=x, y=y) for n, x, y in TASKS],
    walkable=["".join("#" if blocked[y][x] else "." for x in range(W)) for y in range(H)],
)

OUT = HERE
with open(os.path.join(OUT, "pu-town.json"), "w") as f:
    json.dump(tmj, f, separators=(",", ":"))
with open(os.path.join(OUT, "pu-town.collision.json"), "w") as f:
    json.dump(collision, f, indent=1)


# ================================================================ previews (day and night)
def render():
    canvas = Image.new("RGBA", (PX_W, PX_H), (47, 90, 58, 255))
    sheets = {}
    for ts in tilesets[:4]:
        sheets[ts["name"]] = Image.open(os.path.join(ART, "terrain", ts["name"] + ".png"))
    for layer, ts in zip(layers[:4], tilesets[:4]):
        im = sheets[ts["name"]]
        for i, gid in enumerate(layer["data"]):
            if gid:
                tid = gid - ts["firstgid"]
                tile = im.crop(((tid % ts["columns"]) * T, (tid // ts["columns"]) * T,
                                (tid % ts["columns"]) * T + T, (tid // ts["columns"]) * T + T))
                canvas.alpha_composite(tile, ((i % W) * T, (i // W) * T))
    for o in decor + sorted(objects, key=lambda o: o["y"]):
        f = CATALOG[o["key"]]["frames"][0]
        if o["flip"]:
            f = f.transpose(Image.FLIP_LEFT_RIGHT)
        x, y = o["x"], o["y"] - o["h"]
        if x >= PX_W or y >= PX_H or x + o["w"] <= 0 or y + o["h"] <= 0:
            continue
        canvas.alpha_composite(f.crop((max(0, -x), max(0, -y), o["w"], o["h"])), (max(0, x), max(0, y)))
    return canvas


def night(day):
    """Mirrors the client's night: a blue multiply over everything, lifted where lamps shine."""
    base = np.array(day.convert("RGB")).astype(np.float32) / 255
    shade = np.ones_like(base) * np.array([0.26, 0.31, 0.52])
    glow = np.zeros_like(base)
    yy, xx = np.mgrid[0:PX_H, 0:PX_W]
    for l in lights:
        props = {p["name"]: p["value"] for p in l["properties"]}
        r, col = props["radius"], props["color"]
        rgb = np.array([int(col[i:i + 2], 16) for i in (1, 3, 5)]) / 255
        x0, x1, y0, y1 = max(0, l["x"] - r), min(PX_W, l["x"] + r), max(0, l["y"] - r), min(PX_H, l["y"] + r)
        d = np.sqrt((xx[y0:y1, x0:x1] - l["x"]) ** 2 + (yy[y0:y1, x0:x1] - l["y"]) ** 2) / r
        k = np.clip(1 - d, 0, 1) ** 1.6
        shade[y0:y1, x0:x1] = np.maximum(shade[y0:y1, x0:x1], (0.25 + 0.75 * k)[..., None] * (0.55 + 0.45 * rgb))
        glow[y0:y1, x0:x1] += (k ** 2 * 0.22)[..., None] * rgb
    out = np.clip(base * shade + glow, 0, 1)
    return Image.fromarray((out * 255).astype(np.uint8))


day = render()
day.convert("RGB").save(os.path.join(OUT, "preview-day.png"))
night(day).save(os.path.join(OUT, "preview-night.png"))
dbg = day.copy()
d = ImageDraw.Draw(dbg, "RGBA")
for o in obstacles:
    d.rectangle((o["x"], o["y"], o["x"] + o["width"] - 1, o["y"] + o["height"] - 1), fill=(255, 0, 0, 70), outline=(255, 0, 0, 160))
for x, y in seats:
    d.ellipse((x - 14, y - 14, x + 14, y + 14), outline=(255, 255, 0, 255), width=3)
dbg.convert("RGB").save(os.path.join(OUT, "preview-collision.png"))

# ================================================================ serve
if not args.no_serve:
    dest = args.serve
    for sub in ("tilesets",):
        if os.path.isdir(os.path.join(dest, sub)):
            shutil.rmtree(os.path.join(dest, sub))
    shutil.copytree(ART, os.path.join(dest, "tilesets"))
    for f in ("pu-town.json", "pu-town.collision.json"):
        shutil.copy(os.path.join(OUT, f), os.path.join(dest, f))

    # The server and the client keep their own copies of the obstacles; rewrite both.
    import re

    def rewrite(path, pattern, body):
        with open(path, encoding="utf-8", newline="") as fh:
            text = fh.read()
        eol = "\r\n" if "\r\n" in text else "\n"      # keep the file's own line endings
        text = text.replace("\r\n", "\n")
        text, n = re.subn(pattern, lambda m: m.group(1) + body + m.group(2), text, flags=re.S)
        if n != 1:
            raise SystemExit(f"could not find the obstacle list in {path}")
        with open(path, "w", encoding="utf-8", newline="") as fh:
            fh.write(text.replace("\n", eol))

    def rows(items, per, indent, sep):
        return f"{sep.rstrip()}\n{indent}".join(sep.join(items[i:i + per]) for i in range(0, len(items), per))

    java = [f"new Obstacle({o['x']}, {o['y']}, {o['width']}, {o['height']})" for o in obstacles]
    ts = [f"{{ x: {o['x']}, y: {o['y']}, width: {o['width']}, height: {o['height']} }}" for o in obstacles]
    rewrite(os.path.join(REPO, "backend", "src", "main", "java", "dev", "lpa", "pu_go", "room", "RoomRules.java"),
            r"(OBSTACLES = List\.of\(\n            ).*?(\);\n)", rows(java, 4, " " * 12, ", "))
    rewrite(os.path.join(REPO, "frontend", "src", "room-rules.ts"),
            r"(OBSTACLES: readonly Obstacle\[\] = \[\n  ).*?(\n\];)", rows(ts, 4, "  ", ", "))

print(f"{len(objects)} objects, {len(decor)} decor, {len(lights)} lights, {len(obstacles)} obstacles, "
      f"{sealed} sealed pocket tiles, {len(tilesets)} tilesets")
