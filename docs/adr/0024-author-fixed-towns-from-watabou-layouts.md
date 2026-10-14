---
status: accepted
---

# Author fixed towns from Watabou layouts

Replace the playable native Kalapet Main Campus with two fixed towns generated
from TownGeneratorOS and assembled using the selected modular Medieval Village
and Nature assets. Generate and curate layouts during authoring, retaining their
source revision, seed, settings and actual geometry; Rooms select packaged maps
rather than generating new layouts at runtime.

Preserve generated streets and districts while fitting building footprints to
the modular kit and existing authoritative geometry. This trades exact irregular
building outlines for aligned artwork/collision and the established movement
representation. Buildings are non-enterable in this first slice. One canonical
publication supplies Java and Unity with the same bounds, obstacles and retained
Seat layout; decorative roofs, foliage and camera fading never change Vision.

This replaces ADR 0023's campus-specific content and publication decision while
retaining Java authority, native frame-boundary application, per-Room pinning,
recovery and the existing migration boundary. Shared imported assets and their
source/license evidence move into the replacement pipeline as needed; retired
campus scenes and resources leave the Player build.
