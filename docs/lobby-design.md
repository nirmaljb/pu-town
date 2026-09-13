# Lobby design

Status: individual decisions confirmed; awaiting final shared-understanding confirmation. These decisions describe planned behavior, not the current implementation.

## Confirmed decisions

- A Lobby is the waiting phase of a Room. Its scene depicts the Meeting Area inside the Town Hall, with ten chairs arranged in a circle.
- Room capacity increases from eight to ten Players. For the current testing version, the Host's Start Game button is enabled regardless of occupancy or readiness, including for a solo Host. Starting must actually succeed under these conditions; this supersedes the original ten-Player start gate. Readiness remains visible but does not block Start Game.
- The Host initially is the Player who created the Room. Only the Host can start the game; other Players see “Waiting for the Host to start.”
- If the Host leaves or disconnects, the longest-present remaining Player becomes Host. A returning former Host joins as an ordinary Player.
- Joining immediately seats the Player's Avatar, clockwise in join order. Movement is disabled during the Lobby. Each seat shows the occupying Player's Display Name and colour.
- Departures leave empty chairs without moving other Players. New arrivals, including reconnecting Players, take the first empty chair clockwise.
- Every Player, including the Host, starts Not Ready and can toggle Ready / Not Ready in the Lobby. Each occupied chair shows its Player's readiness. Rejoining resets that Player to Not Ready.
- Start Game transitions all Players into the existing playable world.
- After Start Game, arrivals and reconnecting Players enter the playable world whenever capacity permits. Entry is not restricted to the original participants.
- When a started Room becomes empty, it resets to the Lobby. The next arrival becomes Host. The existing five-minute empty-Room expiry still applies.
- The Meeting Area uses a top-down pixel-art wooden interior matching the existing characters. Ten chairs face inward around an open centre; Display Names, Player Colours, and readiness indicators remain legible.
- Controls around the scene show the Room Code, occupancy, Ready, Host-only Start Game, and Leave.
- This feature builds the Lobby and prepares the Meeting Area for later reuse. Full Town Hall exploration, day progression, and morning-meeting gameplay are future work.

## Acceptance criteria

- Creation enters the Lobby with its creator seated as Host and Not Ready. Joining fills chairs clockwise without moving existing occupants.
- Ten Players can join with distinct colours; an eleventh is rejected while the Room is full.
- Seated Players cannot move, and all clients agree on seating, Host, and readiness.
- Ready can be toggled and observed by other Players. It does not gate starting in this testing version.
- Only the current Host can start. A solo Host and a Host with unready Players can both start successfully, moving all current Players to the existing playable world.
- Host departure promotes the longest-present remaining Player. A returning Player receives a new membership and follows the current Room phase.
- Departures preserve other Players' seats; new Lobby arrivals fill the first empty chair clockwise.
- Joins after Start enter the playable world if capacity permits. An emptied Room returns to the Lobby and remains subject to its existing expiry.
- Verify frontend and backend suites and exercise creation, joining, seating, readiness, starting, Host succession, Leave, and Reconnect with multiple clients. Verify ten-Player capacity separately.

## Deferred work

The testing override is the current behavior. A production start gate, full Town Hall exploration, day progression, and morning-meeting rules require later design work.

## Existing constraints

Disconnect ends Room Membership. Reconnect currently creates a new Player ID and membership; Display Names are not unique identities. Rooms currently support eight distinct Player Colours, so ten Players also require two more colours. Room transitions are server-authoritative and serialized, and clients apply network events at game-frame boundaries.
