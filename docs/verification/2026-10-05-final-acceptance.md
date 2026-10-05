# Final non-browser acceptance (#57)

Work began from `829db521157f0c52655fdc64e0b4eafe4348e5bd` on the latest
`live-619e990-tailscale` branch after inspecting the other worktrees. Existing
#23–46 work was retained; #47–56 were completed and committed in dependency order.
This record covers the final #57 checks. The user explicitly waived browser
automation. No GitHub issue closure or complete browser acceptance is claimed.

## Deterministic checks

- `backend/./mvnw package`: 119 tests, zero failures/errors/skips; executable JAR built.
- `frontend/npm test`: 103 Node tests, zero failures/skips, plus the Python Avatar
  authoring boundary suite; `npm run typecheck` and `npm run build` passed.
- The final packaged backend started on isolated loopback port 18088;
  `GET /health` returned `{"status":"healthy"}`.
- `git diff --check` passed. Generated target/bundle files were not edited.

`MafiaGameTest` exercises public Game WebSocket requests against a controlled
clock. It covers competitive entry, Solo Practice Roles/targets, all three real
and Fake Task types, exact phase and interaction deadlines, accepted movement,
interiors, strict payload validation, voting, Night choices/protection/investigation,
Ghost Tasks, Forfeit transfers, Leave, expiry and recovery. Privacy is asserted
from messages delivered to each connection: hidden Roles, choices, retained
investigations, proximity history, Task progress, Ghost positions and voice grants.
Victory coverage includes Task completion, no living Mafia, Night parity,
Townhall parity after its full verdict, and Forfeit outcomes. Immediate victory
never waits for a round quota. This is rules/protocol evidence, not UI acceptance.

Frontend checks cover strict decoding, inbox/frame application, retained recovery,
settings persistence, microphone-test cancellation, capture revisions,
push-to-talk release, noise constraints, audible/visible speaking filtering,
ducking, retry cancellation and late grants after Leave. They do not establish
actual browser permissions, SDK reconnection UI or physical audio output.

## Real media

Independent native clients used the public Game WebSocket and `/voice` gateway,
with the pinned local LiveKit 1.13.7 and synthetic microphone tones. No testing-only
Game endpoint or browser automation was used.

| Proof | Observed result |
| --- | --- |
| `verify_audio_policy.py` | Mislabeled video, sending video SDP and plain/gzip fast-publish video refused; genuine microphone publication accepted. |
| `verify_tokens.py` | Initial/refreshed Player tokens refused at standalone SFU; refreshed gateway admission works and Leave voice retires it. |
| `verify_day.py` | Nonzero PCM, independent third-Player hearing, authorized activity and hidden listeners; foreign-track subscription refused while authorized audio continued. Takeover disconnected old listening media and retired both old grants; replacement received fresh PCM. Movement disconnected media and refused stale tokens. |
| `verify_capacity.py` | Ten Game Players, 100 concurrent connections, all 90 authorized directed PCM/activity pairs. Moving one Player out of range retired all 18 affected listener sessions; 72 authorized listener sessions remained connected. |
| `verify_ghost.py` | A real Night-eliminated Participant received living Townhall PCM with `canPublish:false`. A hostile microphone request closed signaling with 4003 and retired the grant; the living publisher stayed connected. |

Day and capacity proofs ran against the final packaged backend. The Ghost and
policy/token proofs used the existing isolated backend with the same final voice
implementation; its older Task timing is irrelevant to those checks. Capacity
sampling closes each decoded audio stream after its first positive PCM frame;
this is a full-mesh routing smoke check, not sustained load or ten-browser CPU/
memory acceptance. Native SDK shutdown emitted ignored FFI deallocator assertions
after successful checks and exit status zero; these are recorded rather than
interpreted as functional proof failures. Earlier capacity harness attempts
exhausted memory by leaving decoded streams open; stream cleanup was fixed before
the passing runs.

The separate [outage proof](2026-10-05-voice-outage.md) verified movement/text and
an unchanged Game deadline during an owned SFU outage, then native media recovery.
[Day voice](2026-10-04-day-voice.md) records range/building-boundary checks;
[recovery](2026-10-05-voice-recovery.md) records takeover and current permissions.
Native results do not prove the browser controller's outage presentation.

## Browser, manual and playtesting limits

The requested complete multi-browser #57 journey was **not run**, by explicit
user instruction. Solo Practice and competitive controls, all Task surfaces,
settings, fullscreen, microphone permission/device changes, push-to-talk,
physical-speaker volume/ducking, refresh and outage UI need browser acceptance.
Existing browser tests and earlier partial media samples are not represented as
a passing final journey. Ten browsers and remote ICE/TURN networking were not tested.
No human gameplay or balance playtest was performed.

The [Task workload measurement](2026-10-05-task-workload.md) completed in round nine
for all four-to-ten-Player counts with concurrent collision-aware movement and
correct uninterrupted work. It models no social delay, elimination or Forfeit
transfers. The two-minute stationary interactions need human feedback; the result
is a tuning target, not a claim of enjoyable or balanced nine-round play.

README, operational guidance, the protocol, voice setup and ADR 0018 were reconciled
with implemented behavior and these limits. The glossary adds domain-only Task,
Fake Task and Hearing terms.
