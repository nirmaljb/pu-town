# Receive-only Townhall voice (#47)

Started from `829db52` on `live-619e990-tailscale`, after checking the other
worktrees and fetching the remote. Their completed work was already integrated;
remaining reverse patches and the incomplete alternative voice draft were not applied.

Eliminated Participants receive subscription-only grants. SFU permissions and
regular/fast-publish gateway checks deny publication. Grants bind the current
session, round, phase and participation status. Elimination, Disconnect and
takeover retire earlier credentials; recovery receives fresh listening access.
Java, TypeScript, protocol documentation and ADR 0017 agree on these permissions.

Controlled-clock WebSocket tests cover private issuance, elimination, retired
credentials and receive-only recovery. Gateway tests cover audio publication,
sending SDP and plain/gzip fast-publish requests. Backend suite: 109 tests passed.
Frontend suite: 86 tests passed, with typecheck and build, including the final
playback change.

Browser exploration exposed an existing Chromium playback defect: remote audio
needs a playing media element before feeding Web Audio. A muted decoder element
now activates the track; audible output still uses saved volumes. A partial
five-browser real-service run observed nonzero PCM in an eliminated Participant's
browser. The complete journey did not pass before the user requested browser
automation stop. This is not complete browser acceptance, hardware microphone
testing, ten-Player media evidence or balance playtesting.

The implement skill's Standards review found an outdated ADR sentence and an
unclear signaling variable name, both corrected. Its Spec review requested an
additional real-media revocation assertion; that browser assertion remains
unverified under the user's instruction to omit browser automation.
