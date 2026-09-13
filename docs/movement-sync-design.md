# Movement and Facing synchronization

This document records the agreed behavior and proposed implementation approach. Implementation is authorized and the coordinated contract is specified in `websocket-protocol-v1.md`.

## Agreed behavior

- Local movement responds immediately. Other clients follow after network delay and agree on the final position after movement stops.
- Older server echoes must not discard newer valid local movement. Rejected positions need recovery to the server's accepted state.
- Clients recover synchronization after switching tabs or minimizing and restoring a client, using the existing Reconnect lifecycle when needed.
- Facing must agree across clients after an Avatar stops, without requiring the Player to move again.
- Facing is explicitly shared and retained by the server, including in state sent to later arrivals.
- Arrow keys remain the only movement controls. Directional input changes Facing even when a Room boundary blocks displacement; releasing the keys retains Facing.

## Source findings

The scene and Avatar reconciler overwrite local predicted positions when authoritative coordinates change. Movement rejection currently supplies an error without an authoritative position correction.

Facing is inferred independently from rendered position differences in each client. Movement messages and Player Views contain no Facing. The sender samples movement every 50 ms, the receiver reduces queued events before rendering, and the server may coalesce queued movement. Consequently clients may observe different movement segments even when their final positions agree. The current protocol explicitly documents this position-derived Facing behavior.

These findings identify failure mechanisms; the reported two-client symptom has not yet been reproduced in browsers.

## Implementation approach

- Include validated four-direction Facing in movement submissions, broadcasts and Player Views. Final updates carry Facing even when position is unchanged. Preserve the current vertical preference for diagonal input, inward Facing for seated Lobby Avatars, and down-facing active-play spawn.
- Derive local Facing from arrow-key input, not from server corrections. Render remote Facing from shared state. Walking animation remains presentation state; standing retains shared Facing.
- Correlate movement submissions with server responses using monotonically increasing movement sequence numbers within the current membership. Accepted responses acknowledge older submissions without rewinding newer local prediction.
- Return an explicit authoritative correction for rejected movement. Reset to accepted state and discard invalid prediction; ensure outstanding responses cannot resurrect the discarded state. Keep corrections ordered with structural events.
- Send the final unsent position and Facing on stopping. Coalesce only superseded updates; queue pressure must not silently discard the only remaining final state without disconnecting and recovering the client.
- On loss of focus, clear held controls to prevent unintended movement. On restoration, apply queued state before accepting new input and use the existing Reconnect lifecycle when necessary. Do not turn time spent in the background into catch-up movement.
- Preserve server position validation, per-room serialization, bounded asynchronous delivery, and application of network events at game-frame boundaries. Update Java and TypeScript contracts, protocol documentation and affected tests together.

The Facing decision is recorded in ADR 0007. Protocol v1 defines `sequence` acknowledgments and server-issued `epoch` corrections, including structural ordering and stale-submission handling.

## Verification scenarios

Exercise two visible clients through Lobby, Start, movement and stopping. Include short turns, quick reversals, blocked movement at all boundaries, delayed movement acknowledgments, rejected movement with submissions still outstanding, coalesced updates, and a Player joining after another has stopped. Verify final position and Facing without further input. Repeat with tab switching and restoration, including Reconnect when the existing heartbeat deadline expires. Run all frontend checks and backend tests for the coordinated protocol change; distinguish these from browser integration verification.


## Implementation verification — 2026-09-13

- Frontend: 29 tests, typechecking and production build passed. Prediction tests cover delayed echoes, correction with outstanding submissions, final Facing, all four blocked boundaries, diagonal preference and delayed-frame movement caps.
- Backend: 21 tests passed, including correction recovery, retained state for later arrivals, coalescing and rejection of queue overflow without dropping final movement.
- Live server: health and two real WebSocket clients verified Lobby Facing, Start, rapid final turns, correction with stale submissions still outstanding, recovery, later-arrival state, strict movement decoding and Leave.
- Two visible browser clients verified Lobby, Start, short turns/reversal, matching stopped position and Facing, right-boundary movement, and Leave/rejoin. Sustained held-key focus loss, minimization, artificially delayed browser acknowledgments and browser queue-pressure recovery were not reproduced; the corresponding prediction, deadline and queue behavior is covered at automated seams.
