"""Score the pine's review renders against the owner's tree sheets, check them and tile them.

Usage: python3 tools/scenery/pine/compare.py REFERENCE_DIR BUILD_DIR

Each version, near and far, is scored the same way. Side: silhouette IoU of each of
four azimuths against side.png at the same framing (the sheet's tree is 6.5 m from
its trunk foot to its tip), the better of each view and its mirror image, and crown
width errors by height band. Top: the sheet's scale and the tree's rotation are
unknown, so the best IoU over scale, rotation and mirror is reported. Snow: the share
of the silhouette that is snow, beside the sheets' share. The far version's outline
is also scored against the near tree's.
Writes BUILD_DIR/review/sheet.png (reference | near | overlay | far | overlay; red is
reference only, blue is render only, grey is shared) and BUILD_DIR/review/scores.json,
whose `checks` hold budget.py's verdicts. Exits 1 if any check fails.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
import budget  # noqa: E402

reference, build_dir = Path(sys.argv[1]), Path(sys.argv[2])
build = build_dir / 'review'
PX_PER_M, BASE_ROW = 228.3, 1505
SIDE_BG = np.array([207, 209, 213])
AZIMUTHS = (0, 90, 180, 270)
VERSIONS = {'near': '', 'far': 'far-'}  # version -> review file prefix


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


def hex_of(pixels):
    return '#' + ''.join(f'{int(c):02X}' for c in np.median(pixels, axis=0))


# Top: search scale, rotation and mirror on 256 px masks centred on their centroids.
N = 256


def turned(mask, angle=0.0, mirror=False):
    """A mask moved to its centroid, mirrored, turned and shrunk to N px."""
    image = Image.fromarray((mask * 255).astype(np.uint8))
    ys, xs = np.nonzero(mask)
    cx, cy = xs.mean(), ys.mean()
    size = mask.shape[0]
    image = image.transform(image.size, Image.AFFINE, (1, 0, cx - size / 2, 0, 1, cy - size / 2))
    if mirror:
        image = image.transpose(Image.FLIP_LEFT_RIGHT)
    image = image.rotate(angle, Image.BILINEAR)
    return image.resize((N, N), Image.BILINEAR)


def scaled(image, scale=1.0):
    if scale != 1.0:
        smaller = image.resize((round(N * scale), round(N * scale)), Image.BILINEAR)
        image = Image.new('L', (N, N))
        image.paste(smaller, ((N - smaller.width) // 2, (N - smaller.height) // 2))
    return np.asarray(image) > 128


def centred(mask, scale=1.0, angle=0.0, mirror=False):
    return scaled(turned(mask, angle, mirror), scale)


side_ref_rgb = rgb(reference / 'side.png')
side_ref = np.abs(side_ref_rgb - SIDE_BG).sum(axis=2) > 30
ref_snow = (side_ref_rgb.mean(axis=2) > 150) & side_ref
ref_dark = side_ref & ~ref_snow & (side_ref_rgb.mean(axis=2) > 40)
top_ref_rgb = rgb(reference / 'top.png')
top_ref_full = top_ref_rgb.sum(axis=2) > 60
top_ref = centred(top_ref_full)


def score(prefix):
    """One version's scores against the sheets, and its masks for the contact sheet."""
    side_scores, best_view, masks = {}, None, {}
    for azimuth in AZIMUTHS:
        mask = masks[azimuth] = alpha(build / f'{prefix}side-{azimuth}.png')
        straight, mirrored = iou(side_ref, mask), iou(side_ref, mask[:, ::-1])
        snow = np.asarray(Image.open(build / f'{prefix}side-{azimuth}-snow.png').convert('L')) > 128
        # Envelope: both silhouettes with gaps under 10 cm closed, so the crown's outline is
        # scored rather than where each needle tooth falls.
        envelope = max(iou(close(side_ref), close(mask)), iou(close(side_ref), close(mask[:, ::-1])))
        side_scores[azimuth] = {'iou': round(max(straight, mirrored), 4), 'envelope_iou': round(envelope, 4),
                                'mirrored': mirrored > straight,
                                'snow_share': round(float((snow & mask).sum() / mask.sum()), 3)}
        if best_view is None or max(straight, mirrored) > side_scores[best_view]['iou']:
            best_view = azimuth
    out = {'side': side_scores}

    # Rendered colour: medians of the snow and the rest, render on the sheet's grey.
    view = np.asarray(on((207, 209, 213, 255), build / f'{prefix}side-0.png')).astype(int)
    view_snow = (np.asarray(Image.open(build / f'{prefix}side-0-snow.png').convert('L')) > 128) & masks[0]
    out['rendered_colour'] = {'snow': hex_of(view[view_snow]), 'needles': hex_of(view[masks[0] & ~view_snow])}
    out['side_mean_iou'] = round(float(np.mean([s['iou'] for s in side_scores.values()])), 4)
    out['side_mean_envelope_iou'] = round(float(np.mean([s['envelope_iou'] for s in side_scores.values()])), 4)
    out['side_snow_share'] = round(float(np.mean([s['snow_share'] for s in side_scores.values()])), 3)

    # Crown half-width by 0.5 m band: the mean over the four views against the sheet.
    bands = []
    for low in np.arange(0.0, 6.5, 0.5):
        rows = slice(int(BASE_ROW - (low + 0.5) * PX_PER_M), int(BASE_ROW - low * PX_PER_M))
        ref_w = side_ref[rows].sum(axis=1).mean() / PX_PER_M
        ren_w = np.mean([m[rows].sum(axis=1).mean() for m in masks.values()]) / PX_PER_M
        bands.append({'from_m': float(low), 'reference_m': round(float(ref_w), 2), 'render_m': round(float(ren_w), 2)})
    out['width_by_height'] = bands

    top_mask = alpha(build / f'{prefix}top.png')
    best = (0.0, 1.0, 0, False)
    for mirror in (False, True):
        for angle in range(0, 360, 5):
            image = turned(top_mask, angle, mirror)
            for scale in np.arange(0.8, 1.6, 0.02):
                result = iou(top_ref, scaled(image, scale))
                if result > best[0]:
                    best = (result, float(scale), angle, mirror)
    top_snow = np.asarray(Image.open(build / f'{prefix}top-snow.png').convert('L')) > 128
    out['top'] = {'iou': round(best[0], 4), 'scale': round(best[1], 2), 'rotation_deg': best[2], 'mirrored': best[3]}
    out['top_iou'] = out['top']['iou']
    out['top_snow_share'] = round(float((top_snow & top_mask).sum() / top_mask.sum()), 3)
    return out, {'best_view': best_view, 'side': masks, 'top': top_mask, 'top_fit': best[1:]}


