---
status: partly superseded by [ADR 0013](0013-seat-players-for-the-whole-room.md)
---

# Serialize room events and coalesce queued movement

State transitions and outbound-event creation are serialized independently within each room, while each connection uses a bounded outbound queue and concurrent-session protection. Structural events retain their order, but superseded unsent movement updates for the same player are coalesced; this prevents slow clients from growing memory without imposing a global game lock or treating every transient position as durable history.

**Partly superseded.** Per-room serialization stands and now carries every Game transition. Movement coalescing is gone with movement itself: the outbound queue is strictly ordered and replaces nothing. See [ADR 0013](0013-seat-players-for-the-whole-room.md).
