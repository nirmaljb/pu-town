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
| `start_practice` | none |
| `advance_practice` | `round: integer`, `phase: "day" \| "night" \| "discussion" \| "voting" \| "voting_result" |
| `select_avatar` | `avatarPreset: string` |
| `set_ready` | `ready: boolean` |
| `set_role_setup` | `mafia: integer`, `doctors: integer`, `sheriffs: integer` |
| `move` | `x: number`, `y: number`, `facing: Facing` |
| `meeting_vote` | `round: integer`, `targetPlayerId: string \| null` |
| `night_choice` | `round: integer`, `targetPlayerId: string \| null` |
| `send_chat` | `channel: "public" \| "mafia"`, `text: string` |

## Server to client

| Type | Additional fields |
| --- | --- |
| `pong` | none |
| `room_snapshot` | `selfPlayerId: string`, `roomId: string`, `recoveryToken: string`, `phase: "lobby" \| "playing"`, `hostPlayerId: string`, `roleSetup: RoleSetup`, `players: PlayerView[]` |
| `room_state` | `phase: "lobby" \| "playing"`, `hostPlayerId: string`, `roleSetup: RoleSetup`, `players: PlayerView[]` |
| `player_joined` | `player: PlayerView` |
| `game_state` | `mode: "competitive" \| "practice"`, `phase: GamePhase`, `round: integer`, `remainingMs: integer \| null`, `players: RosterView[]`, `outcome: Outcome \| null`, `ballots: Ballot[] \| null`, `winner: Faction \| null`, `roles: RoleView[] \| null`, `self: SelfView` |
| `field_state` | `round: integer`, `players: FieldPlayer[]`, `self: OwnField` |
| `chat_message` | `channel`, `round: integer`, `senderPlayerId: string`, `senderName: string`, `text: string` |
| `chat_history` | `messages: ChatEntry[]` |
| `player_left` | `playerId: string`, `reason: "left" \| "disconnected" \| "expired"` |
| `room_left` | `roomId: string` |
| `error` | `code: string`, `message: string` |

`PlayerView` contains exactly `playerId`, `displayName`, `colour`, `avatarPreset`, `seat`, `ready`, `connected`, `x`, `y`, and `facing`. `colour` is an uppercase six-digit hex colour prefixed by `#`. `avatarPreset` is an identifier in the Published Avatar Collection the Room pinned when it was created, served over HTTP by `GET /rooms/{roomCode}/avatars` (below). Identifiers match `[a-z0-9][a-z0-9-]{0,63}`; names and published order are presentation data carried with the collection, independent of identity. Membership is the server's to enforce against the Room's own collection: a client decoding a Player View checks the identifier's form only, because a Room Snapshot can arrive before that Room's collection has been fetched. Identifiers outside the Room's collection, including unpublished draft IDs, are never valid.

`seat` is an integer from 0 through 9 and is never null: a Player takes a Seat on joining the Lobby and keeps it for the whole Room, through Start and to the end of the Game. Two Players in one Room never share a Seat. `ready` and `connected` are booleans. Disconnected memberships remain in Player Views with `connected: false`; clients freeze and subdue their Avatars and show “Reconnecting…”.

The server randomly assigns an Avatar Preset when a new Room Membership begins, including Create Room and fresh Join. Recovery retains the last server-accepted selection. Duplicates are allowed. The assignment remains unchanged by repeated Join to the same Room and by failed room switches. Room Snapshots and join announcements carry the same assignment to all observers. A new membership draws again and may receive the same preset. Player Colour remains the distinct marker underneath the character.

`Facing` is exactly `"up"`, `"left"`, `"down"`, or `"right"`. The server retains it alongside position and sends it in Player Views. Seated Avatars face inward: seat 0 down, seats 1–4 left, seat 5 up, seats 6–9 right. Start changes neither Seat nor Facing. Positions mark Avatar feet, in town coordinates.

## Seats, Day and sleeping Night

