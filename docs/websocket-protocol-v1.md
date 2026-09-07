# WebSocket protocol version 1

All messages are JSON objects with `version: 1` and an exact, message-specific set of fields. Unknown fields, unknown message types, malformed values, and unsupported versions receive an `error` message.

## Client to server

| Type | Additional fields |
| --- | --- |
| `create_room` | `displayName: string` |
| `ping` | none |
| `join_room` | `roomId: string`, `displayName: string` |
| `leave_room` | none |
| `move_player` | `x: number`, `y: number` |

## Server to client

| Type | Additional fields |
| --- | --- |
| `pong` | none |
| `room_snapshot` | `selfPlayerId: string`, `roomId: string`, `players: PlayerView[]` |
| `player_joined` | `player: PlayerView` |
| `player_moved` | `playerId: string`, `x: number`, `y: number` |
| `player_left` | `playerId: string`, `reason: "left" \| "disconnected"` |
| `room_left` | `roomId: string` |
| `error` | `code: string`, `message: string` |

`PlayerView` contains exactly `playerId`, `displayName`, `colour`, `x`, and `y`. `colour` is an uppercase six-digit hex colour prefixed by `#`.

The server issues a new Player ID for every WebSocket connection. A successful join places the player at `(640, 360)` in a `1280 × 720` room. Movement must remain within those bounds and may cover at most `240` units per second since the last accepted position, plus `32` units of network tolerance.

Current error codes are `malformed_message`, `unsupported_version`, `unknown_message_type`, `not_in_room`, `invalid_movement`, `room_not_found`, and `room_full`.


## Entry and Room lifetime

Only `create_room` creates a Room. It generates a collision-checked code from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, six characters long. The `roomId` wire field carries this Room Code. Both creation and joining return `room_snapshot` on success. Join trims and uppercases its code; unknown or expired codes return `room_not_found` (“Room not found”). Names are trimmed and must contain 1–24 Unicode code points; duplicate names are allowed.

Rooms allow at most eight current memberships; further joins return `room_full` (“Room is full”). Failed transitions preserve any existing membership. Colours are assigned from `#4F8CFF`, `#FF8066`, `#FFD166`, `#65D6A4`, `#C792EA`, `#56DDE0`, `#F48FB1`, and `#D6D3C4`, without duplicates in a Room. Disconnect and Leave release a slot and colour.

Empty Rooms expire five minutes after the last departure. Join checks expiry synchronously; a periodic sweep removes unused expired Rooms. Restart clears all Rooms. Reconnect uses `join_room`, never `create_room`, and can fail because of expiry or capacity.

## Heartbeat and client deadlines

`ping` receives `pong`, including before membership. The client sends a heartbeat every five seconds while playing and freezes after ten seconds without a heartbeat response (`pong`). Initial Create/Join has a ten-second deadline. Reconnection has a thirty-second total deadline and ten-second per-connection attempt limit, with a 500 ms retry delay. No movement is submitted until a Room Snapshot confirms membership. Cancellation invalidates the connection and ignores its later events.

Leave freezes movement immediately. `room_left` acknowledges it; if the connection ends or acknowledgment times out after ten seconds, the client closes it and returns to entry without reconnecting.

These changes extend protocol v1 for the coordinated local client/server release; older clients lacking Player Colour decoding must be updated together with the server.
