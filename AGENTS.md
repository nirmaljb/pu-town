# AGENTS.md

This file is the operational guide for agents and contributors working in this repository. It applies to the entire repository.

## Project at a glance

PU Town is a real-time ten-Player Mafia game:

- `frontend/` is a strict TypeScript, Vite, and Phaser client.
- `backend/` is a Java 17 Spring Boot WebSocket server.
- Players are seated for the whole Room; the client renders server state and predicts nothing.
- The server owns Room membership, Roles, the Game clock, and every result.
- Every Game message is built per recipient; client-side concealment is never the enforcement.
- Server state is in memory; there is no database or external service.

Use the domain terms in [`CONTEXT.md`](CONTEXT.md). In particular, do not use **User** when the domain concept is **Player**, and do not confuse a **Player**, **Player ID**, **Display Name**, or **Avatar**.

## Read before changing behavior

Use these documents as sources of truth:

1. [`CONTEXT.md`](CONTEXT.md) — canonical domain glossary; keep implementation details out of it.
2. [`docs/websocket-protocol-v1.md`](docs/websocket-protocol-v1.md) — version 1 client/server message contract and validation rules.
3. [`docs/adr/`](docs/adr/) — architectural decisions and their rationale.
4. [`README.md`](README.md) — supported installation and local-development workflow.

The current ADRs establish these invariants:

- WebSocket messages use an explicit, versioned contract.
- The client applies queued network events only at Phaser game-frame boundaries.
- Room transitions and outbound event creation are serialized per room.
- Slow connections use bounded, strictly ordered outbound queues that never evict or replace an event; a connection that cannot keep up is closed and recovers a complete snapshot.
- A Player holds one Seat from joining until their Membership ends. The protocol carries no movement at all, and a Player's position is only ever the Seat the server gave them (ADR 0013, which retires ADR 0001 and supersedes the coalescing half of ADR 0004).
- The Game Roster outlives Room Membership; Elimination, Leave and Forfeit are distinct.
- `game_state` is built per recipient, and an accepted choice updates only the recipients whose authorized view changed.

Do not bypass these constraints accidentally. A deliberate change should update the relevant tests and documentation and may require a new ADR when it is costly to reverse, surprising, and the result of a real trade-off.

## Setup and commands

Required tools:

- JDK 17 with `java` and `javac`
- Node.js `^20.19.0` or `>=22.12.0`
- npm
- Python 3.10+ with `tools/avatar-editor/requirements.txt` installed for authoring and frontend tests

There is no root-level combined command. Run each component from its own directory.

### Backend

```sh
cd backend
./mvnw spring-boot:run
./mvnw test
./mvnw package
```

On Windows, use `mvnw.cmd`. Maven Wrapper pins Maven `3.9.16` and removes the need for a global Maven installation.

The backend defaults to port `8080`:

- `GET /health` returns `{"status":"healthy"}`.
- `/ws/game` is the game WebSocket endpoint.

### Frontend

```sh
cd frontend
npm ci
npm run dev
npm run avatars # optional local authoring workshop on 5174
npm test
npm run typecheck
npm run build
```

The frontend development server defaults to port `5173`. `npm test` compiles test-importable JavaScript and then runs the Node test runner. `npm run build` writes the static bundle to `frontend/dist/`.

The client accepts this infrastructure query parameter (room/name options are ignored):

- `ws`, defaulting to `ws://localhost:8080/ws/game`

## Repository map

### Root documentation

- `README.md` — human-facing setup, usage, verification, and deployment status.
- `AGENTS.md` — this operational repository guide.
- `CONTEXT.md` — implementation-free domain glossary.
- `docs/websocket-protocol-v1.md` — exact protocol v1 wire contract.
- `docs/adr/` — architectural decision records.

### Frontend

