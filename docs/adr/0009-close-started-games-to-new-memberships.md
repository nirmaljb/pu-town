---
status: accepted
---

# Close started games to new memberships

Starting a game closes its Room to new Room Memberships, including fresh Join after recovery expires or intentional Leave. Enforce this on the server so knowing a Room Code cannot bypass the rule. This keeps participation fixed after Start while preserving continuity for existing Players: the current server-owned 120-second recovery window remains available in both Lobby and active play, retaining Player ID and appearance. A membership reserved in the Lobby follows the Room into active play if the Host starts during its absence.

Expired recovery offers no Join again shortcut in either phase. Show “Your place in the Room expired” and a “Back to lobby selection” action that clears recovery intent and returns to the normal Create Room / Join Lobby form. Joining from that form requires a Room still in its Lobby; it cannot restore an expired membership or enter a started game as a new Player.

Remove a started Room when its final membership ends, whether through Leave or expiry; do not reset it to a Lobby. Recoverable disconnected memberships still keep the Room alive, even when nobody is connected. A Room that has never started retains the existing five-minute empty-Lobby lifetime. Removing a started Room prevents its old game from being reopened through the same Room instance, trading code continuity for an explicit new-game lifecycle.

This revises the active-play entry and empty-Room reset rules in ADRs 005 and 006, and the Join again and final-membership reset rules in ADR 0008. Other recovery, refresh/takeover, Host succession, and transport-health rules remain as established in ADR 0008. The protocol documentation, README, operational guidance, implementation, and affected tests must be synchronized when implementing this decision.
