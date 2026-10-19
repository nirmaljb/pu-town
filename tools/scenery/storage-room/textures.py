"""Cut the owner's side elevation into a board atlas for make.py.

python3 textures.py   (needs Pillow and NumPy; deterministic)
Each cell is one real board from 'Snowy charcoal timber shed side view-2.png',
cut between its visible joints, clear of rafter shadow and snow, and resampled
to 64 x 384 pixels. Cells span the full atlas height, so V repeats inside a board.
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT/'reference'/'Snowy charcoal timber shed side view-2.png'
# Joint-to-joint board columns, read from a gridded copy of the side elevation.
BOARDS = [(365, 436), (444, 496), (504, 556), (565, 620), (630, 686), (694, 746), (755, 810),
          (818, 870), (878, 930), (938, 990), (998, 1046), (1056, 1110), (1118, 1174),
          (1182, 1234), (1244, 1294)]
TOP, BOTTOM = 526, 838
CELL = (64, 384)

image = Image.open(SOURCE).convert('RGB')
cells = []
for left, right in BOARDS:
    strip = np.asarray(image.crop((left, TOP, right, BOTTOM)).resize(CELL, Image.LANCZOS)).astype(float)
    # Even out the illustration's lighting so no single board reads as a patch.
    strip *= 98/strip.mean()
    cells.append(strip)
cells.append(cells[3][::-1, ::-1])
atlas = np.clip(np.concatenate(cells, axis=1), 0, 255).astype(np.uint8)
Image.fromarray(atlas).save(ROOT/'textures'/'weathered-boards.png', optimize=True)
print('atlas', atlas.shape, 'cells', len(cells))
