# Serialize room events and coalesce queued movement

State transitions and outbound-event creation are serialized independently within each room, while each connection uses a bounded outbound queue and concurrent-session protection. Structural events retain their order, but superseded unsent movement updates for the same player are coalesced; this prevents slow clients from growing memory without imposing a global game lock or treating every transient position as durable history.
