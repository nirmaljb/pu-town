# WebSocket protocol version 1

All messages are JSON objects with `version: 1` and an exact, message-specific set of fields. Unknown fields, unknown message types, malformed values, and unsupported versions receive an `error` message.

## Client to server

| Type | Additional fields |
| --- | --- |
| `join_room` | `roomId: string`, `displayName: string` |
| `leave_room` | none |
| `move_player` | `x: number`, `y: number` |

## Server to client

| Type | Additional fields |
| --- | --- |
| `room_snapshot` | `selfPlayerId: string`, `roomId: string`, `players: PlayerView[]` |
| `player_joined` | `player: PlayerView` |
| `player_moved` | `playerId: string`, `x: number`, `y: number` |
| `player_left` | `playerId: string`, `reason: "left" \| "disconnected"` |
| `room_left` | `roomId: string` |
| `error` | `code: string`, `message: string` |

`PlayerView` contains exactly `playerId`, `displayName`, `x`, and `y`.

The server issues a new Player ID for every WebSocket connection. A successful join places the player at `(640, 360)` in a `1280 × 720` room. Movement must remain within those bounds and may cover at most `240` units per second since the last accepted position, plus `32` units of network tolerance.

Current error codes are `malformed_message`, `unsupported_version`, `unknown_message_type`, `not_in_room`, and `invalid_movement`.
