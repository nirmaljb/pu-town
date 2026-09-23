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
| `move` | `x: number`, `y: number`, `facing: Facing` |
| `use_ability` | `ability: Ability`, `round: integer`, `targetPlayerId: string \| null` |
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
| `field_state` | `round: integer`, `players: FieldPlayer[]`, `bodies: Body[]`, `self: OwnField` |
| `chat_message` | `channel`, `round: integer`, `senderPlayerId: string`, `senderName: string`, `text: string` |
| `chat_history` | `messages: ChatEntry[]` |
| `player_left` | `playerId: string`, `reason: "left" \| "disconnected" \| "expired"` |
| `room_left` | `roomId: string` |
| `error` | `code: string`, `message: string` |

`PlayerView` contains exactly `playerId`, `displayName`, `colour`, `avatarPreset`, `seat`, `ready`, `connected`, `x`, `y`, and `facing`. `colour` is an uppercase six-digit hex colour prefixed by `#`. `avatarPreset` is an identifier in the Published Avatar Collection the Room pinned when it was created, served over HTTP by `GET /rooms/{roomCode}/avatars` (below). Identifiers match `[a-z0-9][a-z0-9-]{0,63}`; names and published order are presentation data carried with the collection, independent of identity. Membership is the server's to enforce against the Room's own collection: a client decoding a Player View checks the identifier's form only, because a Room Snapshot can arrive before that Room's collection has been fetched. Identifiers outside the Room's collection, including unpublished draft IDs, are never valid.

`seat` is an integer from 0 through 9 and is never null: a Player takes a Seat on joining the Lobby and keeps it for the whole Room, through Start and to the end of the Game. Two Players in one Room never share a Seat. `ready` and `connected` are booleans. Disconnected memberships remain in Player Views with `connected: false`; clients freeze and subdue their Avatars and show “Reconnecting…”.

The server randomly assigns an Avatar Preset when a new Room Membership begins, including Create Room and fresh Join. Recovery retains the last server-accepted selection. Duplicates are allowed. The assignment remains unchanged by repeated Join to the same Room and by failed room switches. Room Snapshots and join announcements carry the same assignment to all observers. A new membership draws again and may receive the same preset. Player Colour remains the distinct marker underneath the character.

`Facing` is exactly `"up"`, `"left"`, `"down"`, or `"right"`. The server retains it alongside position and sends it in Player Views. Seated Avatars face inward: seat 0 down, seats 1–4 left, seat 5 up, seats 6–9 right. Start changes neither Seat nor Facing. Positions mark Avatar feet, in town coordinates.

## Seats and the Roam

The town is 2560 × 1440. The Town Hall is drawn in a 1280 × 720 frame whose top-left corner is at (640, 360); its Emergency button stands at (1280, 742). A Player View's `x`, `y` and `facing` are always their Seat's: Room State describes the Lobby and the Meeting table. Walking happens only during a Game's `roam` phase, and positions there travel only in `move` and `field_state` (below). The server is the only author of every position a client draws for someone else.

The Room's shared state is its Player Views and, once the Game starts, each recipient's own `game_state` and, during a Roam, `field_state`.

The bounded outbound queue is strictly ordered and never replaces or evicts an event. If a slow connection cannot accept a new event, the server closes that connection asynchronously, allowing Reconnect to recover a complete Room Snapshot and the recipient's current Game state.

A newly joined connection receives a new Player ID; credential-based recovery retains the existing membership's Player ID.

Current error codes are `cooling_down`, `target_shielded`, `malformed_message`, `unsupported_version`, `unknown_message_type`, `not_in_room`, `room_not_found`, `room_full`, `not_host`, `start_blocked`, `invalid_phase`, `invalid_action`, `invalid_target`, `already_submitted`, `invalid_avatar_preset`, `recovery_expired`, and `recovery_in_use`.

## Entry and Room lifetime

