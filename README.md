# PU Town

PU Town is a small shared top-down game world. Players join isolated rooms, see one another in real time, and move Phaser-rendered avatars while a Spring Boot server validates and broadcasts their positions.

The project currently targets local development. It consists of two processes:

- a Java 17 Spring Boot WebSocket backend on `http://localhost:8080`
- a TypeScript, Vite, and Phaser frontend on `http://localhost:5173`

## Prerequisites

Install the following before starting:

- JDK 17, including `java` and `javac`
- Node.js `^20.19.0` or `>=22.12.0`
- npm

Maven does not need to be installed globally; the repository includes Maven Wrapper. The first installation needs internet access to download Maven, Java dependencies, and npm packages.

## Installation and local development

Clone the repository, then install the frontend dependencies:

```sh
cd frontend
npm ci
```

Start the backend from the repository root:

```sh
cd backend
./mvnw spring-boot:run
```

On Windows, use `mvnw.cmd spring-boot:run` instead.

In a second terminal, start the frontend:

```sh
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Enter a Display Name, then Create Room or Join Lobby using a shared Room Code. Membership opens the Room's Lobby: a wooden Town Hall Meeting Area with ten inward-facing chairs. Players sit immediately, clockwise in the first vacant chair, and can toggle Ready. Names, distinct Player Colours and readiness identify each occupant. The creator is Host and can Start Game even alone or with unready Players; other Players wait for the Host. Start takes everyone into the existing playable world, where the arrow keys move. Each Room supports ten Players with distinct colours; an eleventh Join receives “Room is full”. Players receive one of six randomly assigned LPC character presets with varied masculine and feminine appearances, skin tones, hairstyles, and clothing. Arrow-key input determines shared Facing, including when a boundary blocks movement, and standing retains it. Characters walk in four directions; a coloured marker underneath distinguishes Players even when presets repeat. Copy code shares the Room Code; Leave Room returns to the form. The browser remembers the last submitted Display Name.

To verify the backend is running, request [http://localhost:8080/health](http://localhost:8080/health). It should return:

```json
{"status":"healthy"}
```

Vite may choose another port when `5173` is unavailable, but the backend currently accepts WebSocket connections only from `http://localhost:5173` and `https://localhost:5173`. Free port `5173` before starting the frontend.

## Client options

The `ws` URL query parameter configures the backend WebSocket endpoint, defaulting to `ws://localhost:8080/ws/game`. The former `room` and `name` parameters are ignored.

Create Room generates a six-character Room Code. Join Lobby requires an existing code. Only Lobbies accept new memberships; a started game returns “Game already started”. Empty Lobbies expire five minutes after their final membership ends; started Rooms are removed immediately when their final membership ends; Disconnect reserves membership for two minutes and does not immediately empty a Room; server restart clears all Rooms.

Initial entry times out after ten seconds. During connection loss, movement freezes and a reconnecting overlay appears. Heartbeats run independently of game frames and detect ten seconds without a pong. Returning from suspension gives the socket one fresh heartbeat deadline; a healthy tab switch preserves the Player ID and Avatar Preset. Lifecycle effects still apply at game-frame boundaries. Recovery retries use increasing delays capped at five seconds and continue until the server confirms recovery or returns a terminal result. Returning to a visible tab makes a pending retry immediate. Recovery uses a private credential stored in sessionStorage for refresh in the same tab; it retains Player ID, Avatar Preset, Colour, Seat, readiness, and the last accepted position and Facing. Other Players see a subdued Avatar labelled “Reconnecting…” until recovery or expiry. A valid replacement atomically takes over; the displaced tab shows that its connection was replaced and stops retrying. Ordinary new tabs join independently. Duplicated tabs that inherit the credential follow the takeover rule. Storage-disabled browsers retain in-memory recovery only.

