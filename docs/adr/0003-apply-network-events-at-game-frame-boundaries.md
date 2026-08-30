# Apply network events at game-frame boundaries

The WebSocket layer validates incoming messages and queues them without touching Phaser objects or mutating live world state. At the beginning of each Phaser update, the scene drains the inbox through a pure world reducer and then reconciles view objects; this extra boundary makes network timing deterministic, keeps the state logic independently testable, and prevents transport and reconnection concerns from leaking into Phaser entities.
