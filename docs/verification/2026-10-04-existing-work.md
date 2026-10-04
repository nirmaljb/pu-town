# Verification of existing Task, Practice and sound work

The integrated source uses the other worktree's Task implementation (`a095f19`
through `0567f8c`) and movement sounds (`d0b1cfa`, `03994ec`). Ticket #32 is
verification-only for this worktree. Ticket #26's existing work is retained.
No browser automation was run.

## Standards review

The integrated Task and sound code preserves recipient-specific delivery,
per-Room serialization, nonblocking ordered outboxes, strict protocol decoding
and frame-boundary presentation. Movement bookkeeping now ends with Membership,
including reservation expiry; Disconnect retains it during recovery.

## Spec review

The shared Task implementation supplies repair, ordered sequence and pickup/delivery
interactions; private real/Fake banks, Ghost work, Forfeit transfer, Task victory
and Solo Practice are covered at the controlled-clock WebSocket seam. Integration
fixes refresh an interrupted Task only to its actor and allow Practice target
ballot confirmation. Recovery verification locates snapshots by message type
rather than assuming a fixed number of following events.

Movement sound tests cover accepted nearby footsteps, faded gain, distant denial,
impossible-movement refusal, Night silence and building entry/exit. The building
test places listeners within hearing distance on opposite sides of the boundary
and verifies the outside listener receives no inside cue, and vice versa.

## Executed checks

- Backend: 102 tests passed, no failures or skipped tests.
- Frontend: 83 tests passed, typecheck and production build passed.
- Runtime: backend `/health`, Vite HTML and the Room Avatar Collection endpoint
  passed with both processes running. Four independent native WebSocket clients
  created/joined a Room, became Ready, started, walked through accepted positions,
  completed one private timed repair step, recovered the same identity and step,
  and received Leave acknowledgments. Other recipients received no private step
  update.

The native runtime check requires Node 22 or newer. With backend and Vite running:

```sh
node tools/verification/game-runtime.mjs
```

`PUTOWN_TEST_HTTP` and `PUTOWN_TEST_CLIENT` override the backend and Vite URLs.
This run used backend port 18092 and Vite at `127.0.0.3:5173`; it exercised real
server deadlines and the production protocol, with no testing endpoint.

Maven's temporary-file location was overridden into checkout-local scratch
because the host's `/tmp` quota was exhausted. The suite passed despite wrapper
and Surefire diagnostic warnings. The frontend build retains its existing large
Phaser bundle warning.

## Work not accepted yet

Voice work was inspected read-only in the active `277f` worktree, rather than
duplicated. Its initial/refreshed credential proof and native media probe are
separate from the committed integration above. Review identified a possible late
upstream admission after media removal has returned 404: the gateway must abort
rejected attachment and repeat removal if an in-flight admission completes after
revocation. Require a completed fresh media proof showing actual post-revocation
PCM silence or SFU removal, plus stale reconnect refusal, before accepting #46.

Browser layout, microphone permission, physical audio output, and mixed Task
workload playtesting remain unverified. These checks do not establish completion
of the voice tickets, balancing ticket #56 or whole-Game acceptance ticket #57.
