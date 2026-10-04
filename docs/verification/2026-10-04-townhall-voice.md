# Ticket #46 verification — 2026-10-04

Implemented on `live-619e990-tailscale`, preserving the other worktrees' commits
through `8010799`. The local service is checksum-pinned LiveKit 1.13.7; the
Player SDK is livekit-client 2.22.3. Startup is documented in
[the local voice guide](../../tools/voice/README.md).

## Automated checks

- Backend: 107 tests passed, including controlled-clock WebSocket recipient
  privacy and phase revocation, audio kind checks, SDP direction handling and
  plain/gzip fast-publish checks. Maven packaging passed.
- Frontend: 86 tests passed; strict typechecking and production build passed.
- The packaged backend returned healthy on port 18086; Vite served the client
  on 5173. Local startup downloaded, checksum-verified and ran LiveKit on 7880.
- Both code-review axes reported no remaining findings.

## Real service evidence

`tools/voice/verify.py` used four independent Game WebSockets and native WebRTC
clients against loopback LiveKit, following actual Game deadlines. It received
nonzero PCM, refused forbidden publication while acknowledging an authorized
control request and continuing audio, retained voice through voting, revoked
media on Leave, refused stale-token reconnection with HTTP 403 and revoked media
at the Townhall deadline. Night admission was refused. No browser was automated.

`verify_audio_policy.py` checked the final packaged backend: video mislabeled
microphone, video sending SDP, duplicate direction SDP and plain/gzip video Join
were refused. A legitimate native microphone track was acknowledged.
`verify_tokens.py` proved initial and refreshed Player credentials cannot enter
the standalone SFU, a rewritten refresh credential can reconnect through the
Game gateway, and Leave voice makes that credential unusable.

The native SDK sometimes emits teardown warnings after assertions have passed.
These are not evidence of microphone permission, physical-speaker audibility or
browser UI acceptance. The browser microphone, mute, permission-denial, volume
and layout checks in the local voice guide remain manual and unverified.
External ICE/TURN and HTTPS deployment are outside this local setup.
