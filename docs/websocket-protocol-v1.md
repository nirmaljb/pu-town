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
| `select_avatar` | `avatarPreset: string` |
| `set_ready` | `ready: boolean` |
| `mafia_vote` | `round: integer`, `targetPlayerId: string` |
| `protect` | `round: integer`, `targetPlayerId: string` |
| `investigate` | `round: integer`, `targetPlayerId: string` |
| `meeting_vote` | `round: integer`, `targetPlayerId: string \| null` |
| `send_chat` | `channel: "public" \| "mafia"`, `text: string` |

## Server to client

| Type | Additional fields |
| --- | --- |
| `pong` | none |
| `room_snapshot` | `selfPlayerId: string`, `roomId: string`, `recoveryToken: string`, `phase: "lobby" \| "playing"`, `hostPlayerId: string`, `players: PlayerView[]` |
| `room_state` | `phase: "lobby" \| "playing"`, `hostPlayerId: string`, `players: PlayerView[]` |
| `player_joined` | `player: PlayerView` |
| `game_state` | `phase: GamePhase`, `round: integer`, `remainingMs: integer \| null`, `players: RosterView[]`, `outcome: Outcome \| null`, `ballots: Ballot[] \| null`, `winner: Faction \| null`, `roles: RoleView[] \| null`, `self: SelfView` |
| `chat_message` | `channel`, `round: integer`, `senderPlayerId: string`, `senderName: string`, `text: string` |
| `chat_history` | `messages: ChatEntry[]` |
| `player_left` | `playerId: string`, `reason: "left" \| "disconnected" \| "expired"` |
| `room_left` | `roomId: string` |
| `error` | `code: string`, `message: string` |

`PlayerView` contains exactly `playerId`, `displayName`, `colour`, `avatarPreset`, `seat`, `ready`, `connected`, `x`, `y`, and `facing`. `colour` is an uppercase six-digit hex colour prefixed by `#`. `avatarPreset` is an identifier in the Published Avatar Collection the Room pinned when it was created, served over HTTP by `GET /rooms/{roomCode}/avatars` (below). Identifiers match `[a-z0-9][a-z0-9-]{0,63}`; names and published order are presentation data carried with the collection, independent of identity. Membership is the server's to enforce against the Room's own collection: a client decoding a Player View checks the identifier's form only, because a Room Snapshot can arrive before that Room's collection has been fetched. Identifiers outside the Room's collection, including unpublished draft IDs, are never valid.

`seat` is an integer from 0 through 9 and is never null: a Player takes a Seat on joining the Lobby and keeps it for the whole Room, through Start and to the end of the Game. Two Players in one Room never share a Seat. `ready` and `connected` are booleans. Disconnected memberships remain in Player Views with `connected: false`; clients freeze and subdue their Avatars and show “Reconnecting…”.

The server randomly assigns an Avatar Preset when a new Room Membership begins, including Create Room and fresh Join. Recovery retains the last server-accepted selection. Duplicates are allowed. The assignment remains unchanged by repeated Join to the same Room and by failed room switches. Room Snapshots and join announcements carry the same assignment to all observers. A new membership draws again and may receive the same preset. Player Colour remains the distinct marker underneath the character.

`Facing` is exactly `"up"`, `"left"`, `"down"`, or `"right"`. The server retains it alongside position and sends it in Player Views. Seated Avatars face inward for their whole stay: seat 0 down, seats 1–4 left, seat 5 up, seats 6–9 right. Start changes neither Seat nor Facing. Positions mark Avatar feet.

## Seating instead of movement

Players never walk. A Player's `x`, `y` and `facing` are their Seat's, fixed for their whole Room Membership, so the protocol carries no movement at all: there is no `move_player`, no `player_moved`, no `movement_correction`, and no `sequence` or `epoch` counter. `x` and `y` are still sent because they are what the client draws, and the server is still their only author.

A client that sends `move_player` receives `unknown_message_type`, as it would for any other message this version does not define.

The Room's shared state is exactly its Player Views and, once the Game starts, each recipient's own `game_state`. Nothing is predicted locally.

The bounded outbound queue is strictly ordered and never replaces or evicts an event. If a slow connection cannot accept a new event, the server closes that connection asynchronously, allowing Reconnect to recover a complete Room Snapshot and the recipient's current Game state.

A newly joined connection receives a new Player ID; credential-based recovery retains the existing membership's Player ID.

