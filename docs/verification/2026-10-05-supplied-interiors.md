# Supplied artwork, interiors and animation — 5 October 2026

The owner supplied `tilesets.rar` and explicitly requested its elements across the three maps. The archive is extracted under `pu-town/variants/assets/supplied/tilesets`; its SHA-256 and lack of an included license are recorded in the source manifest. Earlier CC0 claims do not apply to this supplied pack.

## Design and geometry

Village has ten furnished interiors; horror and cyberpunk six each. Supplied object sprites replace former tiled building faces and small tree tiles. Theme recolors and neon details adapt the same pack. Every room centre, Seat and Task marker is flood-fill reachable; exact Seat/Task destinations clear obstacles with the 14px foot radius. All three maps retain their 7680×4320 dimensions. The published village has 2,463 collision rectangles and twenty Task destinations.

Tiled tile ranges do not overlap; every referenced sheet exists and all animation frame IDs/durations are valid. Village has 2,042 animated scenery objects, horror 2,416 and cyberpunk 622. Animated footprints are fixed; scenery cannot move server obstacles or widen authorized views. Phaser culls off-camera sprites from animation updates. Preview animation is capped at twenty frames per second and draws only visible objects.

## Checks

- `./mvnw test`: 128 tests, zero failures/errors. Six new WebSocket-boundary situations walk Players into each district interior and check actual recipient Vision and Hearing before/after entry. Existing four interior, recovery, Task, movement and privacy tests continue to pass.
- Frontend: 103 tests pass, typecheck passes, production build passes. Vite retains its existing large-bundle warning.
- Generator connectivity/clearance and exported tileset/reference checks pass for all themes.
- Browser preview inspected the village Inn, horror infirmary and cyberpunk repair bay, with direct interior navigation. The game joined a Room, entered Solo Practice Day and accepted movement using the supplied artwork. Asset-driven hot reload restored the same practice Membership. Final game console inspection returned no warnings/errors.
- Reduced-motion was enabled through Settings: two stationary captures were pixel-identical. It was restored to its original disabled state; live captures changed again. This verifies pause/resume behavior, not a formal frame-rate or performance benchmark.
- The preview backend was restarted with the published geometry. All old in-memory preview Rooms were consequently reset.

Screenshots: [Horror infirmary](assets/2026-10-05-horror-infirmary.png), [Village Inn](assets/2026-10-05-village-inn.png), [Live village Day](assets/2026-10-05-supplied-art-day.png).

Horror and cyberpunk remain editable alternatives. This work does not add runtime theme selection, prove ten-Player travel balance or verify audible voice delivery.
