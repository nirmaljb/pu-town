---
status: accepted
---

# Use local Developer Rooms for Game testing

Developer Mode uses actual Room Players and the server-owned Game engine, with explicit testing commands and separately authorized inspection, rather than a client-only simulation. This supports simulated Players and real browser clients exercising the same transitions and private views, at the cost of extending membership, Game reset, timer and Task rules. It remains explicitly enabled and restricted to local access; public/Tailscale deployment does not expose its commands or inspector.

Only Developer Rooms permit adding Players after Start, resetting a scenario or returning to the Lobby, overriding phase progression and victory, changing Roles, and pausing timed gameplay. These are scoped exceptions to ADR 0009 and ADR 0014, not changes to ordinary Rooms. The developer controller may inspect hidden state through a separate authorized view; ordinary Player messages remain recipient-specific. Simulated Players alone cannot keep an abandoned Developer Room alive. Retain Room serialization, strict protocol decoding, ordered outbound delivery and frame-boundary client application for all modes.

The developer-selected settings initially retain normal gameplay rules; bypasses are individual controls. Solo Practice remains available for lightweight exploration. The implementation request confirms this design. Controller authority is independent of Host succession and remains reserved through the full recovery window. A local handshake must have a loopback peer, local request authority and local browser Origin, with no forwarding headers; this prevents the public proxy from acquiring developer authority through its loopback connection. Pause shifts gameplay deadlines only, leaving connection reservation deadlines untouched. Reset replaces Game state while retaining current Room Memberships; removed memberships are never resurrected.
