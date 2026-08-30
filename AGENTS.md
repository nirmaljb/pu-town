# AGENTS.md

This file is the operational guide for agents and contributors working in this repository. It applies to the entire repository.

## Project at a glance

PU Town is a real-time shared top-down game world:

- `frontend/` is a strict TypeScript, Vite, and Phaser client.
- `backend/` is a Java 17 Spring Boot WebSocket server.
- The client calculates responsive local movement.
- The server validates positions, owns room membership, and broadcasts authoritative updates.
- Server state is in memory; there is no database or external service.

Use the domain terms in [`CONTEXT.md`](CONTEXT.md). In particular, do not use **User** when the domain concept is **Player**, and do not confuse a **Player**, **Player ID**, **Display Name**, or **Avatar**.

## Read before changing behavior

Use these documents as sources of truth:

1. [`CONTEXT.md`](CONTEXT.md) — canonical domain glossary; keep implementation details out of it.
2. [`docs/websocket-protocol-v1.md`](docs/websocket-protocol-v1.md) — version 1 client/server message contract and validation rules.
3. [`docs/adr/`](docs/adr/) — architectural decisions and their rationale.
4. [`README.md`](README.md) — supported installation and local-development workflow.

The current ADRs establish these invariants:

- The client computes movement locally; the server validates every submitted position.
- WebSocket messages use an explicit, versioned contract.
- The client applies queued network events only at Phaser game-frame boundaries.
- Room transitions and outbound event creation are serialized per room.
- Slow connections use bounded outbound queues, with superseded movement updates coalesced.

Do not bypass these constraints accidentally. A deliberate change should update the relevant tests and documentation and may require a new ADR when it is costly to reverse, surprising, and the result of a real trade-off.

## Setup and commands

Required tools:

