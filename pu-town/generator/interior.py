"""Cuts SuperRetroWorld interior furniture out of atlas_32x.png by pixel outline.

Each entry is an exact rectangle in atlas cells (col, row, w, h; fractions allowed because many pieces are
not cell aligned). The rectangle is cropped and trimmed to its opaque pixels.
"""
import numpy as np
from PIL import Image

ATLAS = r"D:/pu-town map/SuperRetroWorld_InteriorPack_Full/SuperRetroWorld_InteriorPack_Full/atlas_32x.png"

def load_atlas():
    a = np.array(Image.open(ATLAS).convert("RGBA"))
    # fully white 32 px cells are empty placeholders in this atlas
    for r in range(a.shape[0] // 32):
        for c in range(a.shape[1] // 32):
            cell = a[r * 32:(r + 1) * 32, c * 32:(c + 1) * 32]
            if (cell == 255).all(): cell[...] = 0
    return a

# name: (col, row, w, h, kind) ; kind: "floor" (flat, under players), "wall" (hangs on a wall face), "solid"
FURNITURE = {
    "rug_red": (16, 0, 3, 3, "floor"), "rug_blue": (16, 3, 3, 3, "floor"), "rug_green": (16, 6, 3, 3, "floor"),
    "mat_brown": (4, 2, 2, 1, "floor"), "mat_grey": (6, 2, 2, 1, "floor"), "mat_blue": (4, 3, 2, 1, "floor"),
    "mat_red": (6, 3, 2, 1, "floor"),
    "win_round": (8, 0, 1, 2, "wall"), "win_round2": (9, 0, 1, 2, "wall"), "win_square": (10, 0, 1, 2, "wall"),
    "win_wide": (11, 0, 2, 2, "wall"), "win_glass": (14, 0, 2, 2, "wall"),
    "curtain_blue": (8, 2, 1, 2, "wall"), "curtain_green": (10, 2, 1, 2, "wall"), "curtain_orange": (12, 2, 1, 2, "wall"),
    "table_red": (10, 4, 2, 2, "solid"), "table_long": (12, 4.6875, 3, 1.875, "solid"), "table_glass": (10, 6, 2, 2, "solid"),
    "table_cloth": (12, 7.6875, 3, 1.875, "solid"), "bench": (8, 5, 1, 2, "solid"),
    "stool": (8, 7, 1, 1, "solid"), "stool2": (9, 7, 1, 1, "solid"),
    "counter": (8, 8, 2, 2, "solid"), "counter_goods": (8, 10, 2, 2, "solid"), "map": (10, 8, 2, 2, "solid"),
    "boards": (10, 10.375, 2, 1.125, "wall"), "painting": (10, 12.375, 2, 1.125, "wall"),
    "shelf_pots": (12, 10.3125, 1, 0.8125, "wall"), "shelf_potions": (13, 10.3125, 1, 0.8125, "wall"), "shelf_jars": (15, 10.3125, 1, 0.8125, "wall"),
    "stove_black": (8, 12, 1, 2, "solid"), "stove_grey": (9, 12, 1, 2, "solid"), "armchairs": (12, 12, 2, 2, "solid"),
    "sofa": (14, 12, 2, 1, "solid"), "sofa2": (14, 13, 2, 1, "solid"),
    "bed_red": (8, 14.4375, 1, 1.5625, "solid"), "bed_green": (9, 14.4375, 1, 1.5625, "solid"), "bed_blue": (10, 14.4375, 1, 1.5625, "solid"),
    "bed_grey": (11, 14.4375, 1, 1.5625, "solid"), "bed_pink": (12, 14.4375, 1, 1.5625, "solid"),
    "nightstand": (13, 15, 1, 1, "solid"), "nightstand_flower": (14, 14, 1, 2, "solid"), "nightstand_candle": (15, 14, 1, 2, "solid"),
    "chair_l": (15, 6, 1, 1, "solid"), "chair_f": (15, 7, 1, 1, "solid"), "chair_r": (15, 8, 1, 1, "solid"), "chair_b": (15, 9, 1, 1, "solid"),
    "cushion_red": (15, 3, 1, 1, "floor"), "cushion_blue": (15, 4, 1, 1, "floor"), "cushion_green": (15, 5, 1, 1, "floor"),
    "candle": (4, 11, 1, 1, "solid"), "cauldron": (5, 12.75, 1, 1.25, "solid"), "cauldron_hot": (6, 12.75, 1, 1.25, "solid"),
    "crate": (19, 0, 1, 1, "solid"), "crates": (21, 0, 2, 2, "solid"), "drawer": (20, 0, 1, 1.75, "solid"),
    "chest": (23, 0, 1, 1, "solid"), "chest_iron": (23, 1, 1, 1, "solid"), "apples": (19, 3, 1, 0.9375, "solid"),
    "bottle": (20, 3, 1, 1, "solid"), "books": (21, 2, 2, 2, "solid"),
    "desk": (19, 4.75, 2, 1.1875, "solid"), "desk_books": (19, 5.9375, 2, 1.125, "solid"),
    "shelf": (19, 7, 2, 2, "solid"), "shelf_dishes": (21, 7, 2, 2, "solid"),
    "cabinet": (19, 9, 2, 2, "solid"), "cabinet_dishes": (21, 9, 2, 2, "solid"), "dresser": (19, 11.0625, 2, 1.9375, "solid"),
    "dresser2": (21, 11.0625, 2, 1.9375, "solid"), "dresser_tall": (23, 11, 1, 2, "solid"), "wardrobe": (22, 13.0625, 2, 1.9375, "solid"),
    "low_table": (20, 13, 2, 1, "solid"), "vase": (19, 13, 1, 1, "solid"), "potion_blue": (23, 6, 1, 1, "solid"),
    "potion_red": (23, 7, 1, 1, "solid"), "potion_green": (23, 8, 1, 1, "solid"),
    "sink": (18, 15, 2, 1, "solid"), "cupboard": (20, 14.25, 1, 1.75, "solid"), "oven": (21, 14.25, 1, 1.75, "solid"),
    "tree_pot": (16, 9.4375, 1, 1.5625, "solid"), "tree_pot2": (17, 11.4375, 1, 1.5625, "solid"), "palm_pot": (16, 13, 1, 2, "solid"),
    "flowers1": (18, 9, 1, 1, "solid"), "flowers2": (18, 10, 1, 1, "solid"), "flowers3": (18, 11, 1, 1, "solid"),
    "pot": (16, 15, 1, 1, "solid"), "barrel": (17, 15, 1, 1, "solid"),
    "fireplace": (27.5, 6, 2, 2.5625, "solid"),
    "logs": (30, 5, 1, 1, "solid"), "campfire": (30, 7, 1, 1, "solid"),
    "sidetable": (24, 9.375, 2, 1, "solid"), "altar": (24, 11, 2, 2, "solid"), "ledger_desk": (26, 11, 2, 2, "solid"),
    "bar_l": (24, 13, 2, 3, "solid"), "bar_r": (26, 13, 2, 3, "solid"),
    "clock": (28, 13.5, 1, 0.875, "wall"), "clock_tall": (29, 13, 1, 2, "solid"),
}

def cut_all():
    a = load_atlas()
    out = {}
    for name, (c, r, w, h, kind) in FURNITURE.items():
        x0, y0, x1, y1 = round(c * 32), round(r * 32), round((c + w) * 32), round((r + h) * 32)
        im = Image.fromarray(a[y0:y1, x0:x1].copy())
        out[name] = (im.crop(im.getbbox()), kind)
    return out

if __name__ == "__main__":
    from PIL import ImageDraw
    sprites = cut_all()
    sheet = Image.new("RGBA", (1500, 900), (90, 90, 90, 255)); d = ImageDraw.Draw(sheet)
    x = y = rowh = 0
    for n, (im, kind) in sprites.items():
        wdt = max(im.width, len(n) * 6) + 10
        if x + wdt > 1500: x = 0; y += rowh + 18; rowh = 0
        sheet.alpha_composite(im, (x, y + 12)); d.text((x, y), n, fill="white"); x += wdt; rowh = max(rowh, im.height)
    sheet.save("cut.png")
