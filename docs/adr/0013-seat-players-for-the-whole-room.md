---
status: superseded by [ADR 0015](0015-roam-the-town-with-server-owned-sight.md)
---

# Seat Players for the whole Room and remove free movement

The Game is a ten-Player discussion at one table: Players read a countdown, choose a target from a list, and talk. Nothing in it is decided by where an Avatar stands. Free movement was therefore carrying no gameplay meaning while owning the client's input loop, the server's position validation, and the outbound queue's coalescing rule.

A Player now takes a Seat when their Room Membership begins and keeps it until that Membership ends — Lobby, Start and the whole Game alike. Seats are never reassigned or vacated on Start, `seat` is never null on the wire, and Facing follows the Seat inward. The `player_moved` broadcast is gone, and with it local prediction, the movement send cadence, and keyboard control.

This supersedes the coalescing half of ADR 0004. With no movement to supersede, `ConnectionOutbox` became a strictly ordered bounded queue that replaces nothing: a connection that cannot keep up is closed and recovers a complete snapshot, which is what the queue already did for structural events. Per-Room serialization, the other half of ADR 0004, is unchanged and now matters more, because every Game transition is structural.

This also retires ADR 0001. With no position a client can submit, there is nothing left to validate: `move_player`, `movement_correction` and the `sequence`/`epoch` counters are gone from the protocol, and a client that sends one receives `unknown_message_type`. What ADR 0001 was protecting — that a client cannot place its own Avatar where it likes — now holds by construction, because the only position a Player has is the Seat the server gave them.

The cost is that the Room can no longer express anything spatial, and restoring free movement later would mean restoring prediction, validation and coalescing together rather than one at a time. That is accepted: the Game's own state — phase, round, Roles, votes and chat — is where its complexity belongs, and keeping Avatars seated made per-recipient privacy and the frame-boundary contract simpler to reason about, not harder.

**Superseded.** The Game now has a Roam in which Players walk, so movement is back; Seats still hold Players in the Lobby and in every Meeting. See [ADR 0015](0015-roam-the-town-with-server-owned-sight.md).