scores = {
    'side_reference_snow_share': round(float(ref_snow.sum() / side_ref.sum()), 3),
    'top_reference_snow_share': round(float(((top_ref_rgb.mean(axis=2) > 150) & top_ref_full).sum() / top_ref_full.sum()), 3),
    'reference_colour': {'snow': hex_of(side_ref_rgb[ref_snow]), 'needles': hex_of(side_ref_rgb[ref_dark])},
}
masks = {}
for version, prefix in VERSIONS.items():
    if (build / f'{prefix}side-0.png').exists():
        scores[version], masks[version] = score(prefix)
if 'far' in scores:
    scores['far_against_near'] = {'side_mean_envelope_iou': round(float(np.mean(
        [iou(close(masks['near']['side'][a]), close(masks['far']['side'][a])) for a in AZIMUTHS])), 4)}

report = json.loads((build_dir / 'report.json').read_text())
scores['checks'] = budget.checks(report, scores)
(build / 'scores.json').write_text(json.dumps(scores, indent=2) + '\n')

# Contact sheet: the side views at 768 px tall, then the top views at 512 px.
H = 768
row1 = [Image.fromarray(side_ref_rgb.astype(np.uint8))]
row2 = [(Image.fromarray(top_ref_rgb.astype(np.uint8)), Image.LANCZOS)]
for version, prefix in VERSIONS.items():
    if version not in masks:
        continue
    found = masks[version]
    view = found['best_view']
    row1 += [on((207, 209, 213, 255), build / f'{prefix}side-{view}.png'), overlay(side_ref, found['side'][view])]
    fit = centred(found['top'], *found['top_fit'])
    row2 += [(on((0, 0, 0, 255), build / f'{prefix}top.png'), Image.LANCZOS), (overlay(top_ref, fit), Image.NEAREST)]
sheet = Image.new('RGB', (512 * len(row1), H + 512), 'white')
for i, tile in enumerate(row1):
    sheet.paste(tile.resize((512, H), Image.LANCZOS), (512 * i, 0))
for i, (tile, resample) in enumerate(row2):
    sheet.paste(tile.resize((512, 512), resample), (512 * i, H))
sheet.save(build / 'sheet.png')

print(json.dumps({key: value for key, value in scores.items() if key != 'checks'}, indent=2))
failed = [c for c in scores['checks'] if not c['pass']]
for c in scores['checks']:
    print(f"{'PASS' if c['pass'] else 'FAIL'}  {c['name']}: {c['value']} ({c['limit']})")
print(f'PINE_CHECKS {len(scores["checks"]) - len(failed)} passed, {len(failed)} failed')
sys.exit(1 if failed else 0)