Expired recovery shows “Your place in the Room expired” and “Back to lobby selection”, which clears recovery intent and returns to the Create Room / Join Lobby form without sending a fresh Join. A later Join from that form requires a Room still in its Lobby and begins a new membership. An unavailable Room produces a terminal explanation rather than creating a replacement Room. Leave Room during recovery immediately clears intent and returns to entry, with one bounded attempt to recover and Leave the reservation when reachable; otherwise it expires naturally. Closing/reopening tabs and cross-device recovery are not guaranteed.

The Lobby keeps Players stationary on both client and server. Leave and expiry free chairs without shifting other occupants; Disconnect reserves the chair. When the Host leaves or expires, the longest-present connected Player becomes Host if available. A disconnected Host retains authority for fifteen seconds. At the deadline it transfers to the longest-present connected Player; if none is connected, the first returning Player becomes Host. A returning former Host does not reclaim transferred authority. The Room Code and Leave control remain available in both phases. A started Room is removed after its final membership ends through Leave or expiry. Recoverable disconnected memberships keep it alive, even when nobody is connected; it never resets to a Lobby.

## Character artwork

The six sprite sheets are composed from the [Universal LPC Spritesheet Character Generator](https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/) assets. Each is a 576×256 PNG: four direction rows (up, left, down, right), each containing a standing pose and eight walking frames in 64×64 cells.

Lobby arrivals play a short sit-down transition, then hold a seated pose with pixel-drawn bent legs in their preset's trouser colours. The existing head and upper body keep their original proportions. Players already present appear seated immediately to newcomers; readiness changes do not replay sitting, and Start restores standing and walking immediately. See [the sitting animation specification](docs/sitting-animation-spec.md). While Vite is running, `/test/sitting-preview.html` provides a manual gallery of every preset and Facing, with replay and cancellation controls.

[`frontend/public/assets/avatars/recipes.json`](frontend/public/assets/avatars/recipes.json) records the pinned upstream revision, ordered source layers, and exact palette substitutions. [`CREDITS.csv`](frontend/public/assets/avatars/CREDITS.csv) preserves the selected layers' authors, source URLs, and licenses. The game links to a readable credits page. Selected art is used under OGA-BY 3.0, with CC0 bob and long straight hairstyles.

The server and frontend must be restarted/refreshed together for the updated connected-presence and private snapshot recovery contract. Presets stay fixed for a Room Membership; duplicates are allowed and recovery preserves the preset. Sprites use feet-anchored coordinates and can clip at the existing room edges.

## Tests and builds

Run the frontend checks:

```sh
cd frontend
npm test
npm run typecheck
npm run build
```

The production frontend bundle is written to `frontend/dist/`.

Run the backend tests and create an executable JAR:

```sh
cd backend
./mvnw test
./mvnw package
```

After packaging, run the backend with:

```sh
java -jar backend/target/backend-0.0.1-SNAPSHOT.jar
```

## Architecture

The Phaser client applies local movement immediately and sends absolute positions, retained Facing, and sequence/epoch counters over a versioned WebSocket protocol. Accepted echoes preserve newer prediction; explicit corrections reset rejected positions and invalidate outstanding movement. Losing focus clears controls, and restoration applies queued state before fresh input without catch-up movement. The Spring Boot server owns room membership, validates movement, and broadcasts accepted state to players in the same room. All server state is currently held in memory.

Important project documentation:

- [`CONTEXT.md`](CONTEXT.md) defines the project's canonical domain language.
- [`docs/websocket-protocol-v1.md`](docs/websocket-protocol-v1.md) defines the WebSocket wire contract.
- [`docs/adr/`](docs/adr/) records the architectural decisions behind movement validation, protocol versioning, frame-boundary updates, and room event serialization.
- [`AGENTS.md`](AGENTS.md) provides repository guidance for coding agents and contributors working on the codebase.

## Deployment status

Production deployment is not configured. Before deploying, at minimum:

- configure the backend's allowed WebSocket origins for the deployed frontend
- use a secure `wss://` WebSocket URL when the site is served over HTTPS
- decide how room state will be shared or routed across server instances
- add the required hosting, reverse-proxy, and runtime configuration
