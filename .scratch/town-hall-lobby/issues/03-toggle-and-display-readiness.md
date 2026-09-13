# 03: Show and toggle Player readiness

**What to build:** Every seated Player, including the Host, can declare Ready or Not Ready and see the same readiness indicators beside occupied chairs. Readiness communicates preparation while remaining independent of starting during the current testing version.

**Blocked by:** 02 — Gather ten Players in the Town Hall Meeting Area.

**Status:** ready-for-agent

- [ ] Every new Lobby membership begins Not Ready, including the Host's membership. Initial snapshots show the current readiness of all occupants.
- [ ] A Player can toggle Ready and Not Ready using a visible control, and every observer sees the resulting indicator beside that Player's chair.
- [ ] The server authorizes readiness changes for the requesting Player's own current Lobby membership. Invalid requests cannot change another Player, another Room, or an active game's state.
- [ ] The Host's Start Game control stays enabled and functional regardless of readiness or occupancy. A solo Not Ready Host and a group containing Not Ready Players can both start.
- [ ] Readiness controls belong to the Lobby and no longer offer Lobby readiness changes after Start.
- [ ] Readiness is membership state, not a property of Display Name or persistent identity. A new membership starts Not Ready even if its name matches a departed Player.
- [ ] Extend strict client/server messages and protocol documentation together. Process shared readiness changes at game-frame boundaries and preserve per-room ordering and bounded outbound delivery.
- [ ] Test initial readiness, toggling observed by multiple Players, authorization, new-membership reset, and successful unready starts through the existing WebSocket handler seam. Extend existing client protocol and frame-boundary tests as needed.
- [ ] Run frontend tests, typecheck, and build and backend tests. Verify health and use two browser clients to check Ready toggles, readable indicators, and Start with an unready group.

Do not implement an all-Ready gate, a ten-Player start gate, or a countdown.
