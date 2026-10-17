# Frostwatch Outpost reference images

The owner supplied these images on 2026-10-17 for Frostwatch Outpost, recorded in
[ADR 0028](../../adr/0028-frostwatch-outpost-flat-snowfield-and-camp.md)
([issue #104](https://github.com/nirmaljb/pu-town/issues/104)). They are authoring
references, not runtime textures; no image enters the Godot project. Authorship
and license were not supplied. The earlier
[snow-town references](../snow-town-reference/README.md) are kept as the history
behind ADR 0027.

| Image | Role | Pixels | Supplied as | Supplied SHA-256 |
| --- | --- | --- | --- | --- |
| [`satellite-sketch.png`](satellite-sketch.png) | Whole-map layout: Camp, Roads and tree marks | 705 × 776 | `3a6ffec0-371c-47d7-8c20-d9fded504803.png` | `9c99a5e3749a9bc4f32be45d8ba32d7f0b16fe9475603ffd5bc7582c437f2035` |
| [`camp-fence-sketch.png`](camp-fence-sketch.png) | Shape of the Perimeter fence only | 914 × 522 | `Gemini_Generated_Image_6ulxay6ulxay6ulx (1).png` | `1e96e7b9e3a29852f06510aa5a9d9ae96e63dda3c3e6fba85bdd7f5f2d986741` |
| [`crossroads-camp-map.jpg`](crossroads-camp-map.jpg) | Painted map around the Camp; the fence sketch is cropped from it | 2752 × 1536 | `Gemini_Generated_Image_6ulxay6ulxay6ulx.png` | `90dfdc7e2d1fee37ae90a4dc2944ca1c0af166cf843052fc10a971b60daac354` |
| [`centre-shaded-painting.jpg`](centre-shaded-painting.jpg) | Painted, shaded view of the centre: Camp buildings, paths and forest | 2752 × 1536 | `Gemini_Generated_Image_fn0nf4fn0nf4fn0n.png` | `7d53a0d4e9bdf6b467bdeea92cd0a4b60bf4173dd12692d8952c1b184a9e1e29` |

The two PNG sketches are preserved byte for byte. The two paintings were supplied
as 8.3 MB and 9.9 MB PNGs, over the repository's 5 MiB upload limit, so they are
kept as full-resolution JPEGs re-encoded with macOS `sips -s format jpeg -s
formatOptions 90`. The table gives the supplied files' hashes; [`SHA256SUMS`](SHA256SUMS)
gives the committed files'.

## Whole-map layout

`satellite-sketch.png` is the spatial reference for the whole map, with north up.
The Camp stands at its exact centre, four Roads run diagonally from it to the
edges, the north-west and south-west Roads each send a branch west, and pines
stand in clusters and singly across open snow. ADR 0028 maps the sketch's extent
onto the 500 × 550 m map; the sketch establishes composition, not measured
dimensions.

## The Camp

`camp-fence-sketch.png` is used **only** for the shape of the Perimeter: a loose
split-rail ring round the Camp, open where the Roads cross it. Its buildings,
towers and the mountain passes in the surrounding map are not part of the layout.
`crossroads-camp-map.jpg` and `centre-shaded-painting.jpg` are the owner's larger
paintings around the centre. They guide the Camp's arrangement of lodge, sheds,
cabins, workshop, towers and crate stacks round an open yard, and its mood; where
they differ from the satellite sketch, the sketch sets the layout. Their relief,
mountain passes and labels are not part of Frostwatch Outpost, whose ground is
flat.

## Camera reference frames

The owner's camera references are three screenshots of another snow game, taken
on 2026-10-16. They are frames of someone else's work, so they are **not kept in
the repository**; this record identifies them for later comparison:

| Supplied as | Pixels | SHA-256 |
| --- | --- | --- |
| `Screenshot 2026-10-16 at 1.08.49 PM.png` | 2878 × 1620 | `b0a0dd17388a2d72f258198008ef4766c10cbdcdd2b3307e8c28edb3aebcb4bf` |
| `Screenshot 2026-10-16 at 1.09.53 PM.png` | 2878 × 1620 | `10e4926b6268e5b5c269d34505e96307149d893bb3dd91669abf7d9a07534f00` |
| `Screenshot 2026-10-16 at 1.09.59 PM.png` | 2878 × 1620 | `69a15fea1b80c50c4461d7d087780a2b1c1bb6379f0c1c0594df989ed1cff77e` |

They show a small figure walking past a lit house, a truck, bare trees and a power
pole, seen at about −40° pitch through a wide lens of about 40°, with the figure
about an eighth of the screen tall. The
[oblique camera record](../../verification/2026-10-17-godot-snow-oblique-camera.md)
holds the camera matched to them.

## Check

From the repository root:

```sh
(cd docs/art/frostwatch-reference && shasum -a 256 -c SHA256SUMS)
```
