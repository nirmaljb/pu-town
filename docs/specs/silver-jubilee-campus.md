# Silver Jubilee Campus

Replace the Night City / Neon Ward map with **Silver Jubilee Campus**, using the owner's road-map and satellite screenshots of this section of Pondicherry University. Start from the latest live Tailscale branch (`live-619e990-tailscale`, `80b1d1b` at implementation start).

- Preserve recognisable inner and outer road loops, the southern roundabout, two radial academic blocks, the central clearing/building, School of Social Sciences, Electronic Media and UMSARC. Widen paths and simplify footprints where gameplay needs it.
- Fit actual map bounds to the campus section while preserving spacious travel distances and substantial woodland. The reference looks compact at overview scale but should not feel cramped.
- Use a grounded campus at night: dark greenery, warm streetlights, lit academic buildings and readable landmark labels.
- Keep the name exactly **Silver Jubilee Campus**. Use neutral names for unidentified buildings; no names or real indoor floorplans were supplied for them.
- Put the Lobby/Townhall Meeting Area beside the central building in the circular clearing.
- Include furnished enterable rooms across the major landmarks and both radial blocks; distribute Tasks indoors and outdoors. Interiors are gameplay interpretations of the exterior references.
- Preserve Room map selection, retained Seat identity/Ready, Start locking, recovery, authoritative movement and per-recipient interior privacy. Each map may now own its bounds and Meeting Area; publish the same geometry to both components.
- Record the per-map geometry trade-off in an ADR and update available Town Map names in the glossary.

The user confirmed all of these choices and corrected the proposed name to the exact name above. Artwork details and exact playable dimensions are implementation choices. Screenshots are design references; provider imagery is not shipped as terrain.
