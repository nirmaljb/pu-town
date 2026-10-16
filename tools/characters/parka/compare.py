"""Score review renders against the owner's sheets and tile them for inspection.

Usage: python3 tools/characters/parka/compare.py REFERENCE_DIR BUILD_DIR
REFERENCE_DIR holds front.png, side.png and back.png from the character sheets and
walk-left.png from the owner's walk recording (see walk_reference.py).
Prints silhouette IoU per view and per walk phase, and writes
BUILD_DIR/review/{turnaround,cycles,game,walk}.png.
In the overlays, red is reference only, blue is render only and dark grey is shared.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

reference, build = Path(sys.argv[1]), Path(sys.argv[2]) / 'review'
CROP = (300, 40, 1076, 768)


def masks(view):
    ref = np.asarray(Image.open(reference / f'{view}.png').convert('RGB')).astype(int)
    render = Image.open(build / f'{view}.png').convert('RGBA')
    alpha = np.asarray(render)[..., 3]
    return ref.mean(axis=2) < 200, alpha > 128, render


def on_white(render):
    canvas = Image.new('RGBA', render.size, (255, 255, 255, 255))
    canvas.alpha_composite(render)
    return canvas.convert('RGB')


scores, rows = {}, []
for view in ('front', 'side', 'back'):
    ref_mask, ren_mask, render = masks(view)
    union = (ref_mask | ren_mask).sum()
    scores[view] = round(float((ref_mask & ren_mask).sum() / union), 4)
    # Largest width differences by height band, in centimetres (2.5 mm per pixel).
    bands = []
    for top in range(64, 744, 34):
        ref_w = ref_mask[top:top + 34].sum(axis=1).mean()
        ren_w = ren_mask[top:top + 34].sum(axis=1).mean()
        bands.append((round(1.7 * (744 - top - 17) / 680, 2), round((ren_w - ref_w) * 0.25, 1)))
    scores[f'{view}_width_error_cm_by_height'] = [b for b in bands if abs(b[1]) >= 1.0]
    overlay = np.full(ref_mask.shape + (3,), 255, np.uint8)
    overlay[ref_mask & ~ren_mask] = (220, 40, 40)
    overlay[ren_mask & ~ref_mask] = (40, 90, 230)
    overlay[ref_mask & ren_mask] = (90, 90, 90)
    tiles = [Image.open(reference / f'{view}.png').convert('RGB'), on_white(render), Image.fromarray(overlay)]
    rows.append([t.crop(CROP) for t in tiles])

w, h = CROP[2] - CROP[0], CROP[3] - CROP[1]
sheet = Image.new('RGB', (3 * w, 3 * h), 'white')
for r, row in enumerate(rows):
    for c, tile in enumerate(row):
        sheet.paste(tile, (c * w, r * h))
sheet.resize((3 * w // 2, 3 * h // 2), Image.LANCZOS).save(build / 'turnaround.png')

frames = []
for prefix in ('walk', 'walk-quarter', 'run', 'run-quarter'):
    frames.append([on_white(Image.open(build / f'{prefix}-{i}.png').convert('RGBA')) for i in range(8)])
fw, fh = frames[0][0].size
cycles = Image.new('RGB', (8 * fw, 4 * fh), 'white')
for r, row in enumerate(frames):
    for c, tile in enumerate(row):
        cycles.paste(tile, (c * fw, r * fh))
cycles.resize((8 * fw // 2, 4 * fh // 2), Image.LANCZOS).save(build / 'cycles.png')

game = []
for name in ('game-stand', 'game-walk', 'game-run', 'game-away'):
    image = Image.open(build / f'{name}.png').convert('RGB')
    cx, cy = image.width // 2, image.height // 2
    crop = image.crop((cx - 60, cy - 70, cx + 60, cy + 50))
    game.append((crop, crop.resize((480, 480), Image.NEAREST)))
strip = Image.new('RGB', (4 * 480, 600), 'white')
for i, (actual, enlarged) in enumerate(game):
    strip.paste(enlarged, (i * 480, 0))
    strip.paste(actual, (i * 480 + 180, 480))
strip.save(build / 'game.png')
stand = [on_white(Image.open(build / f'{n}.png').convert('RGBA')).crop(CROP) for n in ('stand-front', 'stand-three-quarter')]
pair = Image.new('RGB', (2 * w, h), 'white')
for i, tile in enumerate(stand):
    pair.paste(tile, (i * w, 0))
pair.resize((w, h // 2), Image.LANCZOS).save(build / 'stand.png')
# Close-ups at the sheet scale: hood, hands and boots, reference above render.
details = Image.new('RGB', (6 * 260, 2 * 260), 'white')
for i, (view, box) in enumerate([('front', (557, 50, 817, 310)), ('side', (557, 50, 817, 310)),
                                 ('back', (557, 50, 817, 310)), ('front', (870, 170, 1040, 340)),
                                 ('side', (560, 560, 820, 760)), ('front', (560, 520, 820, 760))]):
    ref = Image.open(reference / f'{view}.png').convert('RGB').crop(box).resize((260, 260), Image.LANCZOS)
    ren = on_white(Image.open(build / f'{view}.png').convert('RGBA')).crop(box).resize((260, 260), Image.LANCZOS)
    details.paste(ref, (i * 260, 0))
    details.paste(ren, (i * 260, 260))
details.save(build / 'details.png')
# Walk against the recording, phase by phase. The recording's tiles follow the back
# of the hood, so the hips sit at one unknown offset along it: the best single
# shift for the whole cycle is used. Legs are everything below the coat's hem.
walk_ref = np.asarray(Image.open(reference / 'walk-left.png').convert('L')) < 128
TW, TH, PHASES, HEM_ROW = 180, 190, 16, 190 - 5 - 72
refs = [walk_ref[:, i * TW:(i + 1) * TW] for i in range(PHASES)]
rens = [np.asarray(Image.open(build / f'walk-left-{i}.png').convert('RGBA'))[..., 3] > 128 for i in range(PHASES)]


def iou(a, b):
    return float((a & b).sum() / max(1, (a | b).sum()))


def shifted(mask, dx):
    return np.roll(mask, dx, axis=1)


best = max(range(-30, 31), key=lambda dx: sum(iou(r, shifted(m, dx)) for r, m in zip(refs, rens)))
whole = [iou(r, shifted(m, best)) for r, m in zip(refs, rens)]
legs = [iou(r[HEM_ROW:], shifted(m, best)[HEM_ROW:]) for r, m in zip(refs, rens)]
scores['walk_left'] = {
    'mean_iou': round(float(np.mean(whole)), 4), 'mean_leg_iou': round(float(np.mean(legs)), 4),
    'hip_offset_m': best / 100, 'iou_by_phase': [round(v, 3) for v in whole],
    'leg_iou_by_phase': [round(v, 3) for v in legs],
}
walk = Image.new('RGB', (PHASES // 2 * TW, 2 * TH), 'white')
for i, (r, m) in enumerate(zip(refs, rens)):
    m = shifted(m, best)
    overlay = np.full(r.shape + (3,), 255, np.uint8)
    overlay[r & ~m] = (220, 40, 40)
    overlay[m & ~r] = (40, 90, 230)
    overlay[r & m] = (90, 90, 90)
    walk.paste(Image.fromarray(overlay), ((i % 8) * TW, (i // 8) * TH))
walk.resize((PHASES // 2 * TW * 2, 4 * TH), Image.NEAREST).save(build / 'walk.png')
(build / 'scores.json').write_text(json.dumps(scores, indent=2) + '\n')
print(json.dumps(scores, indent=1))
