# 01: Enter a Lobby and start play as Host

**What to build:** Creating or joining a waiting Room enters a basic shared Lobby instead of immediately enabling play. The creator is Host and can start the game for everyone, including when alone. Starting opens the existing playable world, and subsequent arrivals enter active play. This first slice establishes a usable waiting-to-play flow; the furnished ten-seat Meeting Area follows separately.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Create Room enters the Lobby and identifies its creator as Host. Join Room enters the Room's current phase, as confirmed by the server.
- [ ] The Host sees an enabled, functional Start Game control even when alone. Other Players see “Waiting for the Host to start.” Only the current Host can start a waiting Room.
- [ ] Start Game moves all current Players into the existing playable world. Joining a started Room enters active play when capacity permits.
- [ ] Lobby movement is disabled locally and rejected by the server. Active play retains existing client-computed, server-validated movement.
- [ ] Start and membership changes are serialized per Room. Repeated or unauthorized Start requests cannot reset an active game or affect another Room.
- [ ] Room Code and Leave remain available. Preserve acknowledged Leave, entry deadlines, and connection-loss freezing.
- [ ] Synchronize authoritative phase and Host state with the strict versioned client/server contract and protocol documentation. Apply inbound changes through the inbox at game-frame boundaries; preserve bounded asynchronous outbound delivery without socket writes under Room locks.
- [ ] Test observable requests and responses through the existing WebSocket handler boundary, including solo Start, non-Host rejection, shared transitions, late Join, and relevant Start/departure orderings. Extend existing protocol, frame-boundary, and reconnection tests where client-specific behavior requires it.
- [ ] Run frontend tests, typecheck, and build and backend tests. Start both processes, verify health, and exercise Create, Join, Start, movement, and Leave with two browser clients.

The current testing behavior intentionally has no minimum occupancy or readiness gate. Do not introduce a countdown or production start gate. This ticket retains the current capacity; the next seating slice raises it to ten. Host succession and empty-game reset are later slices.