Current error codes are `malformed_message`, `unsupported_version`, `unknown_message_type`, `not_in_room`, `room_not_found`, `room_full`, `not_host`, `start_blocked`, `invalid_phase`, `invalid_action`, `invalid_target`, `already_submitted`, `invalid_avatar_preset`, `recovery_expired`, and `recovery_in_use`.

## Entry and Room lifetime

Only `create_room` creates a Room. It generates a collision-checked code from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, six characters long. The `roomId` wire field carries this Room Code. Both creation and joining return `room_snapshot` on success. Join trims and uppercases its code; unknown or expired codes return `room_not_found` (“Room not found”). Names are trimmed and must contain 1–24 Unicode code points; duplicate names are allowed.

A fresh `join_room` to a started Room returns `invalid_phase` (“Game already started”), before capacity checks or ending any existing membership. Repeated Join by an existing member of that same Room remains idempotent; recovery uses `recover_room`.

Rooms allow at most ten current memberships; further joins return `room_full` (“Room is full”). Failed transitions preserve any existing membership. Colours are assigned from `#4F8CFF`, `#FF8066`, `#FFD166`, `#65D6A4`, `#C792EA`, `#56DDE0`, `#F48FB1`, `#D6D3C4`, `#F29F38`, and `#A5CF45`, without duplicates in a Room. Leave releases a slot and colour immediately. Disconnect reserves both until recovery or membership expiry.

Empty Lobbies expire five minutes after the last membership ends. A started Room is removed immediately when its final membership ends through Leave or expiry; it never resets to a Lobby. Join checks expiry synchronously; a periodic sweep removes unused expired Rooms. Restart clears all Rooms. Reconnect uses `recover_room`, never fresh Join or Create. Reserved capacity remains available to the recovering membership even in a full Room.

## Heartbeat and client deadlines

`ping` receives `pong`, including before membership. The client checks transport health on a timer independent of Phaser frames, sends a heartbeat every five seconds during confirmed membership in either phase, and freezes at the next frame boundary after ten seconds without a heartbeat response (`pong`). Returning to a visible tab or resuming a transport timer delayed beyond two of its one-second ticks permits one immediate ping with a fresh ten-second response deadline. Only a pong renews this suspension allowance; repeated visibility changes cannot indefinitely hide a failed connection, and ordinary Room traffic is not a heartbeat response. Initial Create/Join has a ten-second deadline. Recovery has a ten-second per-connection attempt limit, with delays of 500 ms, 1 s, 2 s, 4 s, then 5 s between failed attempts. Retries continue until server confirmation or a terminal response; client clocks never decide reservation expiry. Foreground return makes a pending retry immediate without replacing a healthy connection. No Lobby or Game control is submitted until a Room Snapshot confirms membership and the client has applied that snapshot's phase at a frame boundary. Cancellation invalidates the connection and ignores its later events.

Leave stops accepting further controls immediately. `room_left` acknowledges it; if the connection ends or acknowledgment times out after ten seconds, the client closes it and returns to entry without reconnecting.

## Lobby, seating and Start

Creation enters `lobby`; the first membership is Host. Each new Lobby membership starts Not Ready and takes the first vacant seat, without moving remaining occupants. Seat 0 is north and seats 1–9 run clockwise. Feet positions are `x = round(640 + 390 sin(seat π / 5))`, `y = round(382 - 205 cos(seat π / 5))`. A Seat belongs to that membership until it ends; Start does not reassign or vacate one.

`set_ready` declares only the requesting Player's readiness; it accepts no Player ID or Room Code. It returns `not_in_room` before membership or `invalid_phase` in active play. Accepted declarations broadcast `room_state` to all current members.

`select_avatar` selects only the sending Player’s own membership; it accepts no Player ID or Room Code. Exact fields are `version`, `type`, and `avatarPreset`. Missing, empty, non-string or extra fields return `malformed_message`; unsupported versions return `unsupported_version`. An unjoined connection receives `not_in_room`, active play receives `invalid_phase`, and a non-published ID in the Lobby receives `invalid_avatar_preset`. Rejections do not mutate state. Accepted requests broadcast complete structural `room_state` through the bounded outboxes. Repeated changes and duplicate selections are allowed, preserving Player ID, Display Name, Colour, Seat, Facing and readiness.

Choosing a character in the chooser sends the request immediately, without an optimistic shared-state change; there is no separate confirming action. Selection and Start use the same Room serialization: selection first is retained by Start; Start first rejects the selection. A pending request cannot override the accepted choice. Clients apply the resulting Room State at the next game-frame boundary and update existing Avatar textures and seated artwork without replaying arrivals. Recovery and takeover keep the accepted selection, including after Start; retired sockets cannot select. Leave/expiry end it, and a new membership draws randomly without a cross-Room preference.

