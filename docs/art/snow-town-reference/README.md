# Snow-town reference images

The owner supplied these four images on 2026-10-15 for the reference snow town
recorded in [ADR 0027](../../adr/0027-reference-snow-town-with-wind-shaped-depth.md)
([issue #94](https://github.com/nirmaljb/pu-town/issues/94)). Each file is
preserved byte for byte under a descriptive name, with its SHA-256 below. They
are authoring references, not runtime textures; no image enters the Godot project.
Authorship and license were not supplied.

| Image | Role | Pixels | Supplied as | SHA-256 |
| --- | --- | --- | --- | --- |
| [`town-top-down.png`](town-top-down.png) | Whole-map spatial reference | 1376 × 768 | `Gemini_Generated_Image_vifothvifothvifo.png` | `13f93b3a2b52055eb7d5636498eaa065009c181f414f7b5f619c8da9fc1ca8ce` |
| [`outpost.png`](outpost.png) | Mood and detail reference | 1376 × 768 | `Gemini_Generated_Image_vifothvifothvifo (1).png` | `68e2fb7109f75a9b99b7262e057e123426b8be45c0300454ffce011cb5c41d0f` |
| [`compound-courtyard.png`](compound-courtyard.png) | Mood and detail reference | 1536 × 1024 | `Snowbound Monastery in Polar Twilight.png` | `0aa52fc116f2214ad48c1a48c7f3711e3a2363864df8dd3aee47bf55bbb5c6aa` |
| [`meeting-interior.jpeg`](meeting-interior.jpeg) | Mood and detail reference | 1024 × 576 | `bbdcc484-593d-4d67-af12-f869d6f4c145.jpeg` | `357bc97b34216a91a3177d04502c4d2ec2c17b40c3c2ddf0e7bc68148033d28e` |

## Whole-map reference

`town-top-down.png` is the spatial reference for the town's composition, with
north up. It shows a walled compound in the west, a central meeting hall and an
outpost in the east, all on a shelf above a southern forest. A stair runs south
from the compound's gate. The image establishes composition, not measured
dimensions. ADR 0027 maps the whole picture onto a **100 × 56 m** town, scaled
against features of known size: a ten-person round table of about 3.5 m and
sheds of about 8 m. At the preserved 1376 × 768 pixels that is about 13.8 px per
metre; the parent issue's estimate of about 10 px per metre corresponds to the
same picture viewed 1000 px wide. The toolbars, minimap and rulers around the
edge are part of the supplied picture, not an interface specification.

## Mood and detail references

`outpost.png`, `compound-courtyard.png` and `meeting-interior.jpeg` guide the mood
and detail of the outpost yard, the compound's courtyard and the Meeting
interior. They do not set the layout, which follows the top-down image where they
differ. The earlier [`../snow-reference/reference.png`](../snow-reference/README.md)
remains the colour reference, with its full histogram and palette. No palette has
been extracted from these images, and their colours do not replace it.

## Check

[`SHA256SUMS`](SHA256SUMS) lists the same hashes. From the repository root:

```sh
(cd docs/art/snow-town-reference && shasum -a 256 -c SHA256SUMS)
```
