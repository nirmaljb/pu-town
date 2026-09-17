---
status: superseded by [ADR 0013](0013-seat-players-for-the-whole-room.md)
---

# Server validates client-calculated movement

The client calculates avatar movement locally and sends absolute positions so that controls remain responsive without requiring a server simulation loop. The server accepts and broadcasts a position only after checking that its coordinates are finite, within the room bounds, and plausible for the player's movement speed; this provides a practical authority boundary for the first vertical slice while leaving full server simulation as a future option.

**Superseded.** Players are now seated for their whole Room Membership and the protocol carries no movement, so there is no submitted position left to validate. See [ADR 0013](0013-seat-players-for-the-whole-room.md).