The town is the 2560 × 1440 PU Town map (`frontend/public/maps/pu-town/`); its obstacles come from that map's collision layer. The Town Square Seat circle remains centred on (1280, 742), with no Emergency button. Room State's Player Views describe retained Seats; accepted town positions travel only in `move` and recipient-specific `field_state`. Players walk only during Day and sleep at their last accepted position during Night.

The Room's shared state is its Player Views plus each recipient's `game_state`, with `field_state` during Day and Night. A transition into Day or Night and recovery in either phase include an immediate authorized field snapshot, followed by ten snapshots a second. Townhall uses retained Seats and sends no field snapshots.

The bounded outbound queue is strictly ordered and never replaces or evicts an event. If a slow connection cannot accept a new event, the server closes that connection asynchronously, allowing Reconnect to recover a complete Room Snapshot and the recipient's current Game state.

A newly joined connection receives a new Player ID; credential-based recovery retains the existing membership's Player ID.

Current error codes are `malformed_message`, `unsupported_version`, `unknown_message_type`, `not_in_room`, `room_not_found`, `room_full`, `not_host`, `invalid_role_setup`, `start_blocked`, `practice_blocked`, `invalid_phase`, `invalid_action`, `invalid_target`, `already_submitted`, `invalid_avatar_preset`, `recovery_expired`, and `recovery_in_use`.

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

**Role Setup.** `RoleSetup` is `{ mafia, doctors, sheriffs }`: how many of each special Role the Room's Game deals. Everyone else is a Villager. A new Room's setup is one of each. Only the current Host can `set_role_setup`, and only in the Lobby; others receive `not_host`, and active play returns `invalid_phase`. The three fields are exact and each must be a non-negative integer, or the message is `malformed_message`. A setup needs one or two Mafia, one or two Sheriffs and at least one Doctor, with at most nine special Roles, so a full Room always keeps a Villager; anything else is `invalid_role_setup` and changes nothing. An accepted setup broadcasts `room_state` to all current members, and every `room_state` and `room_snapshot` carries the current setup. Changing it does not change anyone's readiness.

Only the current Host can `start_game` in the Lobby. Non-Hosts receive `not_host`, unjoined connections receive `not_in_room`, and a Host attempting to restart active play receives `invalid_phase`. The Game needs at least four Players, so Start is gated and rejected with `start_blocked` and one of:

- “At least 4 Players must be in the Room to start.”
- “This deal of M Mafia, D Doctors and S Sheriffs needs at least N Players, so one is left a Villager.” (N is one more than the special Roles; counts are written as numbers, with “Doctor” and “Sheriff” singular for one.)
- “Every Player must be connected to start.”
- “Every Player must be Ready to start.”

The gate is checked in that order and a blocked Start changes nothing. An accepted Start atomically changes phase to `playing`, deals Roles by the Room's Role Setup, creates the Game, and broadcasts `room_state` followed by one `game_state` per Player. Every Player keeps the Seat the Lobby gave them. Readiness remains informational membership state but cannot change during active play.

On Host Leave or expiry, the longest-present connected membership becomes Host if available, otherwise the oldest retained membership holds the role. Host Disconnect preserves authority for fifteen seconds; at or after that deadline the longest-present connected membership succeeds. If nobody is connected, the first returning Player takes authority. Recovery before the deadline preserves the Host. Succession and recovery are serialized per Room. On membership end, the ordered `player_left` announcement is followed by `room_state` carrying the successor and complete current Player Views. Disconnect instead broadcasts connected presence in `room_state`. Other departures emit only `player_left`. A recovering former Host retains membership but cannot displace the current Host; duplicate Display Names confer no authority.

`room_state` replaces the current shared phase, Host and Player Views, preserving the recipient's Room Code and self Player ID. It is a structural event, not a new membership confirmation. Clients apply these updates through the inbox at frame boundaries before rendering anything.