Only `create_room` creates a Room. It generates a collision-checked code from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, six characters long. The `roomId` wire field carries this Room Code. Both creation and joining return `room_snapshot` on success. Join trims and uppercases its code; unknown or expired codes return `room_not_found` (“Room not found”). Names are trimmed and must contain 1–24 Unicode code points; duplicate names are allowed.

A fresh `join_room` to a started Room returns `invalid_phase` (“Game already started”), before capacity checks or ending any existing membership. Repeated Join by an existing member of that same Room remains idempotent; recovery uses `recover_room`.

Rooms allow at most ten current memberships; further joins return `room_full` (“Room is full”). Failed transitions preserve any existing membership. Colours are assigned from `#4F8CFF`, `#FF8066`, `#FFD166`, `#65D6A4`, `#C792EA`, `#56DDE0`, `#F48FB1`, `#D6D3C4`, `#F29F38`, and `#A5CF45`, without duplicates in a Room. Leave releases a slot and colour immediately. Disconnect reserves both until recovery or membership expiry.

Empty Lobbies expire five minutes after the last membership ends. A started Room is removed immediately when its final membership ends through Leave or expiry; it never resets to a Lobby. Join checks expiry synchronously; a periodic sweep removes unused expired Rooms. Restart clears all Rooms. Reconnect uses `recover_room`, never fresh Join or Create. Reserved capacity remains available to the recovering membership even in a full Room.

## Heartbeat and client deadlines

`ping` receives `pong`, including before membership. The client checks transport health on a timer independent of Phaser frames, sends a heartbeat every five seconds during confirmed membership in either phase, and freezes at the next frame boundary after ten seconds without a heartbeat response (`pong`). Returning to a visible tab or resuming a transport timer delayed beyond two of its one-second ticks permits one immediate ping with a fresh ten-second response deadline. Only a pong renews this suspension allowance; repeated visibility changes cannot indefinitely hide a failed connection, and ordinary Room traffic is not a heartbeat response. Initial Create/Join has a ten-second deadline. Recovery has a ten-second per-connection attempt limit, with delays of 500 ms, 1 s, 2 s, 4 s, then 5 s between failed attempts. Retries continue until server confirmation or a terminal response; client clocks never decide reservation expiry. Foreground return makes a pending retry immediate without replacing a healthy connection. No Lobby or Game control is submitted until a Room Snapshot confirms membership and the client has applied that snapshot's phase at a frame boundary. Cancellation invalidates the connection and ignores its later events.

Leave stops accepting further controls immediately. `room_left` acknowledges it; if the connection ends or acknowledgment times out after ten seconds, the client closes it and returns to entry without reconnecting.

## Lobby, seating and Start

Creation enters `lobby`; the first membership is Host. Each new Lobby membership starts Not Ready and takes the first vacant seat, without moving remaining occupants. Seat 0 is north and seats 1–9 run clockwise. Feet positions are `x = 640 + round(640 + 390 sin(seat π / 5))`, `y = 360 + round(382 - 205 cos(seat π / 5))`. A Seat belongs to that membership until it ends; Start does not reassign or vacate one.

`set_ready` declares only the requesting Player's readiness; it accepts no Player ID or Room Code. It returns `not_in_room` before membership or `invalid_phase` in active play. Accepted declarations broadcast `room_state` to all current members.

`select_avatar` selects only the sending Player’s own membership; it accepts no Player ID or Room Code. Exact fields are `version`, `type`, and `avatarPreset`. Missing, empty, non-string or extra fields return `malformed_message`; unsupported versions return `unsupported_version`. An unjoined connection receives `not_in_room`, active play receives `invalid_phase`, and a non-published ID in the Lobby receives `invalid_avatar_preset`. Rejections do not mutate state. Accepted requests broadcast complete structural `room_state` through the bounded outboxes. Repeated changes and duplicate selections are allowed, preserving Player ID, Display Name, Colour, Seat, Facing and readiness.

