"""Score the pine's review renders against the owner's tree sheets and tile them.

Usage: python3 tools/scenery/pine/compare.py REFERENCE_DIR BUILD_DIR

Side: silhouette IoU of each of four azimuths against side.png at the same framing
(the sheet's tree is 6.5 m from its trunk foot to its tip), the better of each view
and its mirror image, and crown width errors by height band. Top: the sheet's scale
and the tree's rotation are unknown, so the best IoU over scale, rotation and mirror
is reported. Snow: the share of the silhouette that is snow, beside the sheets' share.
Writes BUILD_DIR/review/sheet.png (reference | render | overlay; red is reference
only, blue is render only, grey is shared) and BUILD_DIR/review/scores.json.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

reference, build = Path(sys.argv[1]), Path(sys.argv[2]) / 'review'
PX_PER_M, BASE_ROW = 228.3, 1505
SIDE_BG = np.array([207, 209, 213])


def rgb(path):
    return np.asarray(Image.open(path).convert('RGB')).astype(int)


def alpha(path):
    return np.asarray(Image.open(path).convert('RGBA'))[..., 3] > 128


def iou(a, b):
    return float((a & b).sum() / max(1, (a | b).sum()))


def on(colour, path):
    image = Image.open(path).convert('RGBA')
    canvas = Image.new('RGBA', image.size, colour)
    canvas.alpha_composite(image)
    return canvas.convert('RGB')


def overlay(ref, ren):
    out = np.full(ref.shape + (3,), 255, np.uint8)
    out[ref & ~ren] = (220, 40, 40)
    out[ren & ~ref] = (40, 90, 230)
    out[ref & ren] = (90, 90, 90)
    return Image.fromarray(out)


def close(mask, radius=12):
    image = Image.fromarray((mask * 255).astype(np.uint8))
    image = image.filter(ImageFilter.MaxFilter(2 * radius + 1)).filter(ImageFilter.MinFilter(2 * radius + 1))
    return np.asarray(image) > 128


scores = {}
side_ref_rgb = rgb(reference / 'side.png')
side_ref = np.abs(side_ref_rgb - SIDE_BG).sum(axis=2) > 30
ref_snow = (side_ref_rgb.mean(axis=2) > 150) & side_ref
scores['side_reference_snow_share'] = round(float(ref_snow.sum() / side_ref.sum()), 3)
side_scores, best_view = {}, None
for azimuth in (0, 90, 180, 270):
    mask = alpha(build / f'side-{azimuth}.png')
    straight, mirrored = iou(side_ref, mask), iou(side_ref, mask[:, ::-1])
    snow = np.asarray(Image.open(build / f'side-{azimuth}-snow.png').convert('L')) > 128
    # Envelope: both silhouettes with gaps under 10 cm closed, so the crown's outline is
    # scored rather than where each needle tooth falls.
    envelope = max(iou(close(side_ref), close(mask)), iou(close(side_ref), close(mask[:, ::-1])))
    side_scores[azimuth] = {'iou': round(max(straight, mirrored), 4), 'envelope_iou': round(envelope, 4),
                            'mirrored': mirrored > straight,
                            'snow_share': round(float((snow & mask).sum() / mask.sum()), 3)}
    if best_view is None or max(straight, mirrored) > side_scores[best_view]['iou']:
        best_view = azimuth
scores['side'] = side_scores


def hex_of(pixels):
    return '#' + ''.join(f'{int(c):02X}' for c in np.median(pixels, axis=0))


# Rendered colour: medians of the snow and the rest, render (on the sheet's grey) against sheet.
view = np.asarray(on((207, 209, 213, 255), build / 'side-0.png')).astype(int)
view_mask = alpha(build / 'side-0.png')
view_snow = (np.asarray(Image.open(build / 'side-0-snow.png').convert('L')) > 128) & view_mask
ref_dark = side_ref & ~ref_snow & (side_ref_rgb.mean(axis=2) > 40)
scores['rendered_colour'] = {
    'snow': hex_of(view[view_snow]), 'reference_snow': hex_of(side_ref_rgb[ref_snow]),
    'needles': hex_of(view[view_mask & ~view_snow]), 'reference_needles': hex_of(side_ref_rgb[ref_dark]),
}
scores['side_mean_iou'] = round(float(np.mean([s['iou'] for s in side_scores.values()])), 4)
scores['side_mean_envelope_iou'] = round(float(np.mean([s['envelope_iou'] for s in side_scores.values()])), 4)

# Crown half-width by 0.5 m band: the mean over the four views against the sheet.
bands = []
masks = [alpha(build / f'side-{a}.png') for a in (0, 90, 180, 270)]
for low in np.arange(0.0, 6.5, 0.5):
    rows = slice(int(BASE_ROW - (low + 0.5) * PX_PER_M), int(BASE_ROW - low * PX_PER_M))
    ref_w = side_ref[rows].sum(axis=1).mean() / PX_PER_M
    ren_w = np.mean([m[rows].sum(axis=1).mean() for m in masks]) / PX_PER_M
    bands.append({'from_m': float(low), 'reference_m': round(float(ref_w), 2), 'render_m': round(float(ren_w), 2)})
scores['width_by_height'] = bands

# Top: search scale, rotation and mirror on 256 px masks centred on their centroids.
N = 256


def centred(mask, scale=1.0, angle=0.0, mirror=False):
    image = Image.fromarray((mask * 255).astype(np.uint8))
    ys, xs = np.nonzero(mask)
    cx, cy = xs.mean(), ys.mean()
    size = mask.shape[0]
    image = image.transform(image.size, Image.AFFINE, (1, 0, cx - size / 2, 0, 1, cy - size / 2))
    if mirror:
        image = image.transpose(Image.FLIP_LEFT_RIGHT)
    image = image.rotate(angle, Image.BILINEAR)
    image = image.resize((N, N), Image.BILINEAR)
    if scale != 1.0:
        scaled = image.resize((round(N * scale), round(N * scale)), Image.BILINEAR)
        canvas = Image.new('L', (N, N))
        canvas.paste(scaled, ((N - scaled.width) // 2, (N - scaled.height) // 2))
        image = canvas
    return np.asarray(image) > 128


top_ref_rgb = rgb(reference / 'top.png')
top_ref_full = top_ref_rgb.sum(axis=2) > 60
top_ref = centred(top_ref_full)
top_mask = alpha(build / 'top.png')
best = (0.0, 1.0, 0, False)
for mirror in (False, True):
    for scale in np.arange(0.8, 1.6, 0.02):
        for angle in range(0, 360, 5):
            score = iou(top_ref, centred(top_mask, scale, angle, mirror))
            if score > best[0]:
                best = (score, float(scale), angle, mirror)
top_snow = np.asarray(Image.open(build / 'top-snow.png').convert('L')) > 128
scores['top'] = {
    'iou': round(best[0], 4), 'scale': round(best[1], 2), 'rotation_deg': best[2], 'mirrored': best[3],
    'snow_share': round(float((top_snow & top_mask).sum() / top_mask.sum()), 3),
    'reference_snow_share': round(float(((top_ref_rgb.mean(axis=2) > 150) & top_ref_full).sum() / top_ref_full.sum()), 3),
}
(build / 'scores.json').write_text(json.dumps(scores, indent=2) + '\n')

# Contact sheet: side row and top row at 512 px tall, then beauty and game.
H = 768
row1 = [Image.fromarray(side_ref_rgb.astype(np.uint8)), on((207, 209, 213, 255), build / f'side-{best_view}.png'),
        overlay(side_ref, masks[(0, 90, 180, 270).index(best_view)])]
row1 = [t.resize((512, H), Image.LANCZOS) for t in row1]
top_ren = Image.fromarray((centred(top_mask, best[1], best[2], best[3]) * 255).astype(np.uint8))
row2 = [Image.fromarray(top_ref_rgb.astype(np.uint8)).resize((512, 512), Image.LANCZOS),
        on((0, 0, 0, 255), build / 'top.png').resize((512, 512), Image.LANCZOS),
        overlay(top_ref, np.asarray(top_ren) > 128).resize((512, 512), Image.NEAREST)]
beauty = on((10, 10, 12, 255), build / 'beauty.png').resize((512, H), Image.LANCZOS)
game = Image.open(build / 'game.png').convert('RGB')
cx, cy = game.width // 2, game.height // 2
game_crop = game.crop((cx - 200, cy - 300, cx + 200, cy + 300)).resize((512, H), Image.LANCZOS)
sheet = Image.new('RGB', (512 * 5, H + 512), 'white')
for i, tile in enumerate(row1 + [beauty, game_crop]):
    sheet.paste(tile, (512 * i, 0))
for i, tile in enumerate(row2):
    sheet.paste(tile, (512 * i, H))
sheet.save(build / 'sheet.png')
print(json.dumps(scores, indent=2))