Fresh Join is restricted to the Lobby and uses ordinary ten-Player capacity and initialization. Recovering Players follow the current phase in their Room Snapshot. Recovery preserves identity, appearance, colour, readiness, position and Facing, subject to subsequent Room transitions. Start includes reserved memberships. The end of the final membership removes a started Room; a never-started Room instead begins five-minute empty-Lobby expiry. Recoverable disconnected memberships keep either phase alive even with no connected Players.

## Solo Practice

`start_practice` enters Solo Practice only when the sender is the Host, the Room is a Lobby, and its sole Membership belongs to that Host. Ready and Role Setup do not gate practice. A disconnected guest still occupies a Membership and blocks entry. Rejections use `not_in_room`, `not_host`, `invalid_phase`, or `practice_blocked`; acceptance sends `room_state`, `game_state` and an immediate `field_state` in order.

Every `game_state` includes `mode`, exactly `competitive` or `practice`. Practice starts at Day, round 1, with the Host as a Villager and its only Roster entry; it creates no target Players. `remainingMs` is null throughout practice. No phase advances with elapsed time, and no elimination or faction victory occurs. Practice rejects `meeting_vote` with `invalid_action` and shows no ballot controls. Role selection and practice targets follow in #40; Tasks follow in #41.

The Host sends `advance_practice` with the current positive round and phase. Only practice accepts it. A wrong round or phase receives `invalid_phase`, preventing a repeated request from skipping a preview; a competitive Game receives `invalid_action`. Advancement cycles Day → Night → Discussion → Voting → Voting Result → Day, incrementing the round at each Day. Normal server movement checks and sleeping Night positions apply. Townhall restores retained Seats, and a new Day begins beside them. Practice movement timing resets at the actual manual transition time.

Recovery and takeover retain the Host's identity, appearance, mode, round, phase and accepted field position. Reservation expiry and Leave still end Membership, and remove the started Room when it becomes empty. New Join remains unavailable after practice starts. Competitive Start gates, durations, deadlines, voting and victory are unchanged.

## The Game

### Shapes

Every field below is always present; an absent value is explicitly `null`.

```json
RosterView   { "playerId", "displayName", "colour", "avatarPreset", "seat", "status" }
Ballot       { "voterPlayerId", "targetPlayerId" }
Outcome      { "kind", "callerPlayerId", "bodyPlayerId", "deaths", "eliminatedPlayerId", "eliminatedRole" }
RoleView     { "playerId", "role" }
Investigation{ "round", "targetPlayerId", "mafia" }
ChatEntry    { "channel", "round", "senderPlayerId", "senderName", "text" }
SelfView     { "role", "faction", "status", "killedByMafia", "mafiaTeam", "investigations", "meetingVoted", "meetingVote", "nightChoice" }
FieldPlayer  { "playerId", "x", "y", "facing", "ghost" }
OwnField     { "x", "y", "facing", "correction" }
```

`Role` is `"mafia"`, `"villager"`, `"doctor"` or `"sheriff"`. `Faction` is `"mafia"` or `"village"`. `status` is `"living"`, `"eliminated"` or `"left"`. `Outcome.kind` is `"night"` or `"meeting"`; the retained `callerPlayerId` and `bodyPlayerId` fields are always `null`. `GamePhase` is one of the seven phases below. A `Ballot` with `targetPlayerId: null` is an explicit Skip.

### Roles

Start deals the Host's accepted Role Setup, shuffles it and deals in Seat order. Mafia belong to the Mafia Faction; the other Roles belong to the Village. Each recipient receives only their own Role and, for Mafia, their team. Complete Roles are disclosed when the Game finishes. Mafia choose victims, Doctors choose protection, and Sheriffs investigate at Night.

### Phases and the clock

The server owns the clock. `GamePhase` and its fixed duration:

