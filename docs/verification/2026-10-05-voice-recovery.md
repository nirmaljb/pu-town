# Voice recovery and takeover (#55)

Same-tab refresh remembers only opted-in listening consent for its recovering
Room in sessionStorage. It stores no media credentials or microphone-on state.
Recovery requests fresh current grants; Leave voice/Room, expired recovery and
displacement clear consent. Day publishers and listeners bind their issuing Game
connection, membership, round and current hearing; old sockets cannot retire the
replacement connection's rights.

The new controlled-clock WebSocket regression verifies takeover retirement of
publication and listening credentials, fresh same-Player admission, harmless late
old-socket closure, and Leave retirement. The existing tests cover elimination,
phase changes, disconnected recovery and listening-only eliminated permissions.
Backend full suite: 111 passed. Frontend full suite: 103 passed, typecheck/build
passed, including matching-Room refresh intent and canceled-grant coverage.

The extended real native Day verifier passed: takeover closed the old listening
media, both old credentials received 403, and the same Player received new nearby
PCM before movement and stale-token checks passed again. The SDK still emitted
ignored shutdown deallocation assertions after successful checks and exit zero.
Browser automation remains waived; browser refresh and competing-tab UI acceptance
remain unverified.
