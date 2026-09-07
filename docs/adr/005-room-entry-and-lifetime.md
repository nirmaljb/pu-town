# Explicit Room creation and expiring Room Codes

Only Create Room allocates a Room; Join uses a server-generated six-character code and never implicitly creates one. Codes are collision-checked against the registry. Empty Rooms stay available for five minutes so reconnecting Players can recover their Room, then expire. This intentionally trades permanent codes for bounded idle state. An expiry check during Join enforces the deadline even between cleanup sweeps.

Room transitions and expiry share stable, ordered striped locks. This prevents deletion and code reuse from creating two lock identities for the same code, without retaining a lock for every expired Room. Hash collisions can serialize unrelated Rooms; socket delivery remains asynchronous through bounded outboxes.

Room Membership is confirmed only by a Room Snapshot. The client freezes movement outside confirmed play, uses application heartbeats to detect silent loss, and rejoins the confirmed code within a bounded recovery window. Intentional Leave and cancellation close without automatic rejoin. Network lifecycle messages are processed at the beginning of game frames before world reconciliation.