| Phase | Duration | What happens |
| --- | --- | --- |
| `role_reveal` | 8 s | Each Player privately learns their Role; Mafia learn each other. Round is `0`. |
| `day` | 180 s | Walk the town. No live abilities or emergency interruptions. |
| `night` | 20 s | Sleep in place; movement and all conversation are closed. |
| `discussion` | 90 s | Public chat for every living Player. |
| `voting` | 30 s | One ballot each, or an explicit Skip. |
| `voting_result` | 6 s | The Meeting's outcome, with every ballot disclosed. |
| `finished` | — | The winning Faction and every Role. |

`role_reveal` is round `0`; each Day increments the round, so the first Day is round `1` and a round runs Day through Voting Result. `remainingMs` is the milliseconds left in the current phase when the message was built, never negative, and `null` once a competitive Game is `finished` or throughout Solo Practice. A client counts it down from the moment the message arrived, not from when it gets round to applying it.

A timed phase ends when its deadline passes, never when everyone has acted. Each new deadline is derived from the deadline it replaces, not from the current time. Night never ends early based on private activity. Every Participant in the Room receives a `game_state` at each transition.

### Day and sleeping Night

Every Day begins with Participants standing beside their own retained Seats. Townhall returns them to those Seats after Night.

**Movement.** `move` carries only the sender's position. The server accepts it only during `day`, from a Participant who has not left, when the point and midpoint from the last accepted position are clear of obstacles and inside the town, and the distance is within `240 px/s × 1.4 × elapsed + 24 px` (elapsed clamped to 50 ms – 1 s). A refused Day step keeps the position and increments `correction`; the start of Day and return to Seats also increment it. Clients adopt the server position when that counter changes. Night movement is ignored without changing accepted position; other seated phases also accept no movement. Outside a started Game, `move` receives `invalid_phase`. Non-finite coordinates, invalid Facing or extra fields are `malformed_message`.

**The field.** `field_state` is built per recipient. It holds only visible Avatars, themselves included, and the recipient's accepted position and `correction`. All living recipients share 320px Vision, covering the five-tile (160px) hearing range. They receive living Participants only within that distance and in the same interior or outdoor area. The four interiors are the served map's room rectangles: Chapel, Inn, Smithy and General Store; every other point is outdoors. Area membership uses accepted Avatar feet, includes top/left boundaries and excludes bottom/right boundaries. Existing doorways, walls and furniture use the same authoritative collision checks as outdoor movement. Eliminated recipients see every Participant who has not left; `ghost` marks eliminated Participants, who are invisible to the living. No Body, Vanish, ability timer or Crowding field is sent. Night retains the same authorized field at sleeping positions and the client disables movement prediction.

**Retired requests.** `use_ability` is no longer a supported message type and receives `unknown_message_type`, including kill, shield, scan, vanish, report and emergency payloads. Neither Game rules nor the interface offer those live actions. `roam` and `meeting_call` are no longer phases.

### Night choices

`night_choice` carries the current positive `round` and a living `targetPlayerId`, or `null` to withdraw. Living Mafia choose Village victims; living Doctors choose protection for any living Participant, including themselves or a Mafia Participant. Living Sheriffs investigate one other living Participant; self-investigation receives `invalid_target`. Choices remain editable until the fixed twenty-second deadline; no submission shortens Night. Wrong phase or round receives `invalid_phase`, an ineligible actor receives `invalid_action`, and unknown, non-living or Mafia victim targets receive `invalid_target`. Missing fields, extra fields and malformed values receive `malformed_message`.

Acceptance sends only the submitter a `game_state`; `self.nightChoice` restores their own accepted target on recovery and is `null` for everyone else and after resolution. No teammate choice or activity count is disclosed. Disconnect preserves choices and keeps the Participant in the majority; Forfeit withdraws their choice and removes them from the denominator. Choices targeting a Participant who is no longer living do not count.

