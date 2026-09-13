# Model the Lobby as a phase of the existing Room

The Lobby is a waiting phase of a Room, with server-owned Host, clockwise seat assignments and membership readiness. Start changes that same Room to active play; Room Codes and the existing Leave, Disconnect, capacity and expiry lifecycle remain shared. This avoids introducing a second membership or transport lifecycle for the Town Hall.

Readiness, Start and Host succession broadcast a complete structural `room_state` under the existing per-room serialization. At ten Players, the small bounded payload is preferable to separately ordered phase, seat, spawn and Host deltas that clients could render inconsistently. It preserves the recipient's identity; only `room_snapshot` confirms new membership. Structural events are barriers to movement coalescing, preventing a later movement from being delivered before an older full state. Socket delivery stays asynchronous.

The Host may start with any nonempty group regardless of readiness for the current testing version. This is deliberately not a production start gate. The final departure resets phase to Lobby while retaining the existing empty-Room expiry. Reconnect creates a new membership and follows the current phase without reserving seats or reclaiming Host authority.
