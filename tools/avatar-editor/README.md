# Avatar workshop

Run from the repository root after installing Python 3.10+:

```sh
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r tools/avatar-editor/requirements.txt
cd frontend
npm run avatars
```

Open http://localhost:5174. The separate loopback-only editor needs neither the backend nor Vite. Its write endpoints accept only same-origin JSON from the local editor origin. Stop it with Ctrl+C.

## Compose, save and curate

Open a draft or choose New design. Choose compatible body, hair, face, top, bottom and footwear parts and supported colours. Body proportions filter clothing options. All four directions show standing, animated walking and sitting. Turn off Animate walking to pause the animation. Save draft writes the recipe under `drafts/` with a stable ID independent of its 1–24 character name. Names are Player-facing — every Player reads them in their own chooser, though never as an in-world label — so judging their content is yours to do; the tool enforces only the length. Restart the editor and reopen it from the library. Duplicate creates a saved independent identity; rename/edit preserve identity. Deleting a draft leaves other drafts and published artifacts alone. Unsaved changes prompt before switching designs.

Check designs in the library to select them for publication. Use the arrows to arrange them, then Publish collection. A collection holds at least one preset and has no upper bound. Validation requires distinct IDs, names, six compatible parts, supported palettes and every source animation frame. Errors explain what needs fixing; the prior publication remains unchanged. Drafts may be incomplete on disk but cannot be previewed or published until complete.

Publication snapshots names, stable IDs, ordered standing/walking sheets and seated leg sheets into `backend/data/published-avatars.json` using atomic file replacement. No draft recipe or source artwork is included. The backend is the file's only reader: it resolves the current collection when it creates a Room and serves that to the Room's clients. Publishing therefore reaches the next Room created, with no rebuild and no restart. Rooms already running keep the collection they were created with, so no Lobby changes underneath its Players.

## Adding compatible source parts

`catalogue.json` records the pinned upstream revision and curated choices. `sources/` contains the credited LPC layers at their original relative paths. For each new part:

1. Add a licensed RGBA PNG with four direction rows (up, left, down, right), nine 64×64 cells per row: standing, then eight walking frames. Preserve registration and the 576×256 dimensions. No arbitrary editor uploads are supported.
2. Add its stable key, label, source file, six source palette colours and supported six-colour target palettes under the correct catalogue slot. Colours are substituted simultaneously before source-over composition.
3. Clothing key suffixes identify `male`, `female` (top) or `thin` (bottom/footwear) proportions. Body choices use `male`/`female`; keep these compatible. Faces and adult hair use the existing LPC registration.
4. Keep the existing seated-compatible clothing cut: upper-body artwork ends at pixel 42 in the standing frame, while generated bent trousers and shoes supply the lower body. New clothing silhouettes outside that cut need explicit rendering work before being offered as compatible parts.
5. Update `frontend/public/assets/avatars/CREDITS.csv`, `credits.html` and applicable license text. Reuse the same attribution for recolours. The shipped designs use only the already credited layers. `legacy-recipes.json` preserves the original six recipes and `reference/` preserves their visual reference sheets.
6. Inspect all poses, then run `python3 tools/avatar-editor/test_authoring.py` from the root (also included in `frontend/npm test`). Publish only once compatible.

Seated leg sheets contain eleven lowering frames per direction, from 0 through 10 pixels, in 64×64 cells with origin (32,40). Runtime and preview use these exact published pixels; shoe colour is no longer hard-coded. The original upper body retains its proportions. The six recreated standing/walking sheets match their references within one RGB unit of alpha-compositor rounding.

The Player build includes attribution only; the collection arrives at runtime from the backend. Vite never imports this editor, its drafts or the publication. Do not put authoring resources in `frontend/public/`.