At the deadline, a strict majority of all living Mafia must agree on one living Village victim. Missing choices, disagreement and an insufficient majority cause no kill. Every living Doctor's accepted choice protects their target before the kill; protection by any one Doctor prevents that victim's death. A missed or withdrawn choice protects nobody. All timely Sheriff investigations resolve privately against the living roster before any death is applied, including when the Sheriff is that Night's victim. Results disclose only `round`, `targetPlayerId` and `mafia` (the target's Faction), are retained in the Sheriff's `self.investigations`, and recover only to that Sheriff. Missing or withdrawn choices produce no result. The server resolves the outcome under the Room lock, marks an unprotected victim eliminated and `killedByMafia`, and publishes `kind: "night"` with the victim's ID in `deaths`, or an empty list. All Participants return to retained Seats. Victory is checked after the complete outcome; parity enters `finished` immediately with that outcome, otherwise Townhall discussion begins. Choices clear at resolution and do not carry into later rounds.

### Meetings

`meeting_vote` carries its current positive `round` and is accepted only in `voting`, only from a living Participant, and only once. A non-null target must be a living Participant, including the voter themselves. `targetPlayerId: null` is an explicit Skip and locks exactly as a ballot for a Player does. The client sends this message only when Confirm ballot is pressed; selecting or changing a preview sends nothing. An unconfirmed preview whose target is no longer living is cleared. A Player is eliminated only by a strict majority of the living; a plurality is not enough.

Wrong-phase or wrong-round submissions receive `invalid_phase`; ineligible voters receive `invalid_action`; a repeated ballot receives `already_submitted`; a non-living or unknown target receives `invalid_target`. A rejection is sent only to the submitter. Acceptance sends only that voter a `game_state` with `self.meetingVoted: true` and their `self.meetingVote` (null for Skip). `ballots` remains null until the result. Recovery restores the voter's lock and choice in their own `self` view. Public chat stays available during the full thirty-second voting phase, which never ends early because everyone confirmed.

At Voting Result, `ballots` discloses every ballot cast, Skips included, and `outcome` is `{ "kind": "meeting", "eliminatedPlayerId": …, "eliminatedRole": … }` with the other fields `null` or empty. An elimination reveals exactly that Participant's Role (`mafia`, `doctor`, `sheriff` or `villager`) through `eliminatedRole`; when nobody is eliminated both elimination fields are `null`. Other Roles remain private until `finished`. The result lasts the full six seconds before the next Day or final victory presentation.

### Chat

`send_chat` carries `channel: "public"` and `text`. Text is trimmed and must be 1–240 Unicode code points; unknown channels (including `mafia`) and malformed text receive `malformed_message`. During Day, only living Participants in the sender's same area and within five tiles (160 pixels) of the accepted position receive text. Interior boundaries exclude exterior listeners. During discussion and voting, living Participants can send to all attending Participants, including eliminated read-only listeners. Night rejects text with `invalid_phase`; eliminated senders receive `invalid_action`. Each entry retains its send-time recipient set: later approach and recovery cannot grant past proximity messages.

The server records the recipients of each entry and delivers `chat_message` only to them. On recovery a Participant receives `chat_history` holding exactly the entries they are entitled to read; it replaces the client's log rather than adding to it. Eliminated Players can read what they could read while living but cannot speak.

### Privacy

`game_state` is built per recipient. `mode`, `phase`, `round`, `remainingMs`, `outcome`, `ballots` and `winner` are the same for everyone; `players` is the same for everyone; `self` is that recipient's own view and nothing else. A non-Mafia recipient's `mafiaTeam` is `null`, not a filtered list, and a non-Sheriff's `investigations` is `null`. `field_state` is built per recipient too. Nothing private is ever sent to a client that merely declines to draw it.

An accepted `meeting_vote` updates only its submitter's authorized `game_state`. Broadcasting private choices would leak activity through countdown delivery. Phase transitions and public departures update current recipients in Room order.

### Departure and the end of the Game

The Game Roster outlives Room Membership. When a Membership ends through Leave or recovery expiry, a living Participant Forfeits: their status becomes `left`, their own ballot is withdrawn, they leave every field, and they stop counting toward every majority and toward victory. A Disconnect alone forfeits nothing — the Participant stays `living` for the whole recovery reservation, stays where they stood, remains in every denominator, and their locked ballot survives their return.

