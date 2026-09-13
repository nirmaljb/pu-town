# Lobby sitting animation

Players receive their Seat automatically on Join and remain seated until the game starts. There is no walking to a chair or chair-selection interaction.

An arriving Avatar lowers into its assigned chair over 420 ms, then holds a seated idle pose. All six Avatar Presets retain their existing LPC head, hair and upper-body artwork; pixel-drawn bent legs and shoes use the corresponding trouser palettes. Heads and torsos retain their original proportions. Four-direction Facing continues to point inward.

On a Room Snapshot, existing occupants appear seated immediately and only the joining Player animates. Later arrivals animate for observers, including arrivals queued in the same game frame as the snapshot. Reconnect follows the same rule for its new Room Membership. Readiness and Host updates never restart sitting. Start immediately cancels sitting and restores the full standing/walking sprite; Leave removes the Avatar and its animation state. A delayed frame settles the transition without replaying it.

Animation timing is client presentation state. The server continues to own seat allocation, Facing, positions and Room phase. Arrival information is retained while draining the inbox, and reconciliation still runs once at the game-frame boundary. No wire-contract change is needed.

Automated coverage combines the real inbox/frame boundary with seating timing to check snapshot and arrival ordering, readiness, repeated snapshots, Host updates, Start, Leave, Reconnect and delayed frames. Run the full frontend checks, then use two clients to check Join, Ready, Start and Leave visually. The artwork gallery at `/test/sitting-preview.html` displays all six presets in every Facing for manual inspection.
