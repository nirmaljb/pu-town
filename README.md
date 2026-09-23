# PU Town

PU Town is a social deduction game for four to ten Players, played like Among Us. Players gather in an isolated Room around a Town Hall table, then roam a small town: the Mafia hunt and can vanish, the Doctor shields, the Sheriff scans, and anyone who finds a Body reports it and calls everyone back to the table to vote. A Spring Boot server owns the Roles, the clock, every position and every result, and tells each Player only what they are entitled to know, down to which Players they can see.

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

Open [http://localhost:5173](http://localhost:5173). Enter a Display Name, then Create Room or Join Lobby using a shared Room Code. Membership opens the Room's Lobby: a wooden Town Hall Meeting Area with ten inward-facing chairs. Players sit immediately, clockwise in the first vacant chair, and can toggle Ready. Names, distinct Player Colours and readiness identify each occupant. A Player keeps that chair for the whole Room, Lobby and Game alike; nobody walks.

The creator is Host. Start Game needs at least four Players present, all connected and Ready, and the Host is told which of those is missing until it is. An eleventh Join receives “Room is full”, and a started Room accepts no new Players.

Players receive one of ten randomly assigned published LPC Avatar Presets. In the Lobby, the character panel beside the Meeting Area shows ten named thumbnails in published order. Click to preview privately, then Use character to share the selection with the Room. Choices can repeat and do not change Ready; Start locks the last server-accepted choice. A coloured marker underneath distinguishes Players even when presets repeat. Copy code shares the Room Code; Leave Room returns to the form. The browser remembers the last submitted Display Name.

To verify the backend is running, request [http://localhost:8080/health](http://localhost:8080/health). It should return:

```json
{"status":"healthy"}
```

Vite may choose another port when `5173` is unavailable, but the backend currently accepts WebSocket connections only from `http://localhost:5173` and `https://localhost:5173`. Free port `5173` before starting the frontend.

## The Game

Start deals one Mafia to a table of four to six, two to seven or eight, and three to nine or ten, with one Doctor and one Sheriff; everyone else is a Villager. Each Player privately sees their own Role for eight seconds, and the Mafia also see each other. The Game then runs on the server's clock, with the current phase and its countdown always on screen:

| Phase | Length | What you do |
| --- | --- | --- |
| Roam | up to 150 s | Walk the town with WASD or the arrow keys. Use your abilities, find Bodies. |
| Meeting called | 5 s | Who called it, and everyone who died since the last Meeting. |
| Discussion | 90 s | Everyone living talks in public chat at the Town Hall table. |
| Voting | 30 s | One vote each, or Skip. |
| Voting result | 6 s | The result, with every vote shown. |

During the Roam:

| Key | Who | What it does |
| --- | --- | --- |
| Q | Mafia | Kill a Village Player right next to you (25 s cooldown). They drop as a Body where they stood. |
| E | Mafia | Vanish: nobody but the Mafia can see you for 10 s (30 s cooldown). |
| Q | Doctor | Shield a nearby Player for 20 s: the next kill on them fails and uses up the Shield (30 s cooldown). |
| Q | Sheriff | Scan a nearby Player and learn, privately, whether they are Mafia (30 s cooldown). |
| R | Everyone living | Report a Body next to you, which calls a Meeting. |
| F | Everyone living | At the red button in the Town Hall: call an Emergency Meeting, once per Game. |

Every cooldown starts 10 seconds in at the beginning of each Roam. Villagers have no ability, and they can't stay close to one Player for long: after about six seconds within arm's reach of someone, a Villager is pushed away. You only see Players within your Vision, a circle around you, and the server never sends anyone the positions it would hide. A kill is secret: only the Mafia and the victim know until someone finds the Body or a Meeting is called. The victim becomes a Ghost who can still walk and watch but is invisible to the living. The Mafia can whisper to each other during the Roam. If nobody reports anything before the Roam ends, a Meeting is called anyway, and every Roam starts with everyone standing up from their Seat.

A Meeting eliminates a Player only on a majority of the living, and reveals only their Faction. The Village wins when no Mafia is living; the Mafia win the moment they are at least as many as the Village. The Game then ends at once and every Role is revealed, including for Players who died or left.

Eliminated Players keep watching and keep reading the chat they could read while living, but cannot speak or vote. Disconnecting does not forfeit: the Player stays in the Game for the whole two-minute reservation, keeps their ballot, and still counts toward every majority. Leaving, or letting the reservation expire, does Forfeit — their seat stays on the table marked as left, and they stop counting toward anything.

## Client options

The `ws` URL query parameter configures the backend WebSocket endpoint, defaulting to `ws://localhost:8080/ws/game`. The former `room` and `name` parameters are ignored.

Create Room generates a six-character Room Code. Join Lobby requires an existing code. Only Lobbies accept new memberships; a started game returns “Game already started”. Empty Lobbies expire five minutes after their final membership ends; started Rooms are removed immediately when their final membership ends; Disconnect reserves membership for two minutes and does not immediately empty a Room; server restart clears all Rooms.

Initial entry times out after ten seconds. During connection loss, controls stop and a reconnecting overlay appears. Heartbeats run independently of game frames and detect ten seconds without a pong. Returning from suspension gives the socket one fresh heartbeat deadline; a healthy tab switch preserves the Player ID and Avatar Preset. Lifecycle effects still apply at game-frame boundaries. Recovery retries use increasing delays capped at five seconds and continue until the server confirms recovery or returns a terminal result. Returning to a visible tab makes a pending retry immediate. Recovery uses a private credential stored in sessionStorage for refresh in the same tab; it retains Player ID, Avatar Preset, Colour, Seat, readiness, and — in a Game — the Role, the locked choices, the Sheriff's results and the chat that Player may read. Other Players see a subdued Avatar labelled “Reconnecting…” until recovery or expiry. A valid replacement atomically takes over; the displaced tab shows that its connection was replaced and stops retrying. Ordinary new tabs join independently. Duplicated tabs that inherit the credential follow the takeover rule. Storage-disabled browsers retain in-memory recovery only.

Expired recovery shows “Your place in the Room expired” and “Back to lobby selection”, which clears recovery intent and returns to the Create Room / Join Lobby form without sending a fresh Join. A later Join from that form requires a Room still in its Lobby and begins a new membership. An unavailable Room produces a terminal explanation rather than creating a replacement Room. Leave Room during recovery immediately clears intent and returns to entry, with one bounded attempt to recover and Leave the reservation when reachable; otherwise it expires naturally. Closing/reopening tabs and cross-device recovery are not guaranteed.

Players are stationary on both client and server. Leave and expiry free chairs without shifting other occupants; Disconnect reserves the chair. When the Host leaves or expires, the longest-present connected Player becomes Host if available. A disconnected Host retains authority for fifteen seconds. At the deadline it transfers to the longest-present connected Player; if none is connected, the first returning Player becomes Host. A returning former Host does not reclaim transferred authority. The Room Code and Leave control remain available in both phases. A started Room is removed after its final membership ends through Leave or expiry. Recoverable disconnected memberships keep it alive, even when nobody is connected; it never resets to a Lobby.

## Character artwork

The ten published sprite sheets are composed from the [Universal LPC Spritesheet Character Generator](https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/) assets. Each is a 576×256 PNG: four direction rows (up, left, down, right), each containing a standing pose and eight walking frames in 64×64 cells.

Lobby arrivals play a short sit-down transition, then hold a seated pose with generated bent legs and shoes in their recipe’s trouser and footwear colours. The existing head and upper body keep their original proportions. Players already present appear seated immediately to newcomers; readiness changes do not replay sitting, and Start leaves everyone seated exactly where they were. See [the sitting animation specification](docs/sitting-animation-spec.md). While Vite is running, `/test/sitting-preview.html` provides a manual gallery of every preset and Facing, with replay and cancellation controls.

The project-local [Avatar workshop](tools/avatar-editor/README.md) contains curated source layers, editable recipes for all ten initial designs, and the original pinned LPC source revision. [`CREDITS.csv`](frontend/public/assets/avatars/CREDITS.csv) and the in-game credits page preserve source authors, URLs, and licenses. Selected art uses OGA-BY 3.0, with CC0 bob and long straight hairstyles.

### Local Avatar workshop

Python 3.10+ and Pillow are required for authoring and its automated suite:

```sh
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r tools/avatar-editor/requirements.txt
cd frontend
npm run avatars
```

Open [http://localhost:5174](http://localhost:5174). Create, name, compose and save drafts; reopen them from the library, duplicate variants, or delete drafts. Supported clothing parts follow the selected body proportions. Skin, hair, face, top, bottom and footwear controls drive standing, walking and seated previews in all four directions. Draft saves never publish. Check the designs you want in the library, arrange their order, then explicitly Publish collection; a collection holds at least one preset and has no upper bound. Failed validation leaves the last publication intact; deleting or editing drafts cannot mutate it.

The publication is one atomic [`published-avatars.json`](backend/data/published-avatars.json) artifact with stable IDs, names, ordered sprite sheets and seated artwork. The backend is its only reader: it resolves the current collection when it creates a Room and serves it, artwork included, from `GET /rooms/{roomCode}/avatars`. Clients fetch it on join, because only then do they know which Room they are entering. The editor, endpoints, source layers and unpublished drafts are outside the Player build.

Publishing takes effect immediately for Rooms created from then on — no rebuild, no restart. A Room keeps the collection it was created with for its whole life, so no running Lobby changes underneath its Players. Superseded collections stay in memory only while some Room still references one. `putown.avatars.publication` overrides the file's location for the backend.

Accepted choices belong to Room Membership, survive Disconnect and same-tab refresh, and are locked at Start. Leave ends the choice; fresh membership draws again and may receive the same preset. Sprites use feet-anchored coordinates and can clip at the existing room edges.

## Tests and builds

With the Python environment above active, run the frontend checks (including the authoring boundary suite):

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

The Phaser client applies every server event at a game-frame boundary and renders from that state alone; it predicts nothing. The Spring Boot server owns Room membership, the Game's Roles, its clock and every result, and builds a separate view for each recipient — a Player is never sent a Role, a Mafia vote or a private chat they are not entitled to, so concealment never depends on the client. Accepted choices update only the Players whose authorized view actually changed, so a timed phase cannot leak hidden activity through its own countdown. All server state is currently held in memory.

Important project documentation:

- [`CONTEXT.md`](CONTEXT.md) defines the project's canonical domain language.
- [`docs/websocket-protocol-v1.md`](docs/websocket-protocol-v1.md) defines the WebSocket wire contract.
- [`docs/adr/`](docs/adr/) records the architectural decisions behind protocol versioning, frame-boundary updates, Room event serialization, permanent seating, the retained Game Roster, and per-recipient Game state.
- [`AGENTS.md`](AGENTS.md) provides repository guidance for coding agents and contributors working on the codebase.

## Deployment status

Production deployment is not configured. Before deploying, at minimum:

- configure the backend's allowed WebSocket origins for the deployed frontend
- use a secure `wss://` WebSocket URL when the site is served over HTTPS
- decide how room state will be shared or routed across server instances
- add the required hosting, reverse-proxy, and runtime configuration
