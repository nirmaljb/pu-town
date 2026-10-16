# Retained free town and character sources

The current towns use the free **Medieval Village MegaKit Standard**, retained
**Stylized Nature MegaKit Standard**, and three already imported **Fantasy Props
MegaKit Standard** meshes (Chair_1, Bench and Table_Large). Characters use all five
free **KayKit Adventurers 2.0** models and **Character Animations 1.1** Medium-rig
sets. No paid edition was acquired.

Official sources:

- https://github.com/watabou/TownGeneratorOS
- https://quaternius.itch.io/medieval-village-megakit
- https://quaternius.itch.io/stylized-nature-megakit
- https://kaylousberg.itch.io/kaykit-adventurers
- https://kaylousberg.itch.io/kaykit-character-animations

`archive-inventory.json` records exact archive hashes, lengths and member CRCs.
The original included licenses are retained beside each pack's inventory. These
exact downloads contain explicit CC0 notices. The Nature and Props licenses and
inventories are in `quaternius/stylized-nature-megakit/` and
`quaternius/fantasy-props-megakit/`, with the retrieved license pages in
`quaternius/license-evidence/`.

Restore the exact locally downloaded free ZIPs named in
`tools/native-assets/import-town-assets.py`, then run:

```sh
python3 tools/native-assets/import-town-assets.py
python3 tools/native-assets/import-town-assets.py --check
```

The importer makes no network request and verifies hashes and complete archive
CRCs before copying selected source bytes. `quaternius/*-selection.json` records
every selected mesh, texture and glTF material mapping. Original models/textures
remain unchanged; channel conversions belong in `TownDerivedTextures`.

`GeneratedTownBuild` creates materials in the existing Built-in render pipeline,
fits exterior modules to canonical solid footprints, supplies ten retained
chairs, and builds the paths, wells, market stands and vegetation. Art has no
movement Colliders. `Building:` and `Vegetation:` roots permit camera fading
without changing the authoritative recipient view.

Downloaded archives, extracted originals, editable masters, duplicate exports,
platform bundles and embedded publication remain local under `.gitignore`.
Selected runtime meshes/textures, Unity metadata, code, geometry, licenses,
provenance and compact camera evidence are tracked. No active runtime texture
exceeds 5 MiB, so the restoration manifest is empty.
