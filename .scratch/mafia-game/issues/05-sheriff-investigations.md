## Parent

https://github.com/nirmaljb/pu-town/issues/12

## What to build

The Sheriff can confirm one Night investigation, receive a private faction result if alive at resolution, and consult prior results after refresh or Reconnect.

Each slice includes its relevant server behavior, explicit protocol contract, client UI/state, documentation, and tests. Preserve per-Room serialization, bounded asynchronous delivery, strict decoding, and frame-boundary application. Use the approved WebSocket behavior seam, focused frontend tests, and browser verification; do not defer privacy or recovery of this slice's own state to a later ticket.

## Acceptance criteria

- [ ] Offer investigation only to the living Sheriff during Night, targeting one other living Player. Repeating a previous target on a later Night is allowed.
- [ ] Preview locally, explicitly Confirm investigation, and lock the accepted target for the Night, including across Reconnect.
- [ ] Deliver only Mafia or Not Mafia at Night end, never the exact Role. Do not publish the investigation target or result to other Players.
- [ ] A Sheriff killed that Night receives no result for that Night. A surviving Sheriff's past results remain available privately on subsequent phases and recovery.
- [ ] Enforce target identity, Role, living status, phase, and deadline on the server; reject self-investigation, a second choice, and stale or retired-socket requests.
- [ ] Verify results, death suppression, repeated targets, privacy, history, and lock recovery through protocol behavior. Exercise the UI with multiple clients and run full affected checks.

## Blocked by

- Draft ticket 03: Confirm Mafia Night votes and eliminate the majority target

