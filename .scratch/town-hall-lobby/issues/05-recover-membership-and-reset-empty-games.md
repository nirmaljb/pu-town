# 05: Recover Lobby membership and reset empty games

**What to build:** Connection recovery brings a Player into the Room's current phase with the correct current membership state. When everyone leaves a started Room, it returns to the Lobby so the next group can assemble under a new Host while the existing Room expiry remains intact.

**Blocked by:** 02 — Gather ten Players in the Town Hall Meeting Area; 03 — Show and toggle Player readiness; 04 — Transfer Host responsibility on departure.

**Status:** ready-for-agent

- [ ] Reconnect into a waiting Room receives a new Player ID and membership, the first empty chair clockwise, and Not Ready. Existing Players retain their seats, readiness, and current Host ownership.
- [ ] A returning former Host cannot reclaim control from the current Host. Continue existing new-membership colour and Avatar Preset assignment; do not identify Players by Display Name.
- [ ] Reconnect into a started Room enters the playable world if capacity permits, including when the Room started while the Player was disconnected. Newcomers have the same capacity-based admission rule.
- [ ] On the final departure from a started Room, reset it to the Lobby with no Host or occupied seats and no retained readiness. Its next successful arrival becomes Host and is seated Not Ready.
- [ ] Preserve five-minute empty-Room expiry measured from the final departure. Joining an expired Room still fails explicitly, and reconnect never silently creates a replacement Room.
- [ ] Preserve capacity errors, connection-loss freezing, bounded reconnection attempts, retry behavior, and acknowledged Leave without automatic rejoin. Intentional Leave and Disconnect remain distinct transitions.
- [ ] Room reset, Join, and expiry share the existing authoritative serialization. Rejoining clients apply confirmed phase, Host, seats, and readiness through the normal inbox and game-frame boundary before enabling the relevant controls or movement.
- [ ] Extend the existing WebSocket handler tests with active-to-empty-to-Lobby reuse, expiry, new Host assignment, membership reset, and phase-aware rejoining. Extend the existing fake-socket and controlled-time reconnection tests to verify client recovery into both phases and failure on full or expired Rooms.
- [ ] Synchronize protocol and human-facing documentation with the final lifecycle. Run frontend tests, typecheck, and build and backend tests.
- [ ] Verify health and use multiple browser clients to exercise disconnect and rejoin in both phases, Start during another Player's disconnect, former-Host return, intentional Leave, and final-departure reset followed by Join using the same still-valid Room Code.

Persistent identities, reserved seats, admission restricted to the original group, day progression, and morning meetings remain out of scope. Start continues to bypass occupancy and readiness gates for testing.
