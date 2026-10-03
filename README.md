# PU Town

PU Town is a social deduction game for four to ten Players. Players explore the town during Day, sleep in place during Night, and gather at retained Seats for Townhall discussion and voting. A Spring Boot server owns Roles, the clock, accepted positions and every result, and tells each Player only what they are entitled to know.

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

Open [http://localhost:5173](http://localhost:5173). Enter a Display Name, then Create Room or Join Lobby using a shared Room Code. Membership opens the Room's Lobby: a ring of ten inward-facing chairs in PU Town's Town Square. Players sit immediately, clockwise in the first vacant chair, and can toggle Ready. Names, distinct Player Colours and readiness identify each occupant. A Player keeps that chair for the whole Room, Lobby and Game alike; Day movement begins beside that Seat.

The creator is Host. Start Game needs at least four Players present, all connected and Ready, and the Host is told which of those is missing until it is. An eleventh Join receives “Room is full”, and a started Room accepts no new Players.

Players receive one of ten randomly assigned published LPC Avatar Presets. In the Lobby, the character panel beside the Meeting Area shows ten named thumbnails in published order. Click to preview privately, then Use character to share the selection with the Room. Choices can repeat and do not change Ready; Start locks the last server-accepted choice. A coloured marker underneath distinguishes Players even when presets repeat. Copy code shares the Room Code; Leave Room returns to the form. The browser remembers the last submitted Display Name.

To verify the backend is running, request [http://localhost:8080/health](http://localhost:8080/health). It should return:

```json
{"status":"healthy"}
```

Vite may choose another port when `5173` is unavailable, but the backend currently accepts WebSocket connections only from `http://localhost:5173` and `https://localhost:5173`. Free port `5173` before starting the frontend.

### Public access with Tailscale Funnel

For temporary public access, build the frontend with `npm run build` and the backend with `./mvnw package`. Start the backend from `backend/`, allowing the exact public frontend origin for both WebSocket connections and Avatar Collection requests:

```sh
java -jar target/backend-0.0.1-SNAPSHOT.jar --server.address=127.0.0.1 --putown.allowed-origins=http://localhost:5173,https://localhost:5173,https://YOUR-MACHINE.YOUR-TAILNET.ts.net:8443
```

From `frontend/`, serve the built bundle on loopback:

```sh
__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=YOUR-MACHINE.YOUR-TAILNET.ts.net npx vite preview --host 127.0.0.1 --port 5173 --strictPort
```

Expose the two services on separate Funnel ports, preserving any existing route on port 443:

```sh
tailscale funnel --bg --https=8443 http://127.0.0.1:5173
tailscale funnel --bg --https=10000 http://127.0.0.1:8080
```

Open `https://YOUR-MACHINE.YOUR-TAILNET.ts.net:8443/?ws=wss%3A%2F%2FYOUR-MACHINE.YOUR-TAILNET.ts.net%3A10000%2Fws%2Fgame`. The `ws` parameter is required; it also directs Avatar Collection requests to the public backend. Check the backend at `https://YOUR-MACHINE.YOUR-TAILNET.ts.net:10000/health`. Replace the example hostname with your machine's Tailscale DNS name. These endpoints are public, and the local processes must remain running. The backend's `putown.allowed-origins` setting (or `PUTOWN_ALLOWED_ORIGINS` environment variable) replaces the default comma-separated allow-list; use exact origins rather than `*`.

Stop only these tunnels with `tailscale funnel --https=8443 off` and `tailscale funnel --https=10000 off`.

## The Game

The Game map fills the available width and stays centered, with phase information,
ballots and chat over the town rather than in a reserved sidebar. Your Role opens
during the reveal; click its heading to consult the instructions later. Retained
results can be opened separately. During play the Room Code is plain selectable
text, and Leave Room stays available. Copy code is available in the Lobby.
Settings and microphone controls will arrive with their respective feature slices.

In the Lobby the Host chooses the deal with the − / + controls under the Town Square: one or two Mafia, one or two Sheriffs and at least one Doctor, and everyone else is a Villager. Every Player sees the choice. There must always be at least one Villager, so the Game needs one more Player than the special Roles, and never fewer than four. A new Room deals one of each. Each Player privately sees their own Role for eight seconds, and the Mafia also see each other. The Game then runs on the server's clock, with the current phase and its countdown always on screen:

| Phase | Length | What you do |
| --- | --- | --- |
| Day | 180 s | Walk the town with WASD or arrow keys. |
| Night | 20 s | Sleep where you stood; movement and conversation are closed. |
| Townhall discussion | 90 s | Everyone living talks in public chat, seated around the Town Square. |
| Townhall voting | 30 s | One confirmed ballot each, or Skip. |
| Voting result | 6 s | The result, with every vote shown. |

Phases end at server deadlines even if a browser is hidden or reconnecting. There is no Emergency button, Report, Body, Vanish, Crowding or live daytime Role ability. Night target choices, Tasks, interiors, shared Day Vision, proximity text, voice and Solo Practice are subsequent slices of [epic #22](https://github.com/nirmaljb/pu-town/issues/22); they are not playable yet. The current Night resolves no Role choices and nobody dies during it.

Day starts beside retained Seats; Night preserves accepted positions; Townhall returns everyone to their Seat. Night dims the town and shows sleeping Avatars. A refresh during Day or Night restores accepted positions and the private Role immediately. The living currently see only Avatars within their Role's Vision: Mafia 440 px, Doctors 380, Sheriffs 330 and Villagers 270. Eliminated Participants can walk during Day and see the town, unseen by the living. Day and Night have no text channel; public text opens during Townhall discussion and voting.

During Townhall voting, select any living Participant (including yourself) or Skip in the centered ballot panel. Selection is a private preview; only Confirm ballot submits it. Confirmed choices stay locked for the round, including after a same-tab refresh, and public chat remains open until the thirty-second voting deadline. If an unconfirmed target Leaves, select another target before confirming. Everyone sees the ballots when voting ends.

Townhall eliminates a Participant only with a strict majority of the living. Ties, Skip and insufficient votes eliminate nobody. The six-second verdict reveals the eliminated Participant’s exact Role and retains their Game Roster entry. Village wins when no Mafia remains living, and Mafia wins at parity. A decided Game finishes after the full verdict and reveals every Role; otherwise the next Day begins. Forfeit can decide victory immediately.

Eliminated Players keep watching and keep reading the chat they could read while living, but cannot speak or vote. Disconnecting does not forfeit: the Player stays in the Game for the whole two-minute reservation, keeps their ballot, and still counts toward every majority. Leaving, or letting the reservation expire, does Forfeit — their seat stays on the table marked as left, and they stop counting toward anything.

## Solo Practice

Create a Room and, while you are its only Player, choose **Solo Practice** in the Lobby. Ready and the competitive Role Setup are not required. You enter Day as a Villager and can walk the existing map with WASD or arrow keys. **Next phase** previews sleeping Night, Townhall discussion, voting and results, then begins the next Day beside your retained Seat. Practice has no timers, ballots, elimination or faction victory. Role previews, practice targets and Task interactions are follow-up work (#40 and #41).

Disconnect, refresh and recovery retain the same practice Membership and current phase, including your accepted position during Day or Night. Leave ends practice; create another Room to practice again or gather Players for a competitive Game. A guest's disconnected reservation still blocks Solo Practice entry. Competitive Start continues to need at least four connected, Ready Players and a valid Role Setup.

## Client options

The `ws` URL query parameter configures the backend WebSocket endpoint, defaulting to `ws://localhost:8080/ws/game`. The former `room` and `name` parameters are ignored.

Create Room generates a six-character Room Code. Join Lobby requires an existing code. Only Lobbies accept new memberships; a started game returns “Game already started”. Empty Lobbies expire five minutes after their final membership ends; started Rooms are removed immediately when their final membership ends; Disconnect reserves membership for two minutes and does not immediately empty a Room; server restart clears all Rooms.

Initial entry times out after ten seconds. During connection loss, controls stop and a reconnecting overlay appears. Heartbeats run independently of game frames and detect ten seconds without a pong. Returning from suspension gives the socket one fresh heartbeat deadline; a healthy tab switch preserves the Player ID and Avatar Preset. Lifecycle effects still apply at game-frame boundaries. Recovery retries use increasing delays capped at five seconds and continue until the server confirms recovery or returns a terminal result. Returning to a visible tab makes a pending retry immediate. Recovery uses a private credential stored in sessionStorage for refresh in the same tab; it retains Player ID, Avatar Preset, Colour, Seat, readiness, and — in a Game — the Role, the locked choices, the Sheriff's results and the chat that Player may read. Other Players see a subdued Avatar labelled “Reconnecting…” until recovery or expiry. A valid replacement atomically takes over; the displaced tab shows that its connection was replaced and stops retrying. Ordinary new tabs join independently. Duplicated tabs that inherit the credential follow the takeover rule. Storage-disabled browsers retain in-memory recovery only.

Expired recovery shows “Your place in the Room expired” and “Back to lobby selection”, which clears recovery intent and returns to the Create Room / Join Lobby form without sending a fresh Join. A later Join from that form requires a Room still in its Lobby and begins a new membership. An unavailable Room produces a terminal explanation rather than creating a replacement Room. Leave Room during recovery immediately clears intent and returns to entry, with one bounded attempt to recover and Leave the reservation when reachable; otherwise it expires naturally. Closing/reopening tabs and cross-device recovery are not guaranteed.

Players are seated in the Lobby and Townhall, walk during Day, and sleep in place during Night. Leave and expiry free chairs without shifting other occupants; Disconnect reserves the chair. When the Host leaves or expires, the longest-present connected Player becomes Host if available. A disconnected Host retains authority for fifteen seconds. At the deadline it transfers to the longest-present connected Player; if none is connected, the first returning Player becomes Host. A returning former Host does not reclaim transferred authority. The Room Code and Leave control remain available in both phases. A started Room is removed after its final membership ends through Leave or expiry. Recoverable disconnected memberships keep it alive, even when nobody is connected; it never resets to a Lobby.

## Local Settings

Settings is available from entry, the Lobby and during a Game. It offers separate
master, effects, ambience and voice volume sliders plus local sound previews.
Levels are remembered on this browser and apply to current and newly created audio
channels. Previews require a click and never send sound to other Players. Gameplay
effects, ambience tracks and voice are implemented in subsequent tickets; this
slice provides their shared volume controls and audio routing.

Reduced motion defaults to the browser preference until you choose a value. The
saved choice controls interface animation, camera easing, Avatar motion and town
decoration without changing movement rules or Game deadlines. Prefer fullscreen
remembers intent; Enter fullscreen still requires a click. The displayed state
tracks actual browser activation, including external exits. Unsupported fullscreen
and unavailable local storage do not prevent play; storage-disabled preferences
last only for the current page.

Settings keeps the Game clock running. Close Settings (or Escape) returns focus to
its opener; movement and ability shortcuts are inactive while the dialog is open.

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

### Browser acceptance

Install the Playwright browser and Linux dependencies once, then run the browser suite:

```sh
cd frontend
npx playwright install --with-deps chromium
npm run test:browser
```

The harness starts this checkout's backend on port `18081` and Vite on `5173`,
checks `/health`, and closes both after testing. It requires JDK 17 and free ports;
it never reuses an existing development server. If another checkout occupies the
default loopback address on `5173`, use `PU_TOWN_E2E_HOST=127.0.0.2 npm run test:browser`
to bind a separate loopback address while keeping the browser's supported
`http://localhost:5173` origin. When another harness occupies backend port `18081`,
set `PU_TOWN_E2E_BACKEND_PORT` to a free port as well; both server startup and
browser connections use it.

Each viewport journey waits through a full cycle (about six minutes). The suite uses Phaser's Canvas renderer and four independent browser contexts
at desktop and phone sizes, including ballot interaction after a landscape resize
and announcements containing a long Display Name. It exercises Create/Join, Ready/Start, centered map
and overlay geometry, Role disclosure, Day movement, sleeping Night and its movement lock, same-tab Night recovery, Townhall public chat,
ballot preview/confirmation, the six-second result, Seat reset for Day two, Leave and a new Room. It waits for real server phase
deadlines. Failures retain Playwright traces in `frontend/test-results/`; the
voting and sleeping Night screens are also captured there. This is automated browser evidence for
the timed cycle in #24. The four-Player ballot journey covers keyboard
selection, private previews, locked Skip and target ballots, target Leave,
chat during voting, same-tab ballot recovery and public results for #25.
The #25 browser run on this checkout has not passed acceptance: Chromium crashed
before voting under host resource pressure. The trace is retained locally; the
WebSocket and frame-boundary regressions provide separate deterministic evidence.
The suite does not verify the future Tasks, Night choices,
interiors or media features in epic #22, or constitute manual playtesting.

If trace capture causes Chromium failures in your environment,
`npm run test:browser -- --trace off` runs the same browser actions and assertions
without recording traces. Failed runs then have no trace archive to inspect.

Settings acceptance covers independent Player preferences, refresh recovery,
phase progression with the dialog open, actual fullscreen entry/exit and
reduced-motion overrides. A browser analyser samples Web Audio output for master
and category attenuation, mute and refreshed/new channels. These automated samples
verify local audio routing; they do not establish physical-speaker audibility,
voice privacy or task balance.


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

The Phaser client applies every server event at a game-frame boundary and renders authorized views from that state; it predicts only its own Avatar's Day movement and adopts server corrections. The Spring Boot server owns Room membership, the Game's Roles, its clock and every result, and builds a separate view for each recipient — a Player is never sent a Role, a Mafia vote or a private chat they are not entitled to, so concealment never depends on the client. Accepted choices update only the Players whose authorized view actually changed, so a timed phase cannot leak hidden activity through its own countdown. All server state is currently held in memory.

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
