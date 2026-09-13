# Town Hall Lobby with seating, readiness, and Host-controlled start

## Problem Statement

Players currently enter the playable world immediately after creating or joining a Room. They have no shared waiting area in which to see the group assemble, signal readiness, or let a Host start the game together. Rooms also currently support only eight Players, while the intended group size is ten.

## Solution

Introduce a Lobby phase inside each Room, presented as the Town Hall's Meeting Area: a top-down pixel-art wooden interior with ten inward-facing chairs arranged in a circle around an open centre. Joining immediately seats each Player's Avatar. Players remain seated, see one another's Display Names, colours, and readiness, and can toggle Ready while waiting.

The Host starts the game for everyone, transitioning the Room into the existing playable world. For the current testing version, Start Game is enabled for the Host regardless of Player count or readiness, including a solo Host. Ten is the capacity limit, not a start requirement in this version.

## User Stories

1. As a Player, I want creating a Room to place me in its Lobby, so that I can gather a group before play begins.
2. As a Player, I want joining a waiting Room to show its Meeting Area, so that I share the same waiting experience as the other Players.
3. As a Player, I want a wooden pixel-art interior matching the existing characters, so that the Lobby feels part of the game world.
4. As a Player, I want ten inward-facing chairs arranged around an open centre, so that the group appears gathered for a meeting.
5. As a Player, I want my Avatar seated immediately when I join, so that I do not need to navigate to an available chair.
6. As a Player, I want arrivals seated clockwise, so that the seating order is predictable.
7. As a Player, I want seated Avatars to remain in place while waiting, so that the meeting arrangement stays clear.
8. As a Player, I want each occupied chair to show a legible Display Name and Player Colour, so that I can distinguish participants even when names or appearances repeat.
9. As a Player, I want to see the Room Code and current occupancy, so that I know which Room I am in and how many Players have joined.
10. As a Player, I want the Room to hold ten Players with distinct colours, so that the intended group can participate together.
11. As a joining Player, I want a full Room to reject my Join explicitly, so that I understand why I cannot enter.
12. As a Player, I want to begin Not Ready, so that joining does not declare readiness on my behalf.
13. As a Player, I want to toggle Ready and Not Ready, so that I can communicate whether I am prepared to start.
14. As a Player, I want to see readiness beside each occupied chair, so that I can understand the group's preparation.
15. As a Host, I want the same readiness controls as other Players, so that I can communicate my own preparation.
16. As a Room creator, I want to become its initial Host, so that responsibility for starting is clear.
17. As a Host, I want Start Game to launch the game for all current Players, so that we enter play together.
18. As a Host testing the game alone, I want Start Game enabled and functional, so that I can test without gathering ten Players.
19. As a Host testing with a group, I want to start even if some Players are Not Ready, so that readiness does not block testing.
20. As a non-Host Player, I want to see “Waiting for the Host to start,” so that I understand who controls the transition.
21. As a Player, I want unauthorized start attempts to leave the Room unchanged, so that only the current Host can start the game.
22. As a Player, I want a Leave control in the Lobby, so that I can intentionally exit without automatically rejoining.
23. As a remaining Player, I want departures to leave an empty chair without shifting my seat, so that the arrangement remains stable.
24. As a newly arriving Player, I want the first empty chair clockwise, so that vacancies can be filled predictably.
25. As a remaining Player, I want the longest-present Player to become Host when the Host leaves or disconnects, so that the group can continue.
26. As a returning former Host, I want to join under the current Host, so that reconnecting does not displace their authority.
27. As a reconnecting Player entering a Lobby, I want to receive its current state and an available chair as Not Ready, so that I can rejoin the group consistently.
28. As a Player entering a started Room, I want to enter the playable world when capacity permits, so that I can join ongoing play.
29. As a reconnecting Player entering a started Room, I want to return to the playable world when capacity permits, so that connection loss does not require a new game.
30. As a Player returning to a Room that became empty, I want a fresh Lobby and to become Host if I am its first arrival, so that a new group can assemble.
31. As a Player, I want the existing empty-Room expiry to remain in effect, so that a still-valid code works consistently and an expired one reports Room not found.
32. As a Player, I want everyone to agree on the Room phase, seating, Host, and readiness, so that the Lobby remains coherent during simultaneous joins and departures.

## Implementation Decisions