Choosing a character in the chooser sends the request immediately, without an optimistic shared-state change; there is no separate confirming action. Selection and Start use the same Room serialization: selection first is retained by Start; Start first rejects the selection. A pending request cannot override the accepted choice. Clients apply the resulting Room State at the next game-frame boundary and update existing Avatar textures and seated artwork without replaying arrivals. Recovery and takeover keep the accepted selection, including after Start; retired sockets cannot select. Leave/expiry end it, and a new membership draws randomly without a cross-Room preference.

Only the current Host can `start_game` in the Lobby. Non-Hosts receive `not_host`, unjoined connections receive `not_in_room`, and a Host attempting to restart active play receives `invalid_phase`. The Game needs at least four Players, so Start is gated and rejected with `start_blocked` and one of:

- “At least 4 Players must be in the Room to start.”
- “Every Player must be connected to start.”
- “Every Player must be Ready to start.”

The gate is checked in that order and a blocked Start changes nothing. An accepted Start atomically changes phase to `playing`, deals Roles, creates the Game, and broadcasts `room_state` followed by one `game_state` per Player. Every Player keeps the Seat the Lobby gave them. Readiness remains informational membership state but cannot change during active play.

On Host Leave or expiry, the longest-present connected membership becomes Host if available, otherwise the oldest retained membership holds the role. Host Disconnect preserves authority for fifteen seconds; at or after that deadline the longest-present connected membership succeeds. If nobody is connected, the first returning Player takes authority. Recovery before the deadline preserves the Host. Succession and recovery are serialized per Room. On membership end, the ordered `player_left` announcement is followed by `room_state` carrying the successor and complete current Player Views. Disconnect instead broadcasts connected presence in `room_state`. Other departures emit only `player_left`. A recovering former Host retains membership but cannot displace the current Host; duplicate Display Names confer no authority.

`room_state` replaces the current shared phase, Host and Player Views, preserving the recipient's Room Code and self Player ID. It is a structural event, not a new membership confirmation. Clients apply these updates through the inbox at frame boundaries before rendering anything.

Fresh Join is restricted to the Lobby and uses ordinary ten-Player capacity and initialization. Recovering Players follow the current phase in their Room Snapshot. Recovery preserves identity, appearance, colour, readiness, position and Facing, subject to subsequent Room transitions. Start includes reserved memberships. The end of the final membership removes a started Room; a never-started Room instead begins five-minute empty-Lobby expiry. Recoverable disconnected memberships keep either phase alive even with no connected Players.

## The Game

### Shapes

Every field below is always present; an absent value is explicitly `null`.

```json
RosterView   { "playerId", "displayName", "colour", "avatarPreset", "seat", "status" }
Ballot       { "voterPlayerId", "targetPlayerId" }
Outcome      { "kind", "callerPlayerId", "bodyPlayerId", "deaths", "eliminatedPlayerId", "eliminatedMafia" }
RoleView     { "playerId", "role" }
Investigation{ "round", "targetPlayerId", "mafia" }
ChatEntry    { "channel", "round", "senderPlayerId", "senderName", "text" }
SelfView     { "role", "faction", "status", "killedByMafia", "mafiaTeam", "investigations", "meetingVoted", "meetingVote" }
FieldPlayer  { "playerId", "x", "y", "facing", "ghost", "vanished" }
Body         { "playerId", "x", "y" }
OwnField     { "x", "y", "facing", "correction", "crowding", "primaryCooldownMs", "vanishCooldownMs", "vanishedMs",
               "shieldTargetPlayerId", "shieldMs", "emergencyAvailable" }
```

