# Expanded village verification — 5 October 2026

Base: `ee7bf4f`, latest fetched `origin/live-619e990-tailscale`.

- Backend: `./mvnw test`, 122 tests, no failures/errors. WebSocket-boundary coverage includes automatic Role counts at four through ten Players, three Mafia at ten, Host override persistence, membership thresholds, distant same-area Vision, interior separation and denied distant Hearing. Indexed collision checks agree with full obstacle scans.
- Frontend: `npm test`, 103 passing; `npm run typecheck` and `npm run build` pass. Vite retains its existing large-bundle warning.
- Geometry: all three maps are 7680×4320px, nine times the former area. Deterministic generation validates connectivity and exact Seat/Task foot clearance. The village has four interiors and twenty Task destinations. Horror and cyberpunk are editable exterior alternatives, not runtime selections.
- Runtime: backend health returned healthy on port 8080; frontend served on 5173. Two browser clients created/joined a Room, selected Avatars, observed a Host override to three Mafia, recovered the Host after refresh and acknowledged the guest's Leave. Guest controls were read-only. The canvas remained 711×804px before/after sidebar count changes.
- Solo Practice: Day rendered the expanded village without fog. Arrow-key movement took the Avatar away from the square; the ledger changed from Within reach to 19 tiles away, sheep from 32 to 15 and pumpkins from 31 to 13. Browser console reported no errors/warnings at the final check.
- The comparison viewer exercised theme switching and landmark navigation. Asset archives include CC0 licenses and recorded hashes; no new restricted source artwork is published.

Screenshots: [Lobby](assets/2026-10-05-expanded-village-lobby.png), [Day movement](assets/2026-10-05-expanded-village-day.png).

Human ten-Player travel balance and audible voice delivery were not verified by these checks. Proximity Hearing was covered by server tests; browser microphone permission was not requested.