- Model Lobby and active play as phases of the existing Room. A Lobby is not a separate Room or a replacement for Room Code. Meeting Area names the physical location; Lobby names the waiting phase.
- Extend authoritative Room and Player state to represent phase, Host, occupied seats, and readiness. The server owns assignments and transitions; clients render confirmed state.
- Increase capacity from eight to ten and extend the existing palette with two additional distinct Player Colours. Preserve Avatar Preset behavior and the distinction between appearance and identity.
- Assign seats in clockwise order, taking the first empty chair when vacancies exist. Do not compact occupied seats after departures.
- Disable local movement during the Lobby and enforce stationary seating on the server. Preserve existing client-computed, server-validated movement during active play.
- Every new Lobby membership begins Not Ready, including the Host. Readiness changes affect only the requesting Player and are shared with the Room.
- The Room creator becomes Host. Host departure promotes the longest-present remaining Player. A reconnecting Player has a new membership and does not reclaim former Host privileges.
- Restrict Start Game to the current Host in the Lobby. The current testing behavior deliberately permits starting with one through ten Players regardless of readiness. The server must accept this behavior as well as the interface enabling it.
- Start Game transitions current members into the existing playable world. Preserve its existing movement rules. Process Start and membership changes through the existing per-room serialization so that racing requests have one authoritative ordering.
- After Start, both newcomers and reconnecting Players may join active play if capacity permits. Do not attempt to recognize returning participants by Display Name.
- An empty started Room resets to the Lobby. Its next arrival becomes Host. Preserve the five-minute empty-Room expiry, explicit Room creation, and server-restart lifetime behavior.
- Extend the versioned WebSocket contract to carry phase, Host, seats, and readiness in snapshots and relevant updates, and to support readiness and start requests. Synchronize server DTOs and strict decoding, client message builders and decoding, and protocol documentation. Exact message names and fields are implementation work; none were settled during the design discussion.
- Preserve rejection of unknown fields, unsupported versions, malformed requests, invalid movement, and unauthorized operations. Prevent requests from affecting unrelated Rooms or other Players' readiness.
- Apply all inbound Lobby state through the existing network inbox and game-frame boundary before reconciling Avatars and controls. Preserve bounded asynchronous outbound queues and avoid socket writes while holding Room locks.
- Extend the scene and surrounding interface with the Meeting Area, seat rendering, readiness indicators, Room Code, occupancy, Ready, Host-only Start Game, and Leave. Preserve the existing entry and reconnect interfaces and acknowledged Leave behavior.
- Keep the glossary implementation-free; update the protocol and human-facing documentation when implementation lands. This specification describes planned behavior, not an already implemented feature.

## Testing Decisions

The following existing seams were confirmed during specification review.

- Prefer behavioral tests at existing public boundaries. Assert accepted requests, emitted messages, state visible to clients, and rendered interactions; avoid tests of private collections, helper calls, or rendering implementation details.
- Use the existing WebSocket handler test boundary as the primary automated seam for multiplayer rules. Prior art already connects recording WebSocket sessions, sends protocol messages, asserts snapshots and broadcasts, and controls clocks and Player IDs. Exercise the Room lifecycle through that boundary rather than introducing a separate low-level suite for every new property.
- Cover ten successful memberships and rejection of the eleventh, distinct colours, clockwise assignment and vacancy reuse, initial and toggled readiness, Host succession on Leave and Disconnect, and rejection of non-Host starts and Lobby movement.
- Cover successful solo and unready-group starts, consistent phase transitions for all members, competing Start/departure orderings, joins into active play, reconnecting as a new membership, reset after the final departure, and existing expiry semantics. Ensure a returning former Host does not displace a current Host.
- Extend existing client protocol, frame-boundary, and reconnection tests where they cover behavior the server seam cannot prove. Prior art uses strict decoder assertions, an inbox drained at frame start, fake sockets, and controlled time. Verify new contract validation, ordered Lobby updates, frozen Lobby movement, and rejoining into the phase provided by the server.
- Run the full frontend tests, typecheck, and build and the full backend test suite because this change crosses the protocol and runtime boundary.
- Start both processes, verify health, and use at least two browser clients to exercise Join, Ready, Start, Leave, Host succession, and Reconnect. Inspect chair occupancy, names, colours, readiness indicators, and controls for legibility and consistent state. Verify ten-Player capacity separately through the primary automated seam; do not claim that a two-browser check proves full-capacity behavior.

## Out of Scope

- Full Town Hall exploration or integration into a larger town map.
- Morning-meeting gameplay, day progression, or a recurring meeting schedule.
- A production start gate requiring ten Players or all Players to be Ready.
- Countdown behavior, walk-to-seat animation, or free movement in the Lobby.
- Persistent Player identity, reserved reconnect seats, or admission restricted to the original participants.
- Host moderation powers, invitations requiring approval, spectators, or matchmaking.
- New game rules beyond transitioning into the existing playable world.
- Production hosting, persistence, authentication, or coordination across server instances.

## Further Notes

- The later explicit testing instruction supersedes the original disabled-until-ten requirement. Ready is an informational declaration in this version and must not silently become a start prerequisite.
- The Meeting Area is intended for reuse by future morning meetings, but this work does not implement those meetings.
- Product decisions were accepted during the design discussion. This document is the issue-ready synthesis requested afterward; it does not authorize additional feature scope.
- Publication is pending repository issue-tracker setup. The repository has a GitHub remote, but no issue-tracker configuration or configured triage vocabulary was found. The to-spec skill requires running `/setup-matt-pocock-skills` when that information is absent. Once configured, publish with the `ready-for-agent` label.