`Role` is `"mafia"`, `"villager"`, `"doctor"` or `"sheriff"`. `Faction` is `"mafia"` or `"village"`. `status` is `"living"`, `"eliminated"` or `"left"`. `Outcome.kind` is `"report"`, `"emergency"`, `"timeout"` or `"meeting"`. `Ability` is `"kill"`, `"vanish"`, `"shield"`, `"scan"`, `"report"` or `"emergency"`. `GamePhase` is one of the seven phases below. A `Ballot` with `targetPlayerId: null` is an explicit Skip.

### Roles

Start deals Roles to every Participant: one `mafia` for four to six Players, two for seven or eight and three for nine or ten, one `doctor`, one `sheriff`, and `villager` for the rest, shuffled with a `SecureRandom` and dealt in Seat order. The `mafia` Role belongs to the Mafia Faction and every other Role to the Village. A Role is private for the whole Game and is disclosed only through the recipient's own `game_state` until the Game finishes.

### Phases and the clock

The server owns the clock. `GamePhase` and its fixed duration:

| Phase | Duration | What happens |
| --- | --- | --- |
| `role_reveal` | 8 s | Each Player privately learns their Role; Mafia learn each other. Round is `0`. |
| `roam` | 150 s | Everyone walks the town; abilities are in play; Mafia may talk on their own channel. Ends early on a Report or an Emergency Meeting. |
| `meeting_call` | 5 s | Who called the Meeting and every death since the last one. |
| `discussion` | 90 s | Public chat for every living Player. |
| `voting` | 30 s | One ballot each, or an explicit Skip. |
| `voting_result` | 6 s | The Meeting's outcome, with every ballot disclosed. |
| `finished` | — | The winning Faction and every Role. |

`role_reveal` is round `0`; each Roam increments the round, so the first Roam is round `1` and a round runs Roam through Voting Result. `remainingMs` is the milliseconds left in the current phase, never negative, and `null` once the Game is `finished`.

A timed phase ends when its deadline passes, never when everyone has acted. Each new deadline is derived from the deadline it replaces, not from the current time; a Roam ended by a Report or an Emergency Meeting starts its Meeting Call at the moment it was called. Every Participant in the Room receives a `game_state` at each transition.

### The Roam

Every Roam begins with every Participant, living or not, standing at their own Seat, and every ability cooldown ten seconds from ready.

**Movement.** `move` carries the sender's own position. The server accepts it only in `roam`, from a Participant who has not left, when the point and the midpoint from the last accepted position are clear of every obstacle and inside the town, and when the distance is within `240 px/s × 1.4 × elapsed + 24 px` (elapsed is clamped to 50 ms – 1 s). A refused step is not an error: the server keeps the previous position and increments that Participant's `correction`. The server also increments it when it moves a Participant itself, at the start of a Roam and on a Crowding push. A client adopts `OwnField.x`, `y` and `facing` whenever `correction` changes. `x` and `y` must be finite numbers and `facing` a Facing, or the message is `malformed_message`. Outside a Game `move` is `invalid_phase`.

**The field.** Ten times a second during `roam`, each Participant who is a current member receives their own `field_state`. `players` holds exactly the Participants they can see, themselves included. A living recipient sees living Participants within a Vision of 380 px, except a Vanished Mafia, whom only Mafia recipients see. A Ghost (a Participant who is not living) is never visible to the living. A recipient who is not living sees every Participant who has not left. `ghost` marks a non-living Participant and `vanished` a Vanished one. `bodies` holds the Bodies within the recipient's Vision, or all of them for a recipient who is not living. `self` carries the recipient's own position, `correction` and timers, with `null` wherever their Role or status has no such thing: `crowding` (0–1) for a living Villager, `primaryCooldownMs` for a living Mafia, Doctor or Sheriff, `vanishCooldownMs` and `vanishedMs` for living Mafia, and `shieldMs` for the living Doctor, whose `shieldTargetPlayerId` names the Player they are Shielding. `emergencyAvailable` is whether a living recipient still has their Emergency Meeting. No position outside a recipient's field is sent to them in any message.

