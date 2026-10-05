# Town redesign research and interview draft

Research date: 5 October 2026. Inspected branch: `live-619e990-tailscale`, commit `ee7bf4f`. This is a proposal awaiting the design interview, not an accepted gameplay decision.

## Design evidence

- [Dave Tamayo: The Fungle](https://www.davetamayo.com/innersloth-features1/thefungle). The Among Us map designer describes balanced major/minor route loops, minimized chokepoints, opportunities for both factions, and repeated playtesting. Apply these principles to a connected town rather than expanding empty ground.
- [Andrew Yoder: The Holy Grail of Multiplayer Level Design, GDC 2018](https://media.gdcvault.com/gdc2018/presentations/Yoder_Andrew_HolyGrailOfMultiplayer.pdf). Discusses readable environments and intermediate complexity. Applying shooter map principles to PU Town is an inference, not direct evidence of social-deduction balance.
- [Amit Patel: All-pairs shortest paths](https://www.redblobgames.com/pathfinding/all-pairs/). Route-frequency analysis can identify crossroads, bottlenecks and dead ends. Use the walkable grid to evaluate routes between Task destinations.
- [Sarkar et al.: Training Language Models for Social Deduction with Multi-Agent Reinforcement Learning](https://arxiv.org/abs/2502.06060). Studies communication in an embodied Among Us environment. It offers context for observed evidence and discussion, not a prescription for human game balance or map dimensions.

## Asset shortlist

| Creator source | Visual fit | Terms stated on creator page |
| --- | --- | --- |
| [Pixel Frog: Tiny Swords](https://pixelfrog-assets.itch.io/tiny-swords) | Closest to the existing medieval town, including animated scenery | Game use and edits allowed; current pack restricts redistribution/repackaging. A separate old CC0 download is offered. Verify the specific downloaded version before adding raw assets to the public repository. |
| [Kenney: Tiny Town](https://kenney.nl/assets/tiny-town) | Cohesive, simpler village artwork at 16px tile scale | CC0; 130 files. Strong candidate for free assets distributed as source in this repository. |
| [LimeZu: Modern Exteriors](https://limezu.itch.io/modernexteriors) | Detailed modern settlement; would change the town's art direction | Paid pack; game use and modification allowed with attribution; asset distribution restricted. |
| [Gif: Super Retro World Interior Pack](https://farm-animal.itch.io/interior-pack) | Existing interior artwork | Current page restricts direct asset distribution and certain project categories. Check the acquisition-time license of existing files. |

Game distribution and raw asset-pack redistribution are distinct. Preserve the exact license and provenance of any new assets selected. Do not treat an entire marketplace as sharing one license.

## Branch facts before implementation

The latest Game uses Day, sleeping Night and Townhall (ADR 0016); live Roam abilities and Bodies are retired. Day lasts 180 seconds. Walking speed on the client is 220px/s. The map is 2560 by 1440px, on a 32px collision grid. Day visibility combines a shared 320px distance with an indoor/outdoor area boundary; living Players do not see Ghosts. Hearing is separately governed by distance and area, including voice grants. Private Night choices and Role information remain recipient-specific.

The renderer loads embedded Tiled tilesets and supports animated, y-sorted objects. The map generator currently depends on Windows asset paths; regeneration needs portable source discovery. Collision data, interior boundaries, Seat positions and Task destinations must stay synchronized across the map and both components.

## Initial proposal (superseded by interview decisions)

Build a 5120 by 2880px town: four times the existing area at the same sprite scale. Place retained Seats in a clear central square. Connect farm/orchard, harbor/market, chapel/cemetery, smithy/mine, woodland and residential districts with an inner loop, outer loop and cross-streets. Major Task destinations should have multiple approaches. This size is a design proposal, not a validated optimum. Unobstructed width traversal is approximately 23 seconds; check actual Task routes and encounter frequency, especially with four Players.

Remove manual Role-count controls and calculate Roles on the server from the starting Roster. Proposed schedule: four to six Players receive one Mafia, one Doctor and one Sheriff; seven to ten receive two Mafia, one Doctor and one Sheriff. Others are Villagers. Solo Practice needs its existing special handling.

Frame Lobby Players more tightly, allowing for Avatar heads, Display Names and side controls. Keep Ready, Start, character selection and room actions accessible. Final placement and any automatic Role summary await clarification.

## Interview decisions

First round: remove both fog and distance-based visibility; retain unseen Ghosts and private information. Use a village with woods, farm and riverside. New assets must be free with redistribution rights. Four to six Players retain one Mafia, one Doctor and one Sheriff; ten Players should receive three Mafia. Retain count selection in a side overlay that does not resize the game window, superseding the original request to remove count controls.

Second round pending: automatic defaults versus Host overrides; the seven-to-nine-Player schedule; indoor visibility and proximity Hearing; exact map dimensions; the free art pack. Implementation remains pending completion and confirmation of the design interview. The glossary records the settled distance-independent meaning of Vision; runtime behavior still uses the old rule until implemented.

The subsequent request explicitly authorizes generating three map variants: vibrant village, dark horror and cyberpunk city. Those editable exterior drafts and their comparison viewer are in [pu-town/variants](../pu-town/variants/README.md), using verified Kenney CC0 archives. The earlier single village direction is expanded to three alternatives for comparison. Gameplay and runtime map selection remain pending; the map drafts do not silently change the running Game.

Final decisions: automatic defaults with Host-only overrides; Mafia counts 1 at 4–6, 2 at 7–9, 3 at 10; one Doctor and one Sheriff; preserve indoor separation and proximity Hearing; all maps are 7680 × 4320; vibrant village is the playable default. See ADR 0019. Earlier proposals in this research record are historical interview context.

Implementation complete: the village is served by the Player app, shared geometry and Tasks are regenerated by `publish.py`, automatic counts and Host overrides are active, and distance Vision and fog are removed. Horror and cyberpunk remain editable alternatives. Verification is recorded in [the verification report](verification/2026-10-05-expanded-village.md).

## Subsequent supplied-art revision

The owner rejected the earlier small-sprite exterior style, requested indoor design and live scenery, then supplied `tilesets.rar` for all three maps. Its detailed terrain, buildings, furniture and animated objects supersede the earlier exterior choices. Village now has ten furnished interiors; horror and cyberpunk have six each. The archive contains no license file; its provenance is retained without a CC0 claim. [Verification](verification/2026-10-05-supplied-interiors.md) covers area privacy, animation pause/resume and browser review.
