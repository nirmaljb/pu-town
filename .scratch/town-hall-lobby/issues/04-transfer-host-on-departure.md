# 04: Transfer Host responsibility on departure

**What to build:** A Room remains usable when its Host leaves or disconnects. The longest-present remaining Player becomes Host, sees the appropriate controls, and can start the waiting group. A returning former Host does not displace the current Host.

**Blocked by:** 01 — Enter a Lobby and start play as Host.

**Status:** ready-for-agent

- [ ] An acknowledged Host Leave or Host Disconnect promotes the longest-present remaining Player by current Room Membership order.
- [ ] All clients agree on the new Host. In the Lobby, the promoted Player receives enabled Start Game controls and other Players see the waiting message.
- [ ] Start authorization follows current Host ownership on the server. Requests from a departed or former Host cannot override the successor.
- [ ] A returning former Host receives a new membership and joins as an ordinary Player while a current Host remains. Duplicate Display Names do not confer Host authority.
- [ ] Non-Host departure leaves Host ownership unchanged. Host succession does not reset the Room phase or other membership state.
- [ ] Serialize departure, promotion, and Start with other Room transitions so racing requests have a consistent authoritative order. Keep clients synchronized through the strict contract and frame-boundary path.
- [ ] Extend existing WebSocket handler tests for Leave, Disconnect, longest-present succession, multiple departures, former-Host return, non-Host departure, and competing Start requests. Test emitted behavior rather than private membership collections.
- [ ] Update protocol and human-facing documentation for Host succession. Run frontend tests, typecheck, and build and backend tests.
- [ ] Verify health and exercise Host Leave, Host Disconnect, promotion, and Start in multiple browser clients. Confirm that the returning former Host cannot start instead of the current Host.

This slice depends only on the phase-and-Host foundation; seating and Ready are not prerequisites. Preserve those features if already present. Empty started-Room reset is handled by ticket 05.
