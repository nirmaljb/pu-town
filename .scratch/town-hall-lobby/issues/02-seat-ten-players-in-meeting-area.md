# 02: Gather ten Players in the Town Hall Meeting Area

**What to build:** Players gather in a top-down wooden pixel-art Meeting Area with ten inward-facing chairs around an open centre. Joining immediately seats each Avatar clockwise. Players can identify the group, see remaining capacity, and stay in their assigned chairs until the game starts or they depart.

**Blocked by:** 01 — Enter a Lobby and start play as Host.

**Status:** ready-for-agent

- [ ] Replace the basic Lobby presentation with a wooden pixel-art interior matching the existing characters, ten inward-facing chairs, and an open centre. Avatars visibly occupy their chairs immediately, without a walk-to-seat animation.
- [ ] Increase Room capacity to ten in both Lobby and active play. Provide ten distinct Player Colours while preserving existing Avatar Preset behavior. An eleventh Join returns an explicit Room-full error.
- [ ] The server assigns each new Lobby membership the first empty chair clockwise. All observers, including new arrivals, agree on occupied seats.
- [ ] Leave and Disconnect free the departing Player's chair without shifting other occupants. The next arrival fills the first empty chair clockwise.
- [ ] Lobby Avatars remain stationary. Each occupied chair has a legible Display Name and Player Colour, including when names or presets repeat.
- [ ] Show Room Code, current occupancy out of ten, Host-only Start Game, and Leave around the scene. Preserve the enabled Start behavior for a solo Host and partial groups.
- [ ] Carry seating through the strict versioned contract and confirmed state, applying changes at game-frame boundaries. Update protocol and human-facing documentation to describe ten-Player capacity and seating.
- [ ] Use the existing WebSocket handler seam to verify ten memberships, eleventh rejection, distinct colours, deterministic seating, vacancy reuse, and stationary seating. Extend client decoding and frame-boundary tests for observable seating updates.
- [ ] Run frontend tests, typecheck, and build and backend tests. Verify health and use two browser clients to inspect seating, legibility, occupancy, departure, vacancy reuse, and transition into active play. Verify full capacity with the automated multiplayer seam rather than claiming the two-browser check proves it.

Full Town Hall exploration and morning-meeting gameplay remain out of scope. Ready indicators are delivered by the next ticket.
