---
status: proposed
---

# Preserve Room Membership across temporary connection loss

The agreed design direction is to retain Player identity and Avatar Preset through tab switches, temporary network loss, and refresh of the same tab. Appearance belongs to the Room Membership; retaining it across intentional Leave, other Rooms, or future visits is outside this change. A healthy connection keeps its membership regardless of tab visibility, with movement input cleared on focus loss.

Recover an existing membership after connection loss rather than assigning a new Player ID and random Avatar Preset. This trades temporary retention of disconnected memberships for continuity. Merely remembering appearance would still reset other membership state, and correcting false heartbeat timeouts alone would not cover real connection loss. Connection health checks must tolerate a suspended game loop while preserving frame-boundary application of shared world state.

This proposal revises ADR 006's new-membership-on-reconnect decision and will require synchronized lifecycle and protocol documentation. CONTEXT.md records the agreed target vocabulary; implementation and the current protocol still use the old lifecycle. No runtime behavior has changed.

After the server detects connection loss, reserve the membership and its capacity for two minutes. Recovery within that window preserves Player ID, Avatar Preset, Colour, Seat, readiness, last server-accepted position, and Facing, subject to subsequent Room events. Starting the game during an absence moves the retained Player into active play along with the Room; recovery does not restore an obsolete Lobby state. Expiry releases the membership's place.

A disconnected Host has 15 seconds to recover before Host transfers to the longest-present connected Player, if one is available. A returning former Host does not reclaim transferred authority. Disconnected Players remain visible and stationary, with subdued appearance and a “Reconnecting…” label until recovery or expiry. A healthy background tab does not display that label.

Recovery uses a private server-issued credential, never a Display Name or public Player ID as proof. A valid recovery connection atomically replaces the previous connection; retired connections cannot act or remove the recovered membership through late callbacks. Ordinary additional tabs join independently. If a duplicated tab copies the credential, it takes over the membership and the displaced tab stops retrying. Credential handling must support refresh of the same tab; recovery after closing and reopening a tab or on another device is outside the initial scope.

Automatic retries continue throughout the recovery window with increasing delays capped at five seconds, and run immediately on return from tab suspension. Failed attempts do not extend the server-owned reservation deadline. Expired recovery never silently creates a new membership: show “Your place in the Room expired” and offer an explicit Join again action that explains the new Player and appearance. Server restart clears recovery state and Rooms, and the interface explains that the Room is no longer available.

While any recoverable membership remains, an all-disconnected Room retains its phase. If the Host grace period has elapsed without a connected successor, the first returning Player becomes Host. Only the end of the final membership resets the Room to an empty Lobby and starts the existing five-minute empty-Room expiry.

Leave Room is available during recovery. It immediately stops local retries and discards local recovery credentials; the client releases the membership on the server when reachable. If release cannot be delivered, the reservation expires naturally. Returning to the join form never automatically resumes an abandoned membership.

## Implementation constraints

Transport health bookkeeping must not depend on Phaser frames advancing. Returning from suspension must allow a fresh health check with a fresh response deadline rather than closing a socket solely because the game loop paused. Shared state, connection lifecycle effects, and Avatar reconciliation still apply at frame boundaries. Recovery returns a current Room Snapshot, discards stale local prediction, and fences movement from retired connections. Recovery and expiry must preserve per-room serialization and bounded asynchronous outbound delivery.

Implementation must synchronize the Java and TypeScript protocol contracts, protocol documentation, README, repository operational guidance, and affected ADRs. Verification must cover background-tab return, refresh, genuine network loss, takeover, expiry, Host succession, all-disconnected Rooms, and Leave during recovery, including relevant two-client browser paths. The tab-suspension trigger has been identified from code but has not yet been reproduced in a browser.

All interview decisions are recorded; this ADR remains proposed pending confirmation of the complete design. No implementation is authorized by this brainstorming document alone.