**Abilities.** `use_ability` carries its `round`. `kill`, `shield` and `scan` require a `targetPlayerId`; `vanish`, `report` and `emergency` require `null`; anything else is `malformed_message`. An ability is accepted only in `roam` and its own round (`invalid_phase`), only from a living Participant with the right Role (`invalid_action`), and only when its cooldown has passed (`cooling_down`). A targeted ability needs another living Participant the actor can currently see; a target that is out of range, hidden or not living is refused with `invalid_target` and the same message, “No such Player within reach.”, so a refusal never reveals a hidden Player.

- `kill` — a Mafia kills a Village Player within 90 px; the cooldown is 25 s. If a living Doctor is Shielding that target, the kill fails, the Shield is spent, the cooldown still restarts, and only the killer is told, with `target_shielded`. Otherwise the target is eliminated and leaves a Body where they stood.
- `vanish` — a Mafia is hidden from every non-Mafia field for 10 s; the next Vanish is ready 30 s after that ends.
- `shield` — the Doctor Shields another Player within 120 px for 20 s; the cooldown is 30 s.
- `scan` — the Sheriff learns whether another Player within 140 px is Mafia. The result joins `self.investigations` for the rest of the Game; the cooldown is 30 s.
- `report` — any living Participant within 120 px of a Body calls a Meeting (`meeting_call` with `kind: "report"`). With no Body in reach it is `invalid_target`.
- `emergency` — any living Participant within 150 px of the button calls a Meeting (`kind: "emergency"`), once per Game (`invalid_action` afterwards; `invalid_target` away from the button).

**Crowding.** A living Villager who stays within 90 px of another living Player they can see accumulates Crowding; away from everyone it drains at one and a half times that rate. At six seconds the server pushes the Villager 170 px directly away (turning as needed to find open ground), resets their Crowding and increments their `correction`.

**Secrecy of kills.** A kill updates only the killer, the victim and the living Mafia with `game_state`. Until the next Meeting Call, every other living recipient's `players` shows the victim as `living`; the victim's own view, the Mafia's and any non-living recipient's show the truth. The victim's `self.status` becomes `eliminated` with `killedByMafia: true`, and they walk on as a Ghost.

**The Meeting Call.** A Report, an Emergency Meeting, or the Roam's deadline (`kind: "timeout"`) enters `meeting_call`. `outcome` names the `callerPlayerId` (null on timeout), the `bodyPlayerId` (only for a Report) and `deaths`, every Player killed since the last Meeting. At that moment every death is revealed to everyone, all Bodies are cleared, and every Vanish and Shield ends.

### Meetings

`meeting_vote` carries its `round` and is accepted only in `voting`, only from a living Participant, and only once. `targetPlayerId: null` is an explicit Skip and locks exactly as a ballot for a Player does. A Player is eliminated only by a strict majority of the living; a plurality is not enough.

At Voting Result, `ballots` discloses every ballot cast, Skips included, and `outcome` is `{ "kind": "meeting", "eliminatedPlayerId": …, "eliminatedMafia": … }` with the other fields `null` or empty. An elimination reveals only that Player's Faction, never their Role.

### Chat

`send_chat` carries `channel` and `text`. Text is trimmed and must be 1–240 Unicode code points; anything else is `malformed_message`. `public` is accepted from any living Participant during `discussion` or `voting` and reaches every Participant. `mafia` is accepted only from a living Mafia during `roam` and reaches only the living Mafia. Anything else is `invalid_action` or `invalid_phase`.

The server records the recipients of each entry and delivers `chat_message` only to them. On recovery a Participant receives `chat_history` holding exactly the entries they are entitled to read; it replaces the client's log rather than adding to it. Eliminated Players can read what they could read while living but cannot speak.

### Privacy

