# WebSocket protocol version 1

All messages are JSON objects with `version: 1` and an exact, message-specific set of fields. Unknown fields, unknown message types, malformed values, and unsupported versions receive an `error` message.

## Client to server

| Type | Additional fields |
| --- | --- |
| `create_room` | `displayName: string` |
| `ping` | none |
| `join_room` | `roomId: string`, `displayName: string` |
| `recover_room` | `roomId: string`, `recoveryToken: string` |
| `leave_room` | none |
| `start_game` | none |
| `set_ready` | `ready: boolean` |
| `move_player` | `x: number`, `y: number`, `facing: Facing`, `sequence: integer`, `epoch: integer` |

## Server to client

| Type | Additional fields |
| --- | --- |
| `pong` | none |
| `room_snapshot` | `selfPlayerId: string`, `roomId: string`, `recoveryToken: string`, `phase: "lobby" \| "playing"`, `hostPlayerId: string`, `players: PlayerView[]` |
| `room_state` | `phase: "lobby" \| "playing"`, `hostPlayerId: string`, `players: PlayerView[]` |
| `player_joined` | `player: PlayerView` |
| `player_moved` | `playerId: string`, `x: number`, `y: number`, `facing: Facing`, `sequence: integer`, `epoch: integer` |
| `movement_correction` | `playerId: string`, `x: number`, `y: number`, `facing: Facing`, `sequence: integer`, `epoch: integer` |
| `player_left` | `playerId: string`, `reason: "left" \| "disconnected" \| "expired"` |
| `room_left` | `roomId: string` |
| `error` | `code: string`, `message: string` |

`PlayerView` contains exactly `playerId`, `displayName`, `colour`, `avatarPreset`, `seat`, `ready`, `connected`, `x`, `y`, `facing`, `sequence`, and `epoch`. `colour` is an uppercase six-digit hex colour prefixed by `#`. `avatarPreset` is one of `townsperson-1`, `townsperson-2`, `townsperson-3`, `townsperson-4`, `townsperson-5`, or `townsperson-6`.

`seat` is an integer from 0 through 9 in a Lobby and `null` during active play. `ready` and `connected` are booleans. Disconnected memberships remain in Player Views with `connected: false`; clients freeze and subdue their Avatars and show “Reconnecting…”.

The server randomly assigns an Avatar Preset when a new Room Membership begins, including Create Room and fresh Join. Recovery retains the assignment. Duplicates are allowed. The assignment remains unchanged during movement, repeated Join to the same Room, and failed room switches. Room Snapshots and join announcements carry the same assignment to all observers. A new membership draws again and may receive the same preset. Player Colour remains the distinct marker underneath the character.

`Facing` is exactly `"up"`, `"left"`, `"down"`, or `"right"`. The server retains it alongside position and sends it in Player Views and movement responses. Arrow-key input determines local Facing, even against Room bounds, with vertical preference for diagonals. Releasing input retains Facing. Remote Facing comes from shared state. Seated Lobby Avatars face inward: seat 0 down, seats 1–4 left, seat 5 up, seats 6–9 right. Start and active-play Join face down. Walking is presentation state: local animation stops when displacement stops; remote animation stops after 150 ms without position change. Positions mark Avatar feet; artwork may clip at the unchanged Room bounds.

## Movement acknowledgment and recovery

All movement counters are nonnegative JSON integers no greater than 9007199254740991. A new membership starts with `sequence: 0`, `epoch: 0`. Each submission uses a strictly increasing `sequence` (first submission 1) and the current server-issued `epoch`. Sequence numbers continue across corrections and Start; only new membership resets them. Player Views carry the last processed current-epoch submission sequence and current epoch.

Accepted `player_moved` broadcasts echo the submitted sequence and epoch with the accepted position and Facing, including updates with unchanged coordinates. The sender keeps newer local prediction when an older acknowledgment arrives. The client sends the final unsent position and Facing when input stops, including on focus loss once a frame runs.

