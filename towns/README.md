# Fixed native Town Maps

- **Woodland Village**: actual TownGeneratorOS size `8`, seed `20261014`,
  17 fitted exterior buildings across 8 retained town wards; furthest public
  outward walk 17.13 seconds.
- **Market Town**: actual TownGeneratorOS size `12`, seed `20261015`,
  25 fitted exterior buildings across 16 retained town wards; furthest public
  outward walk 15.49 seconds.

The source version, complete raw exports, fitting/foliage recipes and canonical
geometry are retained beside each map. District polygons and the two organic
main roads come from the pinned upstream model. Building artwork fits the saved
solid exterior rectangles; neither map includes interiors or Tasks.

`layout-review.png` and each `preview.svg` show actual saved geometry for review;
they do not represent the final imported 3D artwork. `reachability.json` contains
collision-verified paths and measured public travel times. Source licenses,
hashes, generation, publication and verification commands are in
[`tools/towns/README.md`](../tools/towns/README.md).
