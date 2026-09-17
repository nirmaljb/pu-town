# Basic Mafia game — agreed rules

Status: all interview rule questions are settled. The user requested spec publication through to-spec and approved the proposed testing boundaries. The canonical implementation spec is [GitHub issue #12: Build the basic ten-player Mafia game loop](https://github.com/nirmaljb/pu-town/issues/12), published with ready-for-agent. This local interview record describes the intended Game, not the current runtime.

## Start and role assignment

The Host may start only with exactly ten connected, Ready Players. Randomly assign three Mafia, five Villagers, one Doctor, and one Sheriff. Doctor and Sheriff belong to the Village faction. Roles are independent of Avatar Presets, Player Colours, Display Names, and Seat order.

Privately reveal each Player's Role and Faction immediately after Start. Mafia also know all Mafia identities; Village Players initially know only their own Role. There is no faction-based seating. Players retain their assigned Seats throughout this version; there is no free movement or exploration phase.

## Phase sequence

| Stage | Duration |
| --- | --- |
| Initial private role reveal | 8 seconds, once |
| Night | 90 seconds |
| Night outcome announcement | 6 seconds |
| Meeting discussion | 120 seconds |
| Meeting voting | 30 seconds |
| Voting result animation | 6 seconds |

Repeat from Night unless a faction has won. The server advances automatically, including when the Host is disconnected or eliminated. Timed phases do not finish early when everyone has submitted; a faction victory still ends the Game. There are no Host pause, phase-skip, or restart controls. The final result screen remains until Players leave, subject to existing recovery and Room lifetime rules.

## Confirmed choices

Clicking a target previews the choice locally. An explicit Confirm vote, Confirm protection, or Confirm investigation button submits it. Only confirmed choices reach the server or become visible to Mafia teammates.

Every submitted choice is final for its applicable phase: Mafia votes, Doctor protection, Sheriff investigation, and Meeting ballots including Skip. No change or withdrawal is allowed. Refresh and Reconnect preserve the choice and its lock. A subsequent phase allows a new choice, subject to the Role's targeting restrictions.

If the chosen target forfeits, the choice becomes ineffective but stays locked; there is no replacement selection that phase. A temporary Disconnect does not invalidate a target or their submitted choice. Missing submissions mean no action or no ballot, as applicable.

## Night

Ordinary Villagers see a darkened sleep screen, a message such as "Night has begun and you went to sleep", and the countdown. Living Players with Night actions receive their appropriate private controls during the same countdown.

### Mafia

Living Mafia may chat privately during Night. Each may confirm one living Village target; confirmed votes are visible to living Mafia teammates. An attack requires more than half of living Mafia to select the same target: two votes with three living Mafia, two with two, or one with one. Otherwise there is no attack. Disconnected living Mafia count toward the majority. Mafia can attack at most one Player per Night.

### Doctor

The Doctor may protect one living Player, including themselves. The same Player cannot be protected on consecutive Nights. The restriction compares adjacent Nights: protect Alice, take no action the next Night, then protect Alice again is allowed.

Protection blocks the Mafia attack if it targets the protected Player. If Mafia kill the Doctor while the Doctor protects someone else, that protection has no other attack to block. Self-protection can save the Doctor. No submitted protection means no protection. Do not privately confirm whether protection stopped an attack.

### Sheriff

The Sheriff may investigate one other living Player. At Night end, privately return Mafia or Not Mafia, never an exact Role. A Sheriff killed that Night receives no result. Repeating an investigation on a later Night is allowed. Private investigation history survives refresh and Reconnect.

### Resolution and disclosure

Resolve Night actions together. Announce the victim publicly, without revealing their Role, or announce that nobody died without distinguishing a blocked attack from no attack. A successfully killed victim sees only "You were killed by the mafias"; no attacker or Mafia voter identity is disclosed to the victim.

## Meeting

Living Players may use public text chat during discussion and voting. Voting begins after discussion. Each living Player may confirm a ballot for one living Player, including themselves, or explicitly Skip. Meeting ballots remain hidden until the deadline, then who voted for whom is revealed.

Elimination requires more than half of all living Players to select the same target. Disconnected living Players remain in that denominator; Skip and missing ballots do not reduce it. Ties or insufficient votes cause no elimination. The result animation publicly reveals an eliminated Player as Mafia or Not Mafia, without distinguishing Doctor from Sheriff.

## Elimination, Seats, and chat history

Eliminated Players may watch public Meetings but cannot chat, vote, use abilities, or receive subsequent Mafia messages. They remain as dimmed seated Avatars marked Eliminated and cannot be targeted. Departed Players leave empty Seats marked Left. Never rearrange the remaining Seats.

Preserve the original Game Roster for voting history and the final Role reveal, including Players who have forfeited or left after elimination. Elimination alone does not end Room Membership.

Preserve public Meeting history and each Player's previously authorized private chat for the current Game, restoring them on Reconnect. Eliminated Mafia retain earlier messages but receive no subsequent Mafia messages. Chat history does not carry into another Room. This version has no voice, ghost chat, or private Mafia chat outside Night.

## Disconnect, Reconnect, and Forfeit

Disconnect retains membership and living status for the existing 120-second recovery period. Phase clocks keep running. Submitted choices and their locks survive; missing choices mean no action. Reconnect restores Role, current phase, and authorized history. Disconnected living Players remain valid targets and count toward victory and majorities.

Leave or recovery expiry causes a living Player to Forfeit and removes them from living counts. Remove the forfeiting Player's pending actions and ballots. Choices targeting them become ineffective without permitting replacement submissions. Calculate majorities using the living roster at resolution. Forfeit can decide the winner; it does not abort the Game. A Player who has already been eliminated cannot change living counts by leaving.

Fresh Join remains unavailable after Start. The Game Roster grants no recovery or entry rights and does not keep a Room alive after its final membership ends; see ADR 0012.

## Victory and another Game

Check victory after simultaneous Night resolution, Meeting elimination, and Forfeit:

- Zero living Mafia: Village wins.
- Living Mafia at least equal to living Village: Mafia wins.

Reveal all original Players' Roles on the final result screen. Another Game requires a new Room; there is no rematch or Lobby reset. Existing started-Room removal and recovery rules remain in effect.

## Implementation implications and verification

This changes the testing-only Start gate in ADR 006, which currently permits one through ten Players regardless of Ready and includes disconnected reservations. The current Start also clears Seats and opens free movement; server validation, client decoding, and rendering must instead support seated Game phases.

The server owns roles, actions, deadlines, chat authorization, outcomes, and recipient visibility. Public Room State must not carry secret information for the client to hide. Recipient-specific snapshots and events must provide only authorized information, including on recovery. Preserve strict decoding across Java, TypeScript, and protocol documentation, per-Room serialization, bounded asynchronous delivery, and client frame-boundary application. Membership state and the retained Game Roster have different lifetimes as recorded in ADR 0012.

Implementation must update the protocol documentation, affected tests, README, and operational guidance together. Verification must cover role distribution and the Start gate; strict majorities and self-votes; immutable confirmed choices; protection cooldown and self-protection; Sheriff privacy and death; channel visibility and history; timed progression; Forfeit and Disconnect differences; recovery of locked actions; victory; and retention of departed Players in results. Run both component suites and exercise the Game with ten browser clients, including recovery and recipient privacy checks. Do not claim runtime verification from document review alone.

No runtime implementation or protocol changes have been made for this design. No rule questions remain open; implementation is specified in GitHub issue #12.