Roster entries remain in `players` with their Seat and Display Name after the Membership ends, so the table never renumbers and a departure is visible as a departure. Only a living Participant Forfeits, so an Eliminated Player who leaves stays `eliminated`; a client shows any roster entry without a current Room Membership as an empty Seat marked Left.

Victory is checked after every elimination and every Forfeit. The Village wins when no Mafia is living; the Mafia win when living Mafia are at least as many as living Village.

A Forfeit that decides the Game enters `finished` at once, mid-phase. A victory decided by a Meeting's elimination is announced first: the Voting Result runs in full, so the Players see how everyone voted, and the Game enters `finished` at that phase's own deadline. A Forfeit during a Voting Result whose elimination already decided the Game still counts, but it does not cut that announcement short.

Once `finished`, `winner` carries the Faction, `roles` reveals every Participant's Role, including those who were eliminated or left, and every death is revealed. `remainingMs` is `null` and the Game state no longer changes: a later Leave or expiry ends only the Membership and forfeits nothing.

## Membership recovery foundation

Entry snapshots privately carry a 64-character lowercase hexadecimal recovery credential, generated from two random UUIDs. `recover_room` requires that credential and its Room Code; neither Player ID nor Display Name authorizes recovery. Credentials never appear in Player Views, broadcasts, or Room State. A successful recovery returns the current snapshot and the same credential. The client stores the credential and Room/Display Name intent in sessionStorage for same-tab refresh. Independent tabs have independent intent; duplicated tabs inheriting credentials use the replacement rule. Storage failure falls back to in-memory recovery.

A server-detected Disconnect reserves membership for exactly 120 seconds. Recovery is allowed strictly before the deadline; at or after it the membership ends. Expiry is checked synchronously during Join/Recover and by a 200-millisecond sweep, the same sweep that advances Game phases; whichever deadline is earliest is applied first. Failed attempts never renew the deadline. A later Disconnect after successful recovery starts a new window. Invalid or expired credentials receive `recovery_expired` (“Your place in the Room expired”); an unavailable Room receives `room_not_found`. These are terminal and never cause an implicit fresh Join. A valid recovery atomically replaces an active connection. The server retires its authority and closes it asynchronously with WebSocket application close code **4001**, reason “Connection replaced”. The displaced client clears stored intent and applies a terminal explanation at the next frame boundary. Retired readiness, Avatar selection, Start, Game, chat, Leave and close callbacks cannot affect the membership. The client still treats legacy `recovery_in_use` as retryable.

Disconnect and recovery broadcast structural `room_state` events carrying connected presence. Expiry broadcasts `player_left` with reason `expired`. Recovery replaces the connection binding and returns a complete snapshot, followed for a Participant by that recipient's `game_state` and `chat_history`, and during Day or Night by an immediate `field_state`. Retired socket callbacks cannot end the recovered membership.

Expired recovery shows “Your place in the Room expired” and “Back to lobby selection” in either phase. The action clears recovery intent and returns to the normal Create Room / Join Lobby form without sending Join or Create. Joining through that form begins a new membership only if the Room is still a Lobby; it cannot restore the expired membership. `room_not_found` explains that recovery cannot continue. Other explicit non-retryable recovery errors are terminal.

Leave during recovery clears local intent immediately. A separate socket makes one bounded ten-second attempt, sending `recover_room` followed by `leave_room` in WebSocket order, then closing on `room_left`, error, or timeout. It never forwards snapshots into the game or starts retries; unreachable reservations expire naturally. Acknowledged intentional Leave still ends membership without reconnecting. Server restart clears Rooms and recovery state.

These changes extend protocol v1 for the coordinated local client/server release; older clients missing the Game mode or using Roam phases, live abilities or retired field data must be updated together with the server.


## The Published Avatar Collection

