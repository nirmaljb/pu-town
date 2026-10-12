---
status: accepted
---

# Give each Town Map its own bounds and Meeting Area

Silver Jubilee Campus replaces Neon Ward using the owner's road and satellite references: recognisable road loops, two radial academic blocks, generous woodland, warm night lighting and furnished gameplay interiors. The references establish layout rather than surveyed scale or indoor plans; unnamed buildings retain neutral labels. Its 4096 × 4480 bounds fit this campus section, and the Meeting Area sits beside the central building.

Replace ADR 0020's shared bounds and Seat centre with per-map geometry, keeping the shared Seat offsets and Facing. This costs coordinated changes to server validation, Lobby positioning, Day resets, client prediction, camera and overview placement, but avoids stretching the campus or adding empty land to fit the village. The Room still pins one authoritative map; Lobby selection keeps Seat identity and Ready, Start locks selection, and recovery retains it. Geometry and artwork switch together at the client frame boundary before Avatars reconcile. The existing `cyberpunk` wire identifier remains stable; its displayed name is Silver Jubilee Campus. Village and horror geometry stay as published.