- `frontend/src/main.ts` — Phaser game bootstrap and canvas sizing.
- `frontend/src/pu-town-scene.ts` — scene lifecycle, URL configuration, and per-frame rendering of the entry and Game surfaces.
- `frontend/src/game-interface.ts` — the Game overlay: phase banner and countdown, Role card, target list and Confirm, results, and chat.
- `frontend/src/avatar-facing.ts` — the inward Facing each Seat holds for the whole Room.
- `frontend/src/protocol.ts` — client message builders, server message types, and strict decoding.
- `frontend/src/reconnecting-game-client.ts` — entry deadlines, transport-timer heartbeat health, frame-applied timeout effects, reconnection, and retained recovery intent.
- `frontend/src/join-interface.ts` — entry form, remembered Display Name, Room Code controls, and reconnect overlay.
- `frontend/src/game-transport.ts` — WebSocket serialization and inbound-event handoff.
- `frontend/src/network-inbox.ts` — queue of decoded server events.
- `frontend/src/network-frame-boundary.ts` — drains network events at the start of each game frame.
- `frontend/src/world-state.ts` — pure client world state and event reducer.
- `frontend/src/avatar-reconciler.ts` — creates, moves, and removes Phaser avatars to match world state.
- `frontend/src/room-rules.ts` — client copies of the shared Room dimensions.
- `frontend/src/avatar-seating.ts` — client-only sit-down timing for a newly taken Seat.
- `frontend/src/avatar-chooser.ts` — Lobby chooser; clicking a character requests it from the Room.
- `frontend/src/avatar-presets.ts` — the active Room collection, its strict decoding, and the join-time fetch.
- `tools/avatar-editor/` — local Python/Pillow workshop, curated sources and project-backed drafts; excluded from Player builds.
- `frontend/src/style.css` — page and game-container presentation.
- `frontend/test/` — protocol, frame-boundary, and reconnection tests.

### Backend

- `backend/src/main/java/dev/lpa/pu_go/PUtown.java` — Spring Boot entry point.
- `backend/src/main/java/dev/lpa/pu_go/health/HealthController.java` — health endpoint.
- `backend/src/main/java/dev/lpa/pu_go/player/PlayerState.java` — state for one connected player.
- `backend/src/main/java/dev/lpa/pu_go/room/Room.java` — membership container and pinned Avatar Collection for one room.
- `backend/src/main/java/dev/lpa/pu_go/avatar/` — publication loading, per-Room collections, and the collection endpoint.
- `backend/data/published-avatars.json` — the publication the authoring tool writes and the backend reads.
- `backend/src/main/java/dev/lpa/pu_go/room/RoomManager.java` — room registry and deterministic per-room locking.
- `backend/src/main/java/dev/lpa/pu_go/room/RoomRules.java` — authoritative Room bounds, capacity, and Seat positions and Facing.
- `backend/src/main/java/dev/lpa/pu_go/game/` — the Game: `Role`, `Faction`, `GamePhase`, `Participant`, `ChatEntry`, and `Game`, the rules engine that owns phases, resolution, forfeits and victory.
- `backend/src/main/java/dev/lpa/pu_go/websocket/config/WebSocketConfig.java` — WebSocket route and allowed browser origins.
- `backend/src/main/java/dev/lpa/pu_go/websocket/handler/GameWebSocketHandler.java` — connection, join, leave, Start, Game submissions, the phase sweep, and per-recipient delivery.
- `backend/src/main/java/dev/lpa/pu_go/websocket/handler/ConnectionOutbox.java` — bounded, strictly ordered outbound delivery.
- `backend/src/main/java/dev/lpa/pu_go/websocket/message/` — protocol DTOs, strict decoding, and client-error handling.
- `backend/src/test/` — Spring context, WebSocket handler, outbox, and `MafiaGameTest`, which plays whole Games at the WebSocket boundary on a controlled clock.
- `backend/HELP.md` — generated Spring/Maven reference links, not the project guide.

## Runtime flow

1. `main.ts` starts the Phaser scene.
2. `pu-town-scene.ts` reads the WebSocket endpoint option and presents the join interface; submitting it opens the WebSocket and requests Room creation or Join.
3. The backend establishes a Room Membership and returns a Room Snapshot with its Player ID and private recovery credential. Recovery returns the existing membership’s identity and current state.
4. `game-transport.ts` decodes server messages into `network-inbox.ts`.
5. `network-frame-boundary.ts` applies queued events to `world-state.ts` before the frame renders anything.
6. `avatar-reconciler.ts` and `game-interface.ts` bring the Phaser objects and the DOM overlay into line with that state.
7. Confirming a choice sends one Game control; the backend validates it against the phase, round, Role and lock, and answers only the recipients whose authorized view changed.

After an unexpected disconnect, the active client recovers its previous Room Membership using a private credential, retaining Player ID and appearance within the server-owned 120-second reservation. In a Game, recovery also restores the recipient's Role, locked choices, retained Sheriff results and readable chat; a Disconnect never Forfeits, and the Participant stays in every majority until the reservation ends. Disconnected memberships remain visible and consume capacity. Only Leave or expiry ends them. Same-tab refresh restores sessionStorage recovery intent; takeover retires the old socket with close code 4001. Host authority has a 15-second Disconnect grace. Recovery retries back off to five seconds until a server outcome; recovery Leave clears intent immediately and makes one isolated release attempt. An acknowledged Leave does not reconnect. Started Rooms reject new memberships, including fresh Join after Leave or expiry; valid recovery still follows the current phase. Start needs all ten Players present, connected and Ready, and a blocked Start says which. Expired recovery returns to lobby selection without a Join again shortcut. Final Leave or expiry removes a started Room immediately, while recoverable disconnected memberships keep it alive. Never-started empty Lobbies retain their five-minute lifetime.

