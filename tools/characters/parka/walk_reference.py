"""Turn the owner's side-view walk recording into per-phase reference silhouettes.

Usage: python3 tools/characters/parka/walk_reference.py LEFT_MP4 [OUT_PNG]

LEFT_MP4 is the owner's recording of the parka walking past a fixed camera with
its left side to the lens (`left.mp4`, see README Provenance). It needs ffmpeg,
NumPy and Pillow. The output, `reference/walk-left.png` by default, is one row of
PHASES silhouettes, black on white, one per cycle phase from the left boot's
landing. Each tile spans TILE metres at PX_PER_M with the ground 5 cm above its
bottom edge. The walker's travel is removed by following a straight line fitted
to the back of its hood; compare.py finds where the hips sit on that line.

Measured once by hand from the recording's planted boots and kept here: the left
boot lands at LEFT_LANDING and one cycle (two steps) lasts CYCLE frames.
"""
import hashlib
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SHA256 = 'c62657cffbdf2c56aaa04c1aefa34eaf01300d2fe44da6b4323e8f8f855df3c1'
HEIGHT = 1.695  # the parka's height in metres, as built
FPS = 55
PHASES = 16
PX_PER_M = 100
TILE = (1.8, 1.9)  # width and height in metres
GROUND = 0.05  # metres of tile below the ground
# 1-based frame numbers: one uninterrupted pass; the clip loops back after LAST.
FIRST, LAST = 16, 142
LEFT_LANDING = 61.0
CYCLE = 64.2
# The viewer's interface panels and the letterbox bars are not part of the figure.
IGNORE = [(0, 0, 160, 1080), (1760, 0, 1920, 1080), (1400, 0, 1760, 700)]
THRESHOLD = 5  # grey levels from the background
CLOSE = 9  # pixels


def frames(video):
    with tempfile.TemporaryDirectory(prefix='parka-walk-') as work:
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(video), '-vf', 'format=gray', f'{work}/f%03d.png'],
                       check=True)
        return {int(p.stem[1:]): np.asarray(Image.open(p), dtype=np.float32) for p in Path(work).glob('f*.png')}


def solid(mask):
    """Close small gaps, then fill every hole the tile's border cannot reach.

    Lit parts of the boots and trousers come close to the background's grey, so
    the raw difference leaves holes inside the figure.
    """
    image = Image.fromarray(np.where(mask, 255, 0).astype(np.uint8))
    pad = Image.new('L', (image.width + 2 * CLOSE, image.height + 2 * CLOSE), 0)
    pad.paste(image, (CLOSE, CLOSE))
    pad = pad.filter(ImageFilter.MaxFilter(CLOSE)).filter(ImageFilter.MinFilter(CLOSE))
    ImageDraw.floodfill(pad, (0, 0), 128)
    return (np.asarray(pad) != 128)[CLOSE:-CLOSE, CLOSE:-CLOSE]


def main():
    video = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent / 'reference/walk-left.png'
    digest = hashlib.sha256(video.read_bytes()).hexdigest()
    if digest != SHA256:
        sys.exit(f'{video} is not the measured recording (sha256 {digest})')
    images = frames(video)
    background = np.median(np.stack([images[k] for k in sorted(images)[::4]]), axis=0)
    masks, tops, backs, bottoms = {}, {}, {}, {}
    for k in range(FIRST, LAST + 1):
        mask = np.abs(images[k] - background) > THRESHOLD
        for x0, y0, x1, y1 in IGNORE:
            mask[y0:y1, x0:x1] = False
        ys, xs = np.nonzero(mask)
        masks[k], tops[k], bottoms[k] = mask, ys.min(), ys.max()
        # The figure faces -x, so the back of its hood is the largest x near the top.
        backs[k] = xs[(ys > ys.min() + 10) & (ys < ys.min() + 60)].max()
    ground = int(np.median(list(bottoms.values())))
    scale = (ground - min(tops.values())) / HEIGHT  # pixels per metre
    t = sorted(backs)
    speed, start = np.polyfit(t, [backs[k] for k in t], 1)
    w, h = round(TILE[0] * PX_PER_M), round(TILE[1] * PX_PER_M)
    strip = Image.new('L', (w * PHASES, h), 255)
    for i in range(PHASES):
        when = LEFT_LANDING + CYCLE * i / PHASES
        k = int(round(when))
        centre = start + speed * when
        box = [round(v) for v in (centre - TILE[0] / 2 * scale, ground - (TILE[1] - GROUND) * scale,
                                  centre + TILE[0] / 2 * scale, ground + GROUND * scale)]
        tile = solid(masks[k][box[1]:box[3], box[0]:box[2]])
        tile = Image.fromarray(np.where(tile, 0, 255).astype(np.uint8)).resize((w, h), Image.BILINEAR)
        strip.paste(tile.point(lambda v: 0 if v < 128 else 255), (i * w, 0))
    out.parent.mkdir(parents=True, exist_ok=True)
    strip.save(out, optimize=True)
    print(f'{out}: {PHASES} phases, {scale:.1f} px/m, travel {-speed / scale * FPS:.3f} m/s, '
          f'step {-speed * CYCLE / 2 / scale:.3f} m, cycle {CYCLE / FPS:.3f} s')


main()
