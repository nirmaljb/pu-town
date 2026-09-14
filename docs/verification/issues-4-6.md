# Issues #4–#6 verification — 2026-09-14

## Browser evidence

The real Phaser client ran on localhost:5173 against the updated backend on port 8089. Existing older backend processes occupied 8080 and 8081. The backend health endpoint returned `{"status":"healthy"}`. The development-only `/test/recovery-lifecycle.html` harness closes a real WebSocket and temporarily prevents new socket construction. It logs public snapshot/presence events with recovery credentials removed, and can open a child tab that inherits sessionStorage.

In Room `9TYLTM`:

- Alex's original Player ID was `bf67dbf3-66fd-473a-81b9-80f60bb6e8bf`, Avatar Preset `townsperson-4`, Colour `#4F8CFF`, Seat 0. An ordinary observer tab joined independently as `9f596adb-2bfd-441b-a28a-a57af863f20d`, preset `townsperson-3`, Seat 1.
- Refresh at 09:52:36 UTC returned Alex's same identity, appearance, Seat and Host role. The observer saw disconnect/recovery presence without a replacement Join.
- A controlled interruption began at 09:53:09.748 UTC. The observer initially still saw Alex as Host. At 09:53:25.495 it received Host succession; Alex recovered at 09:53:32.342 without reclaiming the role.
- A second interruption began at 09:53:40.161. The observer started at 09:53:40.407; the retained disconnected membership entered active play with Seat null. Recovery at 09:53:53.306 returned the current playing phase, same identity/appearance, and authoritative spawn.
- A duplicated tab at 09:54:02.426 inherited the credential and recovered Alex's membership while the original socket was active. The original displayed “Your connection was replaced by another tab.” The replacement remained one of two memberships. The original's subsequent refresh did not automatically recover it.

In Room `VQJTQF` after resuming verification:

- At 18:01:50.881 UTC Alex (`09be1c40-49d6-4724-8ec6-378bb15e6910`, preset `townsperson-6`) disconnected. Visual inspection showed the retained, subdued seated Avatar labelled “Reconnecting…”. The observer received Host succession at 18:02:06.447.
- At 18:03:51.172 the observer received `player_left` with reason `expired` and occupancy fell to one. Alex's next attempt displayed “Your place in the Room expired” plus Join again and the explanation that it creates a new Player and appearance.
- Clicking Join again returned a new membership at 18:04:15.532: Player ID `7976acfa-0a02-4dba-8c77-4727fedb45a8`, preset `townsperson-3`, in the same Room. The observer received an ordinary `player_joined`.
- Alex disconnected again at 18:04:51.428. Clicking Leave Room while network construction was blocked immediately returned to entry. Restoring connectivity and refreshing kept the entry form; it did not recover the abandoned membership. Reachable reservation release is additionally covered by handler and fake-socket tests.
- The observer started active play and used arrow input. Refresh at 18:06:20.371 retained Player ID `15d44a66-07a4-459b-8b71-b8fb8163b3e8`, preset `townsperson-4`, Host authority, position `(648.0016, 360)`, Facing right and movement sequence 2.

These are controlled real-socket/browser checks, not operating-system network-loss or cross-browser certification. The earlier healthy suspension evidence is recorded separately in `issue-2.md`. An initial expiry run was interrupted by a development reload and is not counted as completed evidence.

## Automated coverage and review

The full frontend suite passed 49 tests before review, plus typecheck and production build. The full backend suite passed 30 tests. Review added regressions for overlapping release attempts, terminal-error/close ordering, simultaneous Host returns, and retired movement.

The independent Standards review found a release-socket cleanup bug when a second abandoned membership replaced an unfinished release attempt. A failing fake-socket test reproduced it; the fix closes the previous socket before replacing the attempt.

The independent Spec reviewer initially hit an account usage limit. Direct Spec review against the fetched GitHub acceptance criteria found that a close could erase a queued terminal recovery error before the next frame. A failing regression test reproduced it; the close path now preserves the terminal result for frame-boundary handling.


After work resumed, both independent review agents became available. Standards confirmed the cleanup fix and terminal-error ordering fix, with no remaining findings. Spec found an expired pending connection could still delay foreground recovery; moving attempt-timeout handling before the foreground override fixes it, with a failing-before/passing-after clock regression.

## Standards

Initial finding: one P2 cleanup issue in overlapping release attempts, fixed and regression-tested. Follow-up independent review: no actionable findings.

## Spec

Independent finding: one P2 delayed foreground retry when a suspended attempt had already expired, fixed and regression-tested. Follow-up independent review: no remaining actionable findings. Direct review also found and fixed terminal-error/close ordering.

Final review totals: Standards 0 remaining; Spec 0 remaining.

Final checks after all review fixes: **52 frontend tests passed**, `npm run typecheck` passed, `npm run build` passed, and **31 backend tests passed**. Vite retained its existing large Phaser bundle warning. Browser evidence above is reported separately from automated tests.
