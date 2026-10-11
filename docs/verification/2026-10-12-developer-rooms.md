# Local Developer Rooms verification

Baseline: `b956e07921ca66de859533a5ac9c1a2076f243ff`.

The complete backend suite passed (135 tests), and `./mvnw package` produced the executable JAR. The complete frontend suite passed (110 tests, including authoring), followed by typecheck and production build. The existing Vite bundle-size advisory remains.

`PU_TOWN_E2E_DEVELOPER=1 PU_TOWN_E2E_BACKEND_PORT=18082 npm run test:browser -- e2e/developer-rooms.spec.ts` passed against this checkout's Vite client on port 5173 and an isolated backend on port 18082. Playwright checked `/health` before opening the browsers. The journey created a Developer Room, loaded four actual Role-bearing Players, showed the private Role title, handed a simulated Doctor to a second browser, moved that Avatar through production keyboard/position validation, paused/resumed the countdown, completed real Task work with range/duration overrides, reset Game progress while retaining the browser membership, recovered the same Player after refresh, released it to idle simulation, returned to Lobby and acknowledged Leave. Neither browser reported a JavaScript error; the non-controller received no inspector messages. Role-title and panel screenshots were visually inspected.

WebSocket-boundary tests additionally verified disabled/nonlocal rejection, late joining, unauthorized control, paused Task time across recovery, independent real/Fake progress across Role changes, reset countdown restoration, controller authority past Host grace and its eventual expiry, claim after expiry, stale credential rejection after Release, private simulation choices sending no messages to ordinary browsers, and final real-membership cleanup. Local-access checks reject remote peers, public authorities/Origins and forwarding headers.

This verifies the local development workflow. Public deployment was not modified or exercised; voice transport and every long-running competitive browser journey were not repeated for this change.
