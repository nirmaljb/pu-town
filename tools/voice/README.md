# Local Townhall voice

LiveKit 1.13.7 runs as a separate, self-hosted process. Participants can
choose **Join voice** during Townhall discussion and voting. They initially listen
with their microphone muted. **Unmute microphone** requests browser permission;
denial preserves listening, text, and the Game. **Mute microphone** and **Leave
voice** are independent of Leave Room. Received audio uses the saved master and
voice volume buses. Eliminated Participants can listen during Townhall, with publication denied by
the server and the microphone control disabled. Recovery issues only current
permissions; earlier grants cannot be reused. Day voice is a subsequent ticket.

On Linux x86-64, from the repository root:

```sh
./tools/voice/start-local.sh
```

The script downloads a pinned, checksum-verified server into `.scratch/voice/local`,
generates private local credentials, and starts loopback signaling on 7880 with
WebRTC UDP on 7882 and TCP fallback on 7881. It needs curl, tar, sha256sum, and
openssl; Docker and administrative privileges are unnecessary. Stop it with Ctrl-C.
Other platforms can download the corresponding [official release](https://github.com/livekit/livekit/releases/tag/v1.13.7)
and run the generated configuration with their native executable.

In a second terminal, start the Game backend with the same credentials:

```sh
source .scratch/voice/local/local.env
cd backend
./mvnw spring-boot:run
```

Start the frontend normally with `cd frontend && npm run dev`. Without these
backend settings voice reports unavailable and text/Game play continue.
`PUTOWN_VOICE_SERVER`, `PUTOWN_VOICE_KEY`, and `PUTOWN_VOICE_SECRET` can also point
the backend at an existing private LiveKit instance.

The public signaling entrance is the Game backend's `/voice/rtc` (and `/voice/rtc/v1`).
Do not expose LiveKit's port 7880: direct access would bypass current Membership,
connection, round and phase checks. Only microphone audio is granted; video,
screen sharing, data publication, metadata changes and media administration are
excluded. The gateway additionally rejects video track types even when labeled
as microphones, and video sending SDP, including compressed fast-publish Join.
Receive-only SDP sections pre-negotiated by SDKs are permitted. Each private Game connection receives its own revocable media identity.
LiveKit's refreshed credentials pass through the same admission check. Leaving,
disconnecting, takeover and the end of voting retire that identity permanently.
The backend closes signaling and asks LiveKit to remove the Participant outside
Room locks, retrying removal if the media service is unavailable. The phase sweep
runs every 200 ms; media revocation is an asynchronous service operation, rather
than an instantaneous cross-process boundary.

Media uses encrypted DTLS/SRTP. The local signaling URLs use loopback `ws://`;
remote signaling must use HTTPS/WSS on the backend with its exact origin allow-list.
This loopback configuration is for browsers on this machine. Tailscale Funnel
proxies HTTP signaling, not WebRTC UDP/TCP. Remote clients additionally need
reachable ICE candidates and, for restrictive networks, TURN configured per
[LiveKit's deployment guidance](https://docs.livekit.io/transport/self-hosting/deployment/).
Do not merely expose the standalone signaling port or advertise 127.0.0.1 to remote
clients. No recording/egress service is configured or started.

## Verification without browser automation

Install `requirements.txt` in an isolated Python environment and run:

```sh
source .scratch/voice/local/local.env
PUTOWN_TEST_WS=ws://localhost:8080/ws/game python tools/voice/verify_audio_policy.py
PUTOWN_TEST_WS=ws://localhost:8080/ws/game python tools/voice/verify_tokens.py
PUTOWN_TEST_WS=ws://localhost:8080/ws/game python tools/voice/verify.py
```

The script uses four independent Game WebSockets and real native WebRTC clients.
It follows real deadlines (about six minutes), publishes a synthetic tone and
checks nonzero received PCM, forbidden publication through raw signaling with
a mandatory authorized control acknowledgement and continuing audio, Night
admission, voice through
voting, Leave revocation, stale-token refusal and end-of-Townhall revocation.
It uses no testing-only Game endpoint and does not automate a browser. Native
media evidence does not establish browser microphone permission, UI layout or
physical-speaker audibility. Manual browser acceptance remains necessary: join
with multiple browsers, listen/unmute/mute, deny microphone permission in one,
change saved volumes, Leave, reconnect, and confirm Night silence.

Player-facing credentials use a separate process-local signing key. The gateway
substitutes SFU credentials only upstream and replaces LiveKit's refreshed token
field with a fresh gateway credential. Even a browser on the local server cannot
reuse its token against the standalone LiveKit port. No SFU access token is sent
to a Player; backend restart invalidates all prior gateway credentials.