- JDK 17 with `java` and `javac`
- Node.js `^20.19.0` or `>=22.12.0`
- npm

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
npm test
npm run typecheck
npm run build
```

The frontend development server defaults to port `5173`. `npm test` compiles test-importable JavaScript and then runs the Node test runner. `npm run build` writes the static bundle to `frontend/dist/`.

The client accepts these query parameters:

- `room`, defaulting to `plaza`
- `name`, defaulting to `Player`
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
- `frontend/src/pu-town-scene.ts` — scene lifecycle, URL configuration, controls, local movement, and movement-send cadence.
- `frontend/src/protocol.ts` — client message builders, server message types, and strict decoding.
- `frontend/src/reconnecting-game-client.ts` — connection lifecycle, reconnection, and retained join intent.
- `frontend/src/game-transport.ts` — WebSocket serialization and inbound-event handoff.
- `frontend/src/network-inbox.ts` — queue of decoded server events.
- `frontend/src/network-frame-boundary.ts` — drains network events at the start of each game frame.
- `frontend/src/world-state.ts` — pure client world state and event reducer.
- `frontend/src/avatar-reconciler.ts` — creates, moves, and removes Phaser avatars to match world state.
- `frontend/src/room-rules.ts` — client copies of shared room dimensions and movement values.
- `frontend/src/style.css` — page and game-container presentation.
- `frontend/test/` — protocol, frame-boundary, and reconnection tests.

### Backend

- `backend/src/main/java/dev/lpa/pu_go/PUtown.java` — Spring Boot entry point.
- `backend/src/main/java/dev/lpa/pu_go/health/HealthController.java` — health endpoint.
- `backend/src/main/java/dev/lpa/pu_go/player/PlayerState.java` — state for one connected player.
- `backend/src/main/java/dev/lpa/pu_go/room/Room.java` — membership container for one room.
- `backend/src/main/java/dev/lpa/pu_go/room/RoomManager.java` — room registry and deterministic per-room locking.
- `backend/src/main/java/dev/lpa/pu_go/room/RoomRules.java` — authoritative spawn, bounds, speed, and tolerance values.
- `backend/src/main/java/dev/lpa/pu_go/websocket/config/WebSocketConfig.java` — WebSocket route and allowed browser origins.
- `backend/src/main/java/dev/lpa/pu_go/websocket/handler/GameWebSocketHandler.java` — connection, join, leave, move, and broadcast lifecycle.
- `backend/src/main/java/dev/lpa/pu_go/websocket/handler/ConnectionOutbox.java` — bounded, ordered outbound delivery and movement coalescing.
- `backend/src/main/java/dev/lpa/pu_go/websocket/message/` — protocol DTOs, strict decoding, and client-error handling.
- `backend/src/test/` — Spring context, WebSocket handler, and outbox tests.
- `backend/HELP.md` — generated Spring/Maven reference links, not the project guide.

## Runtime flow

1. `main.ts` starts the Phaser scene.
2. `pu-town-scene.ts` reads the URL options, opens the WebSocket, and requests a room join.
3. The backend issues a new Player ID for the connection and returns a Room Snapshot.
4. `game-transport.ts` decodes server messages into `network-inbox.ts`.
5. `network-frame-boundary.ts` applies queued events to `world-state.ts` before the frame reads input or mutates Phaser objects.
6. The scene moves the local Avatar immediately and periodically submits its absolute position.
7. The backend validates the position and broadcasts accepted movement to the Room.
8. `avatar-reconciler.ts` brings Phaser objects into line with the authoritative world state.

After an unexpected disconnect, the active client reconnects and rejoins its previous Room with a newly issued Player ID. An acknowledged Leave does not reconnect.

## Change rules and synchronization points

- Treat files under `backend/src/` and `frontend/src/` as authoritative source. Do not infer current behavior from generated `backend/target/` or `frontend/dist/` files.
- The protocol is represented in Java message/decoder code, TypeScript protocol code, and `docs/websocket-protocol-v1.md`. Keep all three synchronized.
- Room dimensions and movement speed are duplicated in backend `RoomRules.java` and frontend `room-rules.ts`. Keep shared values synchronized. The backend remains authoritative and additionally owns spawn and movement tolerance.
- Preserve strict message decoding: unknown fields, unsupported versions, malformed payloads, and invalid movement should remain explicit errors.
- Apply server events through the inbox/frame-boundary path; do not mutate Phaser objects directly from WebSocket callbacks.
- Preserve per-room serialization and non-blocking outbound delivery. Do not perform socket writes while holding room locks.
- Preserve reconnect semantics: Disconnect and Leave are different domain transitions.
- Avoid adding implementation details to `CONTEXT.md`; add or revise terms only when the domain language changes.

## Verification expectations

Run the smallest relevant checks during development, then the full affected suite before handing off a change:

- Frontend-only change: `npm test`, `npm run typecheck`, and `npm run build` from `frontend/`.
- Backend-only change: `./mvnw test` from `backend/`; use `./mvnw package` when packaging or startup behavior changes.
- Protocol or shared-rule change: run both frontend and backend checks and update the protocol documentation.
- Runtime integration change: start both processes, check `/health`, load the client on port `5173`, and exercise the affected join/move/leave/reconnect path with at least two browser clients when relevant.

Do not claim an integration path was verified if only unit tests ran.

## Current limitations and hazards

- `WebSocketConfig.java` accepts browser origins only from `http://localhost:5173` and `https://localhost:5173`. Vite falling back to another port will break the connection.
- Rooms and player state live only in one backend process. Multiple server instances do not share state or coordinate rooms.
- Production hosting, TLS termination, reverse-proxy configuration, and deployment automation are absent.
- A deployed HTTPS frontend must use a `wss://` endpoint and a matching backend origin allow-list.
- Some generated files under `backend/target/` are tracked and may be stale. Never edit them or treat them as architectural evidence.
- There is no `.env` configuration, database, authentication, chat implementation, or persistent player identity in the current codebase.
