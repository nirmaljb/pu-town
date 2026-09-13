# WebSocket protocol version 1

All messages are JSON objects with `version: 1` and an exact, message-specific set of fields. Unknown fields, unknown message types, malformed values, and unsupported versions receive an `error` message.

## Client to server

| Type | Additional fields |
| --- | --- |
| `create_room` | `displayName: string` |
| `ping` | none |
| `join_room` | `roomId: string`, `displayName: string` |
| `leave_room` | none |
| `start_game` | none |
| `set_ready` | `ready: boolean` |
| `move_player` | `x: number`, `y: number` |

## Server to client

| Type | Additional fields |
| --- | --- |
| `pong` | none |
| `room_snapshot` | `selfPlayerId: string`, `roomId: string`, `phase: "lobby" \| "playing"`, `hostPlayerId: string`, `players: PlayerView[]` |
| `room_state` | `phase: "lobby" \| "playing"`, `hostPlayerId: string`, `players: PlayerView[]` |
| `player_joined` | `player: PlayerView` |
| `player_moved` | `playerId: string`, `x: number`, `y: number` |
| `player_left` | `playerId: string`, `reason: "left" \| "disconnected"` |
| `room_left` | `roomId: string` |
| `error` | `code: string`, `message: string` |

`PlayerView` contains exactly `playerId`, `displayName`, `colour`, `avatarPreset`, `seat`, `ready`, `x`, and `y`. `colour` is an uppercase six-digit hex colour prefixed by `#`. `avatarPreset` is one of `townsperson-1`, `townsperson-2`, `townsperson-3`, `townsperson-4`, `townsperson-5`, or `townsperson-6`.

`seat` is an integer from 0 through 9 in a Lobby and `null` during active play. `ready` is a boolean.

The server randomly assigns an Avatar Preset when a new Room Membership begins, including Create Room and Reconnect. Duplicates are allowed. The assignment remains unchanged during movement, repeated Join to the same Room, and failed room switches. Room Snapshots and join announcements carry the same assignment to all observers. A new membership draws again and may receive the same preset. Player Colour remains the distinct marker underneath the character.

Clients infer walking and facing from position changes at game-frame boundaries. Local animation stops when movement stops; remote animation stops after 150 ms without a position change. Standing retains the last direction; new active-play Avatars face down. Seated Lobby Avatars face inward according to their assigned seat. No facing or animation fields are accepted in movement messages. Positions mark the Avatar's feet; existing room bounds are unchanged, so artwork may clip at the edges.

The server issues a new Player ID for every WebSocket connection. A successful Join to active play places the Player at `(640, 360)` in a `1280 × 720` Room; Lobby membership uses the assigned chair position below. Movement must remain within those bounds and may cover at most `240` units per second since the last accepted position, plus `32` units of network tolerance.

Current error codes are `malformed_message`, `unsupported_version`, `unknown_message_type`, `not_in_room`, `invalid_movement`, `room_not_found`, `room_full`, `not_host`, and `invalid_phase`.


## Entry and Room lifetime

Only `create_room` creates a Room. It generates a collision-checked code from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, six characters long. The `roomId` wire field carries this Room Code. Both creation and joining return `room_snapshot` on success. Join trims and uppercases its code; unknown or expired codes return `room_not_found` (“Room not found”). Names are trimmed and must contain 1–24 Unicode code points; duplicate names are allowed.

Rooms allow at most ten current memberships; further joins return `room_full` (“Room is full”). Failed transitions preserve any existing membership. Colours are assigned from `#4F8CFF`, `#FF8066`, `#FFD166`, `#65D6A4`, `#C792EA`, `#56DDE0`, `#F48FB1`, `#D6D3C4`, `#F29F38`, and `#A5CF45`, without duplicates in a Room. Disconnect and Leave release a slot and colour.

Empty Rooms expire five minutes after the last departure. Join checks expiry synchronously; a periodic sweep removes unused expired Rooms. Restart clears all Rooms. Reconnect uses `join_room`, never `create_room`, and can fail because of expiry or capacity.

## Heartbeat and client deadlines

`ping` receives `pong`, including before membership. The client sends a heartbeat every five seconds during confirmed membership in either phase and freezes after ten seconds without a heartbeat response (`pong`). Initial Create/Join has a ten-second deadline. Reconnection has a thirty-second total deadline and ten-second per-connection attempt limit, with a 500 ms retry delay. No movement is submitted until a Room Snapshot confirms membership. Cancellation invalidates the connection and ignores its later events.

Leave freezes movement immediately. `room_left` acknowledges it; if the connection ends or acknowledgment times out after ten seconds, the client closes it and returns to entry without reconnecting.

## Lobby, seating and Start

Creation enters `lobby`; the first membership is Host. Each new Lobby membership starts Not Ready and takes the first vacant seat, without moving remaining occupants. Seat 0 is north and seats 1–9 run clockwise. Feet positions are `x = round(640 + 390 sin(seat π / 5))`, `y = round(382 - 205 cos(seat π / 5))`. All Lobby movement requests receive `invalid_movement`.

`set_ready` declares only the requesting Player's readiness; it accepts no Player ID or Room Code. It returns `not_in_room` before membership or `invalid_phase` in active play. Accepted declarations broadcast `room_state` to all current members.

Only the current Host can `start_game` in the Lobby. There is deliberately no occupancy or readiness gate: one through ten Players can start, even all Not Ready. Non-Hosts receive `not_host`, unjoined connections receive `not_in_room`, and a Host attempting to restart active play receives `invalid_phase`. Start atomically changes phase to `playing`, clears seat assignments, places all current Players at the active spawn, resets their movement-validation clocks, and broadcasts `room_state`. Readiness remains informational membership state but cannot change during active play.

On Host Leave or Disconnect, the longest-present remaining membership becomes Host. The ordered `player_left` announcement is followed by `room_state` carrying the successor and complete current Player Views. Other departures emit only `player_left`. A returning former Host receives a new membership and cannot displace the current Host; duplicate Display Names confer no authority.

`room_state` replaces the current shared phase, Host and Player Views, preserving the recipient's Room Code and self Player ID. It is a structural, non-coalesced event, not a new membership confirmation. Movement coalescing never crosses a structural event. Clients apply these updates through the inbox at frame boundaries before rendering controls or moving Avatars.

Arrivals and reconnecting Players follow the phase in their Room Snapshot. Active Rooms accept them subject to the same ten-Player capacity. Lobby returns receive a new Player ID, available seat and Not Ready, with fresh colour/preset assignment as for any new membership. After the final departure the Room resets to an empty Lobby with no Host, occupied seats or retained readiness; its next arrival becomes Host. The five-minute expiry still runs from that final departure, and Reconnect never creates a replacement Room.

These changes extend protocol v1 for the coordinated local client/server release; older clients lacking phase, Host, seat or readiness decoding must be updated together with the server.
