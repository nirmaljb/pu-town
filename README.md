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

Open [http://localhost:5173](http://localhost:5173). Enter a Display Name, then Create Room or Join Room using a shared Room Code. Play starts after the server confirms membership. Use the arrow keys to move. Each Room supports eight Players with distinct colours. Players receive one of six randomly assigned LPC character presets with varied masculine and feminine appearances, skin tones, hairstyles, and clothing. Characters walk in four directions; a coloured marker underneath distinguishes Players even when presets repeat. Copy code shares the Room Code; Leave Room returns to the form. The browser remembers the last submitted Display Name.

To verify the backend is running, request [http://localhost:8080/health](http://localhost:8080/health). It should return:

```json
{"status":"healthy"}
```

Vite may choose another port when `5173` is unavailable, but the backend currently accepts WebSocket connections only from `http://localhost:5173` and `https://localhost:5173`. Free port `5173` before starting the frontend.

## Client options

The `ws` URL query parameter configures the backend WebSocket endpoint, defaulting to `ws://localhost:8080/ws/game`. The former `room` and `name` parameters are ignored.

Create Room generates a six-character Room Code. Join Room requires an existing code. Empty Rooms expire five minutes after their last Player leaves or disconnects; server restart clears all Rooms.

Initial entry times out after ten seconds. During connection loss, movement freezes and a reconnecting overlay appears. Heartbeats detect ten seconds without a server response. Reconnection attempts last up to thirty seconds, after which Retry and Back to join are available. Rejoining gets a new Player ID, spawn position, a fresh random Avatar Preset and potentially a new colour; it can fail if the Room has expired or filled.

## Character artwork

The six sprite sheets are composed from the [Universal LPC Spritesheet Character Generator](https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/) assets. Each is a 576×256 PNG: four direction rows (up, left, down, right), each containing a standing pose and eight walking frames in 64×64 cells.

[`frontend/public/assets/avatars/recipes.json`](frontend/public/assets/avatars/recipes.json) records the pinned upstream revision, ordered source layers, and exact palette substitutions. [`CREDITS.csv`](frontend/public/assets/avatars/CREDITS.csv) preserves the selected layers' authors, source URLs, and licenses. The game links to a readable credits page. Selected art is used under OGA-BY 3.0, with CC0 bob and long straight hairstyles.

The server and frontend must be restarted/refreshed together for the updated Player View contract. Presets stay fixed for a Room Membership; duplicates are allowed and reconnect draws again. Sprites use feet-anchored coordinates and can clip at the existing room edges.

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

The Phaser client applies local movement immediately, sends absolute positions over a versioned WebSocket protocol, and reconciles with authoritative server updates. The Spring Boot server owns room membership, validates movement, and broadcasts accepted state to players in the same room. All server state is currently held in memory.

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