An invalid position or Lobby movement increments the server epoch and sends a structural `movement_correction` only to the submitting Player. It carries the last accepted position and Facing, the rejected sequence, and the new epoch. The client resets position, discards outstanding prediction, retains its input-derived Facing, and submits future movement in the new epoch. A submission with a stale/future epoch or non-increasing sequence cannot change accepted state; it receives the current correction without advancing counters. Repeated corrections in an already-applied epoch do not rewind new prediction. This prevents old in-flight submissions from resurrecting rejected state. Malformed movement still receives `error`; movement before Join receives `not_in_room`.

Corrections and structural Room events are ordering barriers for movement coalescing. Only superseded movement for the same Player within a barrier-free queue segment may be replaced. If the bounded queue cannot retain a new event, the server closes that connection asynchronously, allowing Reconnect to recover a complete Room Snapshot; it never silently evicts another Player's final movement.

On blur or visibility loss the client clears held arrow controls. Restoring focus applies queued lifecycle and world events before accepting fresh input, skips input for the restoration frame, and uses existing heartbeat/Reconnect deadlines. Frame movement is capped at 50 ms, so a delayed frame cannot produce background catch-up displacement.

A newly joined connection receives a new Player ID; credential-based recovery retains the existing membership’s Player ID. A successful Join to active play places the Player at `(640, 360)` in a `1280 × 720` Room; Lobby membership uses the assigned chair position below. Movement must remain within those bounds and may cover at most `240` units per second since the last accepted position, plus `32` units of network tolerance.

Current error codes are `malformed_message`, `unsupported_version`, `unknown_message_type`, `not_in_room`, `room_not_found`, `room_full`, `not_host`, `invalid_phase`, `recovery_expired`, and `recovery_in_use`.


## Entry and Room lifetime

Only `create_room` creates a Room. It generates a collision-checked code from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, six characters long. The `roomId` wire field carries this Room Code. Both creation and joining return `room_snapshot` on success. Join trims and uppercases its code; unknown or expired codes return `room_not_found` (“Room not found”). Names are trimmed and must contain 1–24 Unicode code points; duplicate names are allowed.

Rooms allow at most ten current memberships; further joins return `room_full` (“Room is full”). Failed transitions preserve any existing membership. Colours are assigned from `#4F8CFF`, `#FF8066`, `#FFD166`, `#65D6A4`, `#C792EA`, `#56DDE0`, `#F48FB1`, `#D6D3C4`, `#F29F38`, and `#A5CF45`, without duplicates in a Room. Leave releases a slot and colour immediately. Disconnect reserves both until recovery or membership expiry.

Empty Rooms expire five minutes after the last departure. Join checks expiry synchronously; a periodic sweep removes unused expired Rooms. Restart clears all Rooms. Reconnect uses `recover_room`, never fresh Join or Create. Reserved capacity remains available to the recovering membership even in a full Room.

## Heartbeat and client deadlines

`ping` receives `pong`, including before membership. The client checks transport health on a timer independent of Phaser frames, sends a heartbeat every five seconds during confirmed membership in either phase, and freezes at the next frame boundary after ten seconds without a heartbeat response (`pong`). Returning to a visible tab or resuming a transport timer delayed beyond two of its one-second ticks permits one immediate ping with a fresh ten-second response deadline. Only a pong renews this suspension allowance; repeated visibility changes cannot indefinitely hide a failed connection, and ordinary Room traffic is not a heartbeat response. Initial Create/Join has a ten-second deadline. Reconnection has a thirty-second total deadline and ten-second per-connection attempt limit, with a 500 ms retry delay. No movement is submitted until a Room Snapshot confirms membership. Cancellation invalidates the connection and ignores its later events.

Leave freezes movement immediately. `room_left` acknowledges it; if the connection ends or acknowledgment times out after ten seconds, the client closes it and returns to entry without reconnecting.

## Lobby, seating and Start

