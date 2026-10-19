"""Place each orthographic render beside its owner sheet at the same pixel scale.

python3 compare.py BUILD_DIR TAG
Writes TAG-compare-VIEW.png (sheet above, render below), TAG-overlay-VIEW.png (the
sheet's edges traced in red over the render) and TAG-ghost-VIEW.png (an even blend of
both) for the front, side and top views.
Renders are presented like the sheets: charcoal ground and a soft halo round the silhouette.
"""
from pathlib import Path
import sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent
SHEETS = {'front': 'Snow-capped industrial generator-1.png',
          'side': 'Snow-Capped Generator Side Profile-2.png',
          'top': 'Snow-Covered Generator with Rooftop Vents-3.png'}


def present(render, halo=True):
    alpha = render.getchannel('A')
    ground = Image.new('RGB', render.size, (0, 0, 0))
    if halo:
        glow = alpha.filter(ImageFilter.GaussianBlur(46)).point(lambda v: int(v*.62))
        ground = Image.composite(Image.new('RGB', render.size, (96, 100, 108)), ground, glow)
    ground.paste(render.convert('RGB'), (0, 0), alpha)
    return ground


def edges(sheet):
    grey = sheet.convert('L').filter(ImageFilter.GaussianBlur(1.6))
    found = grey.filter(ImageFilter.FIND_EDGES).point(lambda v: 255 if v > 14 else 0)
    return found.filter(ImageFilter.MaxFilter(3))


def main():
    build, tag = Path(sys.argv[1]), sys.argv[2]
    for view, name in SHEETS.items():
        sheet = Image.open(ROOT/'reference'/name).convert('RGB')
        rendered = Image.open(build/f'{tag}-{view}.png').convert('RGBA')
        assert rendered.size == sheet.size, (view, rendered.size, sheet.size)
        shown = present(rendered, view != 'top')
        w, h = sheet.size
        sheet_small = sheet.resize((w//2, h//2), Image.LANCZOS)
        shown_small = shown.resize((w//2, h//2), Image.LANCZOS)
        pair = Image.new('RGB', (w//2, h+28), (16, 16, 18))
        pair.paste(sheet_small, (0, 14)); pair.paste(shown_small, (0, h//2+28))
        draw = ImageDraw.Draw(pair)
        draw.text((6, 1), 'owner sheet', fill=(230, 230, 230))
        draw.text((6, h//2+15), f'{tag} render', fill=(230, 230, 230))
        pair.save(build/f'{tag}-compare-{view}.png')
        trace = edges(sheet)
        overlay = shown.copy()
        overlay.paste(Image.new('RGB', sheet.size, (255, 40, 40)), (0, 0), trace)
        overlay.save(build/f'{tag}-overlay-{view}.png')
        Image.blend(sheet, shown, .5).save(build/f'{tag}-ghost-{view}.png')
        diff = ImageChops.difference(sheet.convert('L'), shown.convert('L'))
        mean = sum(i*c for i, c in enumerate(diff.histogram()))/(w*h)
        print(f'{view}: mean luminance difference {mean:.1f}/255')


if __name__ == '__main__':
    main()