Only the current Host can `start_game` in the Lobby. Non-Hosts receive `not_host`, unjoined connections receive `not_in_room`, and a Host attempting to restart active play receives `invalid_phase`. The Game needs a full table, so Start is gated and rejected with `start_blocked` and one of:

- “All 10 Players must be in the Room to start.”
- “Every Player must be connected to start.”
- “Every Player must be Ready to start.”

The gate is checked in that order and a blocked Start changes nothing. An accepted Start atomically changes phase to `playing`, deals Roles, creates the Game, and broadcasts `room_state` followed by one `game_state` per Player. Every Player keeps the Seat, position and Facing the Lobby gave them. Readiness remains informational membership state but cannot change during active play.

On Host Leave or expiry, the longest-present connected membership becomes Host if available, otherwise the oldest retained membership holds the role. Host Disconnect preserves authority for fifteen seconds; at or after that deadline the longest-present connected membership succeeds. If nobody is connected, the first returning Player takes authority. Recovery before the deadline preserves the Host. Succession and recovery are serialized per Room. On membership end, the ordered `player_left` announcement is followed by `room_state` carrying the successor and complete current Player Views. Disconnect instead broadcasts connected presence in `room_state`. Other departures emit only `player_left`. A recovering former Host retains membership but cannot displace the current Host; duplicate Display Names confer no authority.

`room_state` replaces the current shared phase, Host and Player Views, preserving the recipient's Room Code and self Player ID. It is a structural event, not a new membership confirmation. Clients apply these updates through the inbox at frame boundaries before rendering anything.

Fresh Join is restricted to the Lobby and uses ordinary ten-Player capacity and initialization. Recovering Players follow the current phase in their Room Snapshot. Recovery preserves identity, appearance, colour, readiness, position and Facing, subject to subsequent Room transitions. Start includes reserved memberships. The end of the final membership removes a started Room; a never-started Room instead begins five-minute empty-Lobby expiry. Recoverable disconnected memberships keep either phase alive even with no connected Players.

## The Game

### Shapes

Every field below is always present; an absent value is explicitly `null`.

```json
RosterView   { "playerId", "displayName", "colour", "avatarPreset", "seat", "status" }
Ballot       { "voterPlayerId", "targetPlayerId" }
Outcome      { "kind", "victimPlayerId", "eliminatedPlayerId", "eliminatedMafia" }
RoleView     { "playerId", "role" }
Investigation{ "round", "targetPlayerId", "mafia" }
ChatEntry    { "channel", "round", "senderPlayerId", "senderName", "text" }
SelfView     { "role", "faction", "status", "killedByMafia", "mafiaTeam", "mafiaVotes", "mafiaVote",
               "protect", "protectBlockedPlayerId", "investigate", "investigations",
               "meetingVoted", "meetingVote" }
```

`Role` is `"mafia"`, `"villager"`, `"doctor"` or `"sheriff"`. `Faction` is `"mafia"` or `"village"`. `status` is `"living"`, `"eliminated"` or `"left"`. `Outcome.kind` is `"night"` or `"meeting"`. `GamePhase` is one of the seven phases below. A `Ballot` with `targetPlayerId: null` is an explicit Skip.

### Roles

Start deals Roles to exactly ten Participants: three `mafia`, five `villager`, one `doctor` and one `sheriff`, shuffled with a `SecureRandom` and dealt in Seat order. The `mafia` Role belongs to the Mafia Faction and every other Role to the Village. A Role is private for the whole Game and is disclosed only through the recipient's own `game_state` until the Game finishes.

### Phases and the clock

The server owns the clock. `GamePhase` and its fixed duration:

| Phase | Duration | What happens |
| --- | --- | --- |
| `role_reveal` | 8 s | Each Player privately learns their Role; Mafia learn each other. Round is `0`. |
| `night` | 90 s | Mafia vote, Doctor protects, Sheriff investigates; Mafia may talk on their own channel. |
| `night_result` | 6 s | The Night's outcome. |
| `discussion` | 120 s | Public chat for every living Player. |
| `voting` | 30 s | One ballot each, or an explicit Skip. |
| `voting_result` | 6 s | The Meeting's outcome, with every ballot disclosed. |
| `finished` | — | The winning Faction and every Role. |