Lobby Avatar selection is cosmetic and optional: the Room's pinned collection of named published choices, requested by clicking one, and accepted through structural Room State. Selection shares the Start lock, does not change Ready, and updates existing seated Avatars without replaying arrivals. Recovery preserves accepted selection; Leave ends it. A client fetches the Room's collection over HTTP on join and creates every texture before the scene renders the Room. Publishing reaches Rooms created from then on, without a rebuild or restart; never make drafts or authoring endpoints available in the Player app.

## Change rules and synchronization points

- Treat files under `backend/src/` and `frontend/src/` as authoritative source. Do not infer current behavior from generated `backend/target/` or `frontend/dist/` files.
- The backend is the single reader of the publication file; never hard-code a second catalogue, and never reintroduce a build-time copy into either bundle. Publish validates at least one complete distinct design before atomic replacement. Run the authoring boundary suite through `npm test`; draft edits must not mutate publication.
- The protocol is represented in Java message/decoder code, TypeScript protocol code, and `docs/websocket-protocol-v1.md`. Keep all three synchronized. The collection endpoint's payload shape is part of that contract: `AvatarCollectionController` and `avatar-presets.ts` must agree.
- Room dimensions are duplicated in backend `RoomRules.java` and frontend `room-rules.ts`, and Seat Facing in `RoomRules.seatFacing` and `avatar-facing.ts`. Keep shared values synchronized; the backend remains authoritative.
- Preserve strict message decoding: unknown fields, unsupported versions, and malformed payloads should remain explicit errors.
- Never widen a Game view to save a round trip. `game_state` is built per recipient, an absent private field is `null` rather than filtered, and an accepted choice reaches only the recipients whose authorized view changed — broadcasting it would leak hidden Role activity through the countdown alone.
- The Game clock is the server's. Phases end on their own deadline, each deadline derives from the one it replaces, and every submission carries the round it was chosen in.
- Apply server events through the inbox/frame-boundary path; do not mutate Phaser objects directly from WebSocket callbacks.
- Preserve per-room serialization and non-blocking outbound delivery. Do not perform socket writes while holding room locks.
- Preserve reconnect semantics: Disconnect and Leave are different domain transitions.
- Transport health checks run independently of Phaser frames. Suspension gets one fresh heartbeat deadline; only a pong renews that allowance. Apply detected health failure at a frame boundary.
- Avoid adding implementation details to `CONTEXT.md`; add or revise terms only when the domain language changes.

## Verification expectations

Run the smallest relevant checks during development, then the full affected suite before handing off a change:

- Frontend-only change: `npm test`, `npm run typecheck`, and `npm run build` from `frontend/`.
- Game rules change: add a test to `MafiaGameTest` that plays the situation through the WebSocket boundary rather than calling `Game` directly, and assert privacy by what a connection received, not by what a view would draw.
- Backend-only change: `./mvnw test` from `backend/`; use `./mvnw package` when packaging or startup behavior changes.
- Protocol or shared-rule change: run both frontend and backend checks and update the protocol documentation.
- Runtime integration change: start both processes, check `/health`, load the client on port `5173`, and exercise the affected join/move/leave/reconnect path with at least two browser clients when relevant.

Do not claim an integration path was verified if only unit tests ran.

## Current limitations and hazards

- `WebSocketConfig.java` and `AvatarCollectionController` accept browser origins only from `http://localhost:5173` and `https://localhost:5173`. Vite falling back to another port will break both the connection and the collection fetch.
- Rooms and player state live only in one backend process. Multiple server instances do not share state or coordinate rooms.
- Production hosting, TLS termination, reverse-proxy configuration, and deployment automation are absent.
- A deployed HTTPS frontend must use a `wss://` endpoint and a matching backend origin allow-list.
- Some generated files under `backend/target/` are tracked and may be stale. Never edit them or treat them as architectural evidence.
- There is no `.env` configuration, database, authentication, or persistent player identity in the current codebase. In-Game chat exists, but it lives only in its Room's memory and disappears with the Room.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for `nirmaljb/pu-town`.
See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout: root `CONTEXT.md` and `docs/adr/`.
See `docs/agents/domain.md`.
