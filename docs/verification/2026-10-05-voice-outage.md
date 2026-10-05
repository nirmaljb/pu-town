# Independent voice outage recovery (#54)

SDK reconnection reports voice reconnecting while Game transport remains active.
If media stops permanently, a separate timer requests fresh current grants with
backoff from 500 ms to five seconds. It does not reconnect the Game WebSocket,
change its round, suspend movement/Tasks/text or drive the server clock. Leave
voice cancels intent and pending retries even while no media room is connected.
Recovery starts muted; eligible phases and publication remain server-authorized.

Frontend tests verify bounded independent retries, idempotent start and canceled
callbacks. Full frontend suite: 101 passed, typecheck and build passed.
`tools/voice/verify_outage.py` owns a dedicated SFU child and tests real native
media failure/recovery, accepted movement and text during the outage, and the
original Day deadline. It passed: accepted movement/text during the abrupt SFU outage, nonzero PCM
after service restart with the same Game connections and round, and transition
to Night within two seconds of the original server Day deadline. Browser automation
is waived; this native proof does not establish the browser reconnect UI.

This native proof exercises SDK media resume; it does not exercise the browser
controller’s fallback/UI. Review added a late-grant-after-Leave controller
regression (red before green); canceled intent now refuses and retires the grant.
Shared failure handling avoids divergent reconnect status. The full frontend
rerun passed 102 tests, typecheck and build. No documented Standards breaches.