`role_reveal` is round `0`; each Night increments the round, so the first Night is round `1` and a round runs Night through Voting Result. `remainingMs` is the milliseconds left in the current phase, never negative, and `null` once the Game is `finished`.

A phase ends when its deadline passes, never when everyone has acted. Each new deadline is derived from the deadline it replaces, not from the current time, so a client that reconnects after several phases have elapsed receives the current phase with a correct countdown and no replay. Every Participant in the Room receives a `game_state` at each transition.

### Night choices

`mafia_vote`, `protect` and `investigate` carry the `round` they were chosen in, so a choice submitted against a phase that has already ended is rejected rather than applied to the next one. Each is accepted only in `night`, only from a living Participant with that Role, and only once per Night:

- `mafia_vote` — a living Mafia chooses a living Village target. The Mafia see one another's accepted votes as they arrive; nobody else does.
- `protect` — the living Doctor chooses any living Player, including themselves, but not the Player they protected the previous Night. `self.protectBlockedPlayerId` names that Player.
- `investigate` — the living Sheriff chooses another living Player and privately learns only whether they are Mafia. Results are retained for the rest of the Game in `self.investigations`.

Rejections are `invalid_phase` (wrong phase or a stale round), `invalid_action` (wrong Role, or not a living Participant), `already_submitted` (the choice for this phase is already final) and `invalid_target` with the reason.

At the end of the Night, a target chosen by a strict majority of the living Mafia is attacked; votes for a Player who is no longer living are ignored, and no majority means no attack. A protected target survives. The Sheriff learns their result unless they were the Night's victim. `outcome` is then `{ "kind": "night", "victimPlayerId": … }`, whose `victimPlayerId` is `null` when nobody died — a successful protection, a split vote and an idle Night are deliberately indistinguishable.

### Meetings

`meeting_vote` carries its `round` and is accepted only in `voting`, only from a living Participant, and only once. `targetPlayerId: null` is an explicit Skip and locks exactly as a ballot for a Player does. A Player is eliminated only by a strict majority of the living; a plurality is not enough.

At Voting Result, `ballots` discloses every ballot cast, Skips included, and `outcome` is `{ "kind": "meeting", "eliminatedPlayerId": …, "eliminatedMafia": … }`. An elimination reveals only that Player's Faction, never their Role.

### Chat

`send_chat` carries `channel` and `text`. Text is trimmed and must be 1–240 Unicode code points; anything else is `malformed_message`. `public` is accepted from any living Participant during `discussion` or `voting` and reaches every Participant. `mafia` is accepted only from a living Mafia during `night` and reaches only the living Mafia. Anything else is `invalid_action` or `invalid_phase`.

The server records the recipients of each entry and delivers `chat_message` only to them. On recovery a Participant receives `chat_history` holding exactly the entries they are entitled to read; it replaces the client's log rather than adding to it. Eliminated Players can read what they could read while living but cannot speak.

### Privacy

`game_state` is built per recipient. `players`, `phase`, `round`, `remainingMs`, `outcome`, `ballots` and `winner` are the same for everyone; `self` is that recipient's own view and nothing else. A non-Mafia recipient's `mafiaTeam` and `mafiaVotes` are `null`, not a filtered list; a non-Doctor's `protect` is `null`; a non-Sheriff's `investigations` is `null`. Nothing private is ever sent to a client that merely declines to draw it.

For the same reason an accepted choice updates only the recipients whose authorized view actually changed: an accepted `mafia_vote` reaches the living Mafia, and an accepted `protect`, `investigate` or `meeting_vote` reaches only its submitter. A Game state that reached everyone on each accepted action would leak the timing of hidden Role activity through its own countdown.

### Departure and the end of the Game

The Game Roster outlives Room Membership. When a Membership ends through Leave or recovery expiry, a living Participant Forfeits: their status becomes `left`, their own pending Night choice or ballot is withdrawn, and they stop counting toward every majority and toward victory. A choice aimed at them stays locked and simply cannot take effect, because a Player who is not living can never be a target at resolution. A Disconnect alone forfeits nothing — the Participant stays `living` for the whole recovery reservation, remains in every denominator, and their locked choice survives their return.

Roster entries remain in `players` with their Seat and Display Name after the Membership ends, so the table never renumbers and a departure is visible as a departure.

Victory is checked after every elimination and every Forfeit. The Village wins when no Mafia is living; the Mafia win when living Mafia are at least as many as living Village.