`game_state` is built per recipient. `phase`, `round`, `remainingMs`, `outcome`, `ballots` and `winner` are the same for everyone; `players` is the same for everyone except for a Roam death not yet revealed (above); `self` is that recipient's own view and nothing else. A non-Mafia recipient's `mafiaTeam` is `null`, not a filtered list, and a non-Sheriff's `investigations` is `null`. `field_state` is built per recipient too. Nothing private is ever sent to a client that merely declines to draw it.

For the same reason an accepted action updates only the recipients whose authorized view actually changed: a kill reaches the killer, the victim and the living Mafia; a Scan and a `meeting_vote` reach only their submitter; Vanish and Shield change only the actor's own field. A Game state that reached everyone on each accepted action would leak hidden Role activity through its timing.

### Departure and the end of the Game

The Game Roster outlives Room Membership. When a Membership ends through Leave or recovery expiry, a living Participant Forfeits: their status becomes `left`, their own ballot is withdrawn, their Shield ends, they leave every field, and they stop counting toward every majority and toward victory. A Disconnect alone forfeits nothing — the Participant stays `living` for the whole recovery reservation, stays where they stood, remains in every denominator, and their locked ballot survives their return.

Roster entries remain in `players` with their Seat and Display Name after the Membership ends, so the table never renumbers and a departure is visible as a departure. Only a living Participant Forfeits, so an Eliminated Player who leaves stays `eliminated`; a client shows any roster entry without a current Room Membership as an empty Seat marked Left.

Victory is checked after every kill, every elimination and every Forfeit. The Village wins when no Mafia is living; the Mafia win when living Mafia are at least as many as living Village.

A kill or a Forfeit that decides the Game enters `finished` at once, mid-phase. A victory decided by a Meeting's elimination is announced first: the Voting Result runs in full, so the Players see how everyone voted, and the Game enters `finished` at that phase's own deadline. A Forfeit during a Voting Result whose elimination already decided the Game still counts, but it does not cut that announcement short.

Once `finished`, `winner` carries the Faction, `roles` reveals every Participant's Role, including those who were eliminated or left, and every death is revealed. `remainingMs` is `null` and the Game state no longer changes: a later Leave or expiry ends only the Membership and forfeits nothing.

## Membership recovery foundation

Entry snapshots privately carry a 64-character lowercase hexadecimal recovery credential, generated from two random UUIDs. `recover_room` requires that credential and its Room Code; neither Player ID nor Display Name authorizes recovery. Credentials never appear in Player Views, broadcasts, or Room State. A successful recovery returns the current snapshot and the same credential. The client stores the credential and Room/Display Name intent in sessionStorage for same-tab refresh. Independent tabs have independent intent; duplicated tabs inheriting credentials use the replacement rule. Storage failure falls back to in-memory recovery.

A server-detected Disconnect reserves membership for exactly 120 seconds. Recovery is allowed strictly before the deadline; at or after it the membership ends. Expiry is checked synchronously during Join/Recover and by a 200-millisecond sweep, the same sweep that advances Game phases; whichever deadline is earliest is applied first. Failed attempts never renew the deadline. A later Disconnect after successful recovery starts a new window. Invalid or expired credentials receive `recovery_expired` (“Your place in the Room expired”); an unavailable Room receives `room_not_found`. These are terminal and never cause an implicit fresh Join. A valid recovery atomically replaces an active connection. The server retires its authority and closes it asynchronously with WebSocket application close code **4001**, reason “Connection replaced”. The displaced client clears stored intent and applies a terminal explanation at the next frame boundary. Retired readiness, Avatar selection, Start, Game, chat, Leave and close callbacks cannot affect the membership. The client still treats legacy `recovery_in_use` as retryable.

Disconnect and recovery broadcast structural `room_state` events carrying connected presence. Expiry broadcasts `player_left` with reason `expired`. Recovery replaces the connection binding and returns a complete snapshot, followed for a Participant by that recipient's `game_state` and `chat_history`, and during a Roam by their next `field_state`. Retired socket callbacks cannot end the recovered membership.

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
