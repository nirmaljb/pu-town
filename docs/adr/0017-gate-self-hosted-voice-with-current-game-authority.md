---
status: accepted
---

# Gate self-hosted voice with current Game authority

Use self-hosted LiveKit for Townhall audio, with its signaling port private and
all Player signaling passing through the Game backend. LiveKit's self-hosted
RemoveParticipant does not invalidate existing JWTs, so an SFU credential alone
cannot prove current authorization. The gateway verifies signed credentials
against a live, revocable grant tied to the issuing Game connection, Membership,
round and living Townhall participation. Refreshed tokens do not resurrect a
retired grant. This trades a signaling proxy and asynchronous media cleanup for
server-enforced admission and revocation without trusting voluntary client
subscriptions. RemoveParticipant ends actual media; gateway denial prevents
rejoining. Network failures retry removal outside Room locks.

Voice transport reacts independently of Phaser frames. Authorized Game and local
voice status are presented at frame boundaries, and remote audio connects to the
existing local volume buses. The media service handles encrypted WebRTC transport;
TLS signaling and externally reachable ICE/TURN require deployment configuration.
No recording service is run. A real-service native-client proof accompanies this
choice; it substitutes for browser automation at the user's request and does not
claim browser acceptance.

Player-facing credentials use a separate process-local signing key. The gateway
substitutes SFU credentials only upstream and replaces LiveKit's refreshed token
field with a fresh gateway credential. Even a browser on the local server cannot
reuse its token against the standalone LiveKit port. No SFU access token is sent
to a Player; backend restart invalidates all prior gateway credentials.

The gateway checks actual track type and video sending SDP in regular signaling
and plain or gzip v1 fast-publish Join. LiveKit source grants alone trust the
declared source, so a video track labeled microphone needs this extra check.
Receive-only video sections pre-negotiated by SDKs remain permitted.