A victory decided by an Elimination is announced before it ends the Game: the Night Result or Voting Result phase runs in full, so the Players see who died and, for a Meeting, how everyone voted, and the Game enters `finished` at that phase's own deadline. A Forfeit belongs to no phase, so a victory it decides enters `finished` at once, mid-phase.

Once `finished`, `winner` carries the Faction and `roles` reveals every Participant's Role, including those who were eliminated or left. `remainingMs` is `null` and the Game state no longer changes.

## Membership recovery foundation

Entry snapshots privately carry a 64-character lowercase hexadecimal recovery credential, generated from two random UUIDs. `recover_room` requires that credential and its Room Code; neither Player ID nor Display Name authorizes recovery. Credentials never appear in Player Views, broadcasts, or Room State. A successful recovery returns the current snapshot and the same credential. The client stores the credential and Room/Display Name intent in sessionStorage for same-tab refresh. Independent tabs have independent intent; duplicated tabs inheriting credentials use the replacement rule. Storage failure falls back to in-memory recovery.

A server-detected Disconnect reserves membership for exactly 120 seconds. Recovery is allowed strictly before the deadline; at or after it the membership ends. Expiry is checked synchronously during Join/Recover and by a 200-millisecond sweep, the same sweep that advances Game phases; whichever deadline is earliest is applied first. Failed attempts never renew the deadline. A later Disconnect after successful recovery starts a new window. Invalid or expired credentials receive `recovery_expired` (“Your place in the Room expired”); an unavailable Room receives `room_not_found`. These are terminal and never cause an implicit fresh Join. A valid recovery atomically replaces an active connection. The server retires its authority and closes it asynchronously with WebSocket application close code **4001**, reason “Connection replaced”. The displaced client clears stored intent and applies a terminal explanation at the next frame boundary. Retired readiness, Avatar selection, Start, Game, chat, Leave and close callbacks cannot affect the membership. The client still treats legacy `recovery_in_use` as retryable.

Disconnect and recovery broadcast structural `room_state` events carrying connected presence. Expiry broadcasts `player_left` with reason `expired`. Recovery replaces the connection binding and returns a complete snapshot, followed for a Participant by that recipient's `game_state` and `chat_history`. Retired socket callbacks cannot end the recovered membership.

Expired recovery shows “Your place in the Room expired” and “Back to lobby selection” in either phase. The action clears recovery intent and returns to the normal Create Room / Join Lobby form without sending Join or Create. Joining through that form begins a new membership only if the Room is still a Lobby; it cannot restore the expired membership. `room_not_found` explains that recovery cannot continue. Other explicit non-retryable recovery errors are terminal.

Leave during recovery clears local intent immediately. A separate socket makes one bounded ten-second attempt, sending `recover_room` followed by `leave_room` in WebSocket order, then closing on `room_left`, error, or timeout. It never forwards snapshots into the game or starts retries; unreachable reservations expire naturally. Acknowledged intentional Leave still ends membership without reconnecting. Server restart clears Rooms and recovery state.

These changes extend protocol v1 for the coordinated local client/server release; older clients lacking Game state, chat, permanent seating, phase, Host or readiness decoding must be updated together with the server.


## The Published Avatar Collection

`GET /rooms/{roomCode}/avatars` returns the collection a Room pinned at creation. The Room Code is trimmed and uppercased as Join trims it. An unknown, expired or never-created code returns `404` with no body. A successful response is:

```json
{ "version": 1, "collectionId": "8f2a1c09b4d7e615", "presets": [ { "id": "townsperson-1", "name": "Rowan", "sprite": "data:image/png;base64,…", "seatedSprite": "data:image/png;base64,…" } ] }
```

A collection holds at least one preset and has no upper bound. `collectionId` is derived from the publication's content, so two Rooms pinning the same publication report the same identifier. Both artwork fields are inline `data:image/png;base64,` sprite sheets: `sprite` is four rows of nine 64×64 frames, of which only the standing pose of each row is drawn, and `seatedSprite` four rows of eleven. Browser origins are allowed as for the WebSocket endpoint.

Clients fetch this on join, keyed to the Room they are entering, and create every texture before rendering the Room. At page load a client does not yet know which Room it will enter, so it cannot know which collection it needs. Reconnect keeps the collection its membership already has.

The developer editor validates distinct complete compatible saved recipes before atomically replacing the publication file, which the backend reads. Source layers, drafts and authoring endpoints are absent from the Player build. Publishing takes effect for Rooms created from then on, with no rebuild and no restart; a running Room keeps the collection it was created with, and superseded collections stay in memory only while some Room still references one.