`GET /rooms/{roomCode}/avatars` returns the collection a Room pinned at creation. The Room Code is trimmed and uppercased as Join trims it. An unknown, expired or never-created code returns `404` with no body. A successful response is:

```json
{ "version": 1, "collectionId": "8f2a1c09b4d7e615", "presets": [ { "id": "townsperson-1", "name": "Rowan", "sprite": "data:image/png;base64,…", "seatedSprite": "data:image/png;base64,…" } ] }
```

A collection holds at least one preset and has no upper bound. `collectionId` is derived from the publication's content, so two Rooms pinning the same publication report the same identifier. Both artwork fields are inline `data:image/png;base64,` sprite sheets: `sprite` is four rows of nine 64×64 frames, of which only the standing pose of each row is drawn, and `seatedSprite` four rows of eleven. Browser origins are allowed as for the WebSocket endpoint.

Clients fetch this on join, keyed to the Room they are entering, and create every texture before rendering the Room. At page load a client does not yet know which Room it will enter, so it cannot know which collection it needs. Reconnect keeps the collection its membership already has.

The developer editor validates distinct complete compatible saved recipes before atomically replacing the publication file, which the backend reads. Source layers, drafts and authoring endpoints are absent from the Player build. Publishing takes effect for Rooms created from then on, with no rebuild and no restart; a running Room keeps the collection it was created with, and superseded collections stay in memory only while some Room still references one.

## Persistent Tasks (#32)

Each Village Participant receives three real assignments at the existing fourteen map Task points once, including Doctors and Sheriffs. `task_state` is built for one recipient: `{version:1,type:"task_state",tasks,completed,total,activeTaskId,remainingMs}`. `tasks` contains only their assignments; each is `{taskId,name,kind,x,y,step,steps,fake,sequence}`. Repair has `kind:"repair"`, three steps and an empty sequence. The current target is `(x,y)`; `completed` counts fully completed real Tasks and `total` retains the original real workload. Others receive only their own assignments plus this aggregate, never the actor's stage or location. Task snapshots accompany Start, phase transitions and recovery.

`open_task` has exactly `{version:1,type:"open_task",round,taskId}`. It starts a four-second repair interaction only during the submitted Day, for the owner of an unfinished assignment within 64 pixels in the same map area. `task_step` has exactly `{version:1,type:"task_step",round,taskId,step,value}`; non-negative integer `step` must equal current progress and repair `value` must be `0`. Ownership, position and server elapsed time are rechecked. Replay, remote interaction, unknown assignment, unfinished timing and incorrect progress receive `invalid_task`; wrong phase/round receive `invalid_phase`. `close_task` has only version and type and discards unfinished interaction time. Moving out of range or changing phase closes interactions while retaining completed steps. Recovery restores accepted steps and current interaction timing. Accepted partial steps send only the actor a Task snapshot; a completed Task sends each recipient their own snapshot with the new aggregate. Unknown or malformed fields remain explicit decoding errors.

Sequence assignments (#33) use `kind:"sequence"` with their ordered zero-based control values in the recipient's `sequence` array. `steps` equals the sequence length. Each open interaction takes at least one second, and `task_step.value` must equal the next sequence input. Wrong values and replayed stages receive `invalid_task` without advancing progress. Earned inputs persist across Days and recovery. The same personal overlay displays the pattern and numbered controls.

Delivery assignments (#34) use `kind:"delivery"` and two stages. Stage zero collects the assigned item, then stage one changes the private target coordinates and label to the delivery destination. Both interactions take one second and require `value:0`; the server rechecks the same-area range at pickup and delivery. The odd step represents the carried item, retained across later Days and recovery. Duplicate pickup or delivery, wrong destination and unassigned requests never advance progress.

Mafia receive three Fake assignments (#35) through exactly the same repair, sequence and delivery request validation and personal overlay. Their own `fake:true` marks them privately. Real assignment ownership cannot be forged and fake progress is excluded from both aggregate counters. Fake actions notify only their actor; they cannot broadcast activity, complete a real Task, or trigger Village victory.