Creation enters `lobby`; the first membership is Host. Each new Lobby membership starts Not Ready and takes the first vacant seat, without moving remaining occupants. Seat 0 is north and seats 1–9 run clockwise. Feet positions are `x = round(640 + 390 sin(seat π / 5))`, `y = round(382 - 205 cos(seat π / 5))`. Well-formed Lobby movement requests receive `movement_correction` without changing seated position or Facing.

`set_ready` declares only the requesting Player's readiness; it accepts no Player ID or Room Code. It returns `not_in_room` before membership or `invalid_phase` in active play. Accepted declarations broadcast `room_state` to all current members.

Only the current Host can `start_game` in the Lobby. There is deliberately no occupancy or readiness gate: one through ten Players can start, even all Not Ready. Non-Hosts receive `not_host`, unjoined connections receive `not_in_room`, and a Host attempting to restart active play receives `invalid_phase`. Start atomically changes phase to `playing`, clears seat assignments, places all current Players at the active spawn, resets their movement-validation clocks, and broadcasts `room_state`. Readiness remains informational membership state but cannot change during active play.

On Host Leave, the longest-present remaining membership becomes Host. For this recovery foundation, Host Disconnect still transfers immediately to the longest-present connected membership when one exists; the fifteen-second grace and complete all-disconnected Host policy follow in ticket #5. On membership end, the ordered `player_left` announcement is followed by `room_state` carrying the successor and complete current Player Views. Disconnect instead broadcasts connected presence in `room_state`. Other departures emit only `player_left`. A recovering former Host retains membership but cannot displace the current Host; duplicate Display Names confer no authority.

`room_state` replaces the current shared phase, Host and Player Views, preserving the recipient's Room Code and self Player ID. It is a structural, non-coalesced event, not a new membership confirmation. Movement coalescing never crosses a structural event. Clients apply these updates through the inbox at frame boundaries before rendering controls or moving Avatars.

Fresh arrivals and recovering Players follow the phase in their Room Snapshot. Fresh Join uses ordinary ten-Player capacity and initialization. Recovery preserves identity, appearance, colour, readiness, position and Facing, subject to subsequent Room transitions. Start includes reserved memberships. Only the end of the final membership resets the Room to an empty Lobby and starts five-minute empty-Room expiry; merely losing every connection does not reset it.

## Membership recovery foundation

Entry snapshots privately carry a 64-character lowercase hexadecimal recovery credential, generated from two random UUIDs. `recover_room` requires that credential and its Room Code; neither Player ID nor Display Name authorizes recovery. Credentials never appear in Player Views, broadcasts, or Room State. A successful recovery returns the current snapshot and the same credential. The active client currently retains it in memory; refresh persistence and active-socket takeover follow in #4.

A server-detected Disconnect reserves membership for exactly 120 seconds. Recovery is allowed strictly before the deadline; at or after it the membership ends. Expiry is checked synchronously during Join/Recover and by a one-second sweep. Failed attempts never renew the deadline. A later Disconnect after successful recovery starts a new window. Invalid or expired credentials receive `recovery_expired` (“Your place in the Room expired”); an unavailable Room receives `room_not_found`. These are terminal and never cause an implicit fresh Join. While the old connection remains active, `recovery_in_use` is retryable; takeover is follow-up work.

Disconnect and recovery broadcast structural `room_state` events carrying connected presence. Expiry broadcasts `player_left` with reason `expired`. Recovery replaces the connection binding, preserves authoritative movement counters, resets the movement-validation clock, and returns a complete snapshot. Clients discard prediction and initialize counters from that snapshot before sending movement. Retired socket callbacks cannot end the recovered membership.

The existing thirty-second automatic retry interval and explicit Retry/Back controls remain for this slice. Ticket #6 extends automatic retries throughout the reservation and adds complete expiry/Leave UX. Back cancels local recovery and forgets its credential; an unreachable reservation expires naturally. Server restart clears Rooms and all recovery state.

These changes extend protocol v1 for the coordinated local client/server release; older clients lacking Facing, movement counters/corrections, phase, Host, seat or readiness decoding must be updated together with the server.
