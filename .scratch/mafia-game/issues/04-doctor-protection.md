## Parent

https://github.com/nirmaljb/pu-town/issues/12

## What to build

The Doctor can privately confirm protection before the Night deadline, prevent a matching Mafia attack, and see the correct target restrictions on later Nights.

Each slice includes its relevant server behavior, explicit protocol contract, client UI/state, documentation, and tests. Preserve per-Room serialization, bounded asynchronous delivery, strict decoding, and frame-boundary application. Use the approved WebSocket behavior seam, focused frontend tests, and browser verification; do not defer privacy or recovery of this slice's own state to a later ticket.

## Acceptance criteria

- [ ] Offer protection controls only to the living Doctor during Night. Permit one living target, including the Doctor.
- [ ] Preview locally and explicitly Confirm protection; acceptance locks the choice for that Night and survives Reconnect.
- [ ] Reject protection of the immediately preceding Night's protected Player. An idle Night breaks the restriction; protecting Alice, skipping a Night, then protecting Alice is permitted.
- [ ] Resolve protection with the single Mafia attack. Matching protection prevents death, including self-protection. Killing a Doctor who protected someone else creates no additional attack or death.
- [ ] No submitted protection has no effect. An absent attack and a prevented attack both produce the same public no-death announcement.
- [ ] Do not send the Doctor's selection or a success confirmation to unauthorized recipients. Keep prior-Night restrictions and accepted current choice correct on recovery.
- [ ] Test actual votes and protection through the handler with controlled deadlines, covering self-protection, consecutive targets, an idle Night, Doctor death, forged requests, privacy, and recovery. Demonstrate protected versus unprotected outcomes and run full affected checks.

## Blocked by

- Draft ticket 03: Confirm Mafia Night votes and eliminate the majority target

