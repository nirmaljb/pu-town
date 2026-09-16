# Issue #11 — Lobby Avatar selection

Implemented the Lobby chooser and server-authoritative cosmetic selection, with the local authoring and ten-preset publication prerequisites already added in the same implementation. The requester subsequently narrowed the task to finish and close the current ticket (#11) only. Other GitHub issues remain open.

## Automated verification

- `frontend/npm test`: 57 tests passed, including the five-case Python authoring boundary suite.
- `frontend/npm run typecheck`: passed.
- `frontend/npm run build`: passed. Vite reports the existing large-bundle warning (Phaser and embedded artwork); no build error.
- `backend/./mvnw test package`: 35 tests passed and the executable JAR was packaged.
- Authoring coverage: save/reopen, duplicate independence, identity-preserving rename, deletion, ten-preset publication/order, invalid counts/duplicates/incomplete recipes, missing assets, incompatible clothing and preservation of previous publication. All ten standing/walking and seated sheets have every required frame. The six recreated designs match original sheets within one RGB unit of source-over compositor rounding, with identical alpha.
- Protocol/handler coverage: valid published identifiers, unknown/malformed/unjoined requests, structural broadcasts, duplicate choices, unchanged identity/readiness, Room isolation, ordered and concurrent Start/selection, late rejection, takeover, retired sockets, Disconnect recovery and new membership after Leave.
- Frontend coverage: strict decoding, request gating, no optimistic shared appearance, frame-boundary appearance replacement, unchanged seating timing, transition to active play, recovery and sessionStorage refresh behavior.
- Release inspection: the JAR's published collection is byte-identical to the frontend source artifact. The production JS contains all ten named presets and both sprite sheets per preset. Editor endpoints, code, source layers, reference art, legacy recipes and drafts are absent from the production frontend.

## Runtime verification without a browser

Started the packaged backend, Vite on the supported port 5173, and the local workshop on 5174. Backend `/health` returned `{"status":"healthy"}`; frontend and editor HTTP checks passed. The editor returned composed preview assets and rejected a cross-origin write request.

Two real WebSocket clients exercised Create/Join, shared selection, Ready preservation, Start, rejection of a late selection, Disconnect and credential recovery into active play with the same Player ID and accepted preset, then acknowledged Leave. All passed.

No browser was opened or automated, as explicitly requested. Browser layout, visual appearance, actual browser refresh/sessionStorage behavior and the manual seating gallery were not visually verified; state/asset tests and WebSocket checks are not substitutes for that evidence.

## Standards

Independent review against `a48a6a619ea78da94580541a3d35ee13101d93ca`: no actionable findings. Strict decoding, Room serialization, frame boundaries, recovery, publication separation and domain terminology are preserved.

## Spec

Independent review against issue #11 and parent #7: no actionable findings. Browser verification was excluded per the request.

Review summary: Standards 0 findings; Spec 0 findings.
