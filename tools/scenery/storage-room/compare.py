"""Place each orthographic review render beside its owner reference sheet.

python3 compare.py build TAG   (needs Pillow; writes build/TAG-compare-*.png)
Transparent renders sit on a dark backdrop like the sheets'.
"""
from pathlib import Path
import sys
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
PAIRS = {'front': 'Snow-capped timber shed front elevation-1.png',
         'side': 'Snowy charcoal timber shed side view-2.png',
         'top3q': 'Snow-Capped Gabled Timber Shed Top View-3.png',
         'plan': 'Snow-covered shed roof plan-4.png'}
build, tag = Path(sys.argv[1]), sys.argv[2]
for view, sheet in PAIRS.items():
    render_path = build/f'{tag}-{view}.png'
    if not render_path.exists():
        continue
    ref = Image.open(ROOT/'reference'/sheet).convert('RGB')
    render = Image.open(render_path).convert('RGBA')
    backdrop = Image.new('RGBA', render.size, (24, 25, 28, 255))
    render = Image.alpha_composite(backdrop, render).convert('RGB')
    height = 900
    a = ref.resize((round(ref.width*height/ref.height), height), Image.LANCZOS)
    b = render.resize((round(render.width*height/render.height), height), Image.LANCZOS)
    sheet_ = Image.new('RGB', (a.width+b.width+12, height+36), (10, 10, 12))
    sheet_.paste(a, (0, 36))
    sheet_.paste(b, (a.width+12, 36))
    draw = ImageDraw.Draw(sheet_)
    draw.text((10, 10), 'owner reference: '+sheet, fill=(220, 220, 220))
    draw.text((a.width+22, 10), f'Blender {tag} {view}', fill=(220, 220, 220))
    for k in range(1, 9):           # shared horizontal guides at equal fractions
        y = 36+k*height//9
        draw.line([(0, y), (sheet_.width, y)], fill=(120, 40, 40), width=1)
    sheet_.save(build/f'{tag}-compare-{view}.png')
    print('wrote', build/f'{tag}-compare-{view}.png')
