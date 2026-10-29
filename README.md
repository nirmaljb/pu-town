# PU Town

PU Town is a social deduction game for four to ten Players, played like Among Us. Players gather in an isolated Room around the Emergency button in the Town Square, then roam the town: the Mafia hunt and can vanish, the Doctor shields, the Sheriff scans, and anyone who finds a Body reports it and calls everyone back to the table to vote. A Spring Boot server owns the Roles, the clock, every position and every result, and tells each Player only what they are entitled to know, down to which Players they can see.

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

Open [http://localhost:5173](http://localhost:5173). Enter a Display Name, then Create Room or Join Lobby using a shared Room Code. Membership opens the Room's Lobby: a ring of ten inward-facing chairs around the red Emergency button in PU Town's Town Square. Players sit immediately, clockwise in the first vacant chair, and can toggle Ready. Names, distinct Player Colours and readiness identify each occupant. A Player keeps that chair for the whole Room, Lobby and Game alike; nobody walks.

The creator is Host. Start Game needs at least four Players present, all connected and Ready, and the Host is told which of those is missing until it is. An eleventh Join receives “Room is full”, and a started Room accepts no new Players.

Players receive one of ten randomly assigned published LPC Avatar Presets. In the Lobby, the character panel beside the Meeting Area shows ten named thumbnails in published order. Click to preview privately, then Use character to share the selection with the Room. Choices can repeat and do not change Ready; Start locks the last server-accepted choice. A coloured marker underneath distinguishes Players even when presets repeat. Copy code shares the Room Code; Leave Room returns to the form. The browser remembers the last submitted Display Name.

To verify the backend is running, request [http://localhost:8080/health](http://localhost:8080/health). It should return:

```json
{"status":"healthy"}
```

Vite may choose another port when `5173` is unavailable, but the backend accepts pages only from port `5173`. Free port `5173` before starting the frontend.

## Playing on several computers

One computer runs the servers; every Player, that computer included, plays in a browser. All the computers must be on the same network (the same Wi-Fi or router).

1. On the server computer, double-click `Start PU Town.bat` (Windows), or from the repository root run:

   ```sh
   python run.py
   ```

   Both servers listen on every network interface. Once they are up, it prints the address to share, for example `Same Wi-Fi/router:  https://192.168.1.5:5173/`. If it prints several, use the one on your Wi-Fi or Ethernet adapter rather than a virtual one (VMware, WSL, Hyper-V).
2. On each other computer, open that address in a browser. Nothing needs installing there. The page is https, because browsers only give a microphone (voice chat) to secure pages, and its certificate is the server computer's own: the browser warns once, so choose Advanced, then Proceed. `python run.py --http` serves plain http instead; voice then works only on the server computer.
   To play with friends on other networks, double-click `Share PU Town.bat` instead, or run `python run.py --share`: it also prints a public link through a free Cloudflare tunnel (install `cloudflared` once with `winget install --id Cloudflare.cloudflared`).
3. One Player chooses Create Room and shares the Room Code; everyone else enters it and chooses Join Lobby. When four or more Players are Ready, the Host starts the Game.

The page connects to the backend on port `8080` of whichever computer served it. The backend accepts pages from any host on port `5173` (`putown.allowed-origins` in `backend/src/main/resources/application.properties`).

If the page does not load on another computer, the server computer's firewall is blocking it. On Windows, allow Java and Node.js when it asks, or, from an Administrator PowerShell, run:

```powershell
New-NetFirewallRule -DisplayName "PU Town" -Direction Inbound -Protocol TCP -LocalPort 5173,8080 -Action Allow
```

## The Game

In the Lobby the Host chooses the deal with the − / + controls under the Town Square: one or two Mafia, one or two Sheriffs and at least one Doctor, and everyone else is a Villager. Every Player sees the choice. There must always be at least one Villager, so the Game needs one more Player than the special Roles, and never fewer than four. A new Room deals one of each. Each Player privately sees their own Role for eight seconds, and the Mafia also see each other. The Game then runs on the server's clock, with the current phase and its countdown always on screen:

| Phase | Length | What you do |
| --- | --- | --- |
| Roam | up to 150 s | Walk the town with WASD or the arrow keys. Use your abilities, find Bodies. |
| Meeting called | 5 s | Who called it, and everyone who died since the last Meeting. |
| Discussion | 90 s | Everyone living talks in public chat, seated around the button. |
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
| F | Everyone living | At the red button in the Town Square: call an Emergency Meeting, once per Game. |

Every cooldown starts 10 seconds in at the beginning of each Roam. Villagers have no ability, and they can't stay close to one Player for long: after about six seconds within arm's reach of someone, a Villager is pushed away. You only see Players within your Vision, a circle around you whose size depends on your Role: the Mafia see furthest, then the Doctor, then the Sheriff, and Villagers least. The server never sends anyone the positions it would hide. A kill is secret: only the Mafia and the victim know until someone finds the Body or a Meeting is called. The victim becomes a Ghost who can still walk and watch but is invisible to the living. The Mafia can whisper to each other during the Roam. If nobody reports anything before the Roam ends, a Meeting is called anyway, and every Roam starts with everyone standing up beside their Seat. When you die, your screen flashes red for two seconds to tell you.

A Meeting eliminates a Player only on a majority of the living, and reveals only their Faction. The Village wins when no Mafia is living; the Mafia win the moment they are at least as many as the Village. The Game then ends at once and every Role is revealed, including for Players who died or left.

Eliminated Players keep watching and keep reading the chat they could read while living, but cannot speak or vote. Disconnecting does not forfeit: the Player stays in the Game for the whole two-minute reservation, keeps their ballot, and still counts toward every majority. Leaving, or letting the reservation expire, does Forfeit — their seat stays on the table marked as left, and they stop counting toward anything.

## Voice chat

Choose **🎙 Join voice** in the corner of the town and allow the microphone. Everyone in the Lobby, at the Role Reveal, in every Meeting and after the Game hears everyone. During the Roam you hear only the living Players near you, louder the closer they are and from the side they stand on. That is never further than you can see, so a voice gives nobody away. A Vanished Mafia is silent to the Village. Ghosts hear each other anywhere in the town, and in Meetings they listen to the living but only other Ghosts hear them. Press **M** or the button to mute; **Leave voice** stops it. Underneath, the list shows whom you can hear right now, and a name lights up while that Player speaks.

Audio goes straight from browser to browser (WebRTC, 64 kbit/s Opus with echo cancellation and noise suppression), so on one network it has almost no delay. The server only decides who may hear whom. Headphones give the clearest sound. The browser remembers whether you joined voice and rejoins after a refresh. When two Players' browsers cannot reach each other directly (common over a shared link, behind mobile or strict home routers), their voice goes through the game server instead: it still works, with a little more delay, and the list marks that Player "via server". "connecting…" means nothing has arrived from them yet. Relaying needs a current Chrome, Edge, Firefox or Safari.

## The town by day and by night

The town is the Hollow: a hamlet in a forest clearing, with a river and two bridges past the orchard, farm, pasture and fishing camp in the west, the manor and the cobbled Town Square in the middle, the market lane in the south, homes and the smithy on the east road, and an old shrine with a portal in the north-east glade. Its sources, generator and credits are in [`pu-town/hollow/`](pu-town/hollow/README.md).

Press the ☀ Day / ☾ Night button in the corner of the town, or **N**, to see it at night: lamps, windows, hearths and the campfire light the streets, every Player carries a small lantern, the shrine glows and fireflies drift over the grass. Night is cosmetic and chosen by each Player for themselves; Vision and every rule are the same. The browser remembers the choice.

## Client options

The `ws` URL query parameter configures the backend WebSocket endpoint, defaulting to port `8080` on the computer that served the page. `time=night` or `time=day` overrides the remembered time of day. The former `room` and `name` parameters are ignored.

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

With both servers running (`python run.py`), the end-to-end test plays one whole Game with four isolated browsers through this computer's network address, the way four computers would: Create and Join, voice audio arriving at every browser from the three others, Ready and Start, private Roles, walking seen by others, an Emergency Meeting, chat, a refresh that recovers mid-Game, the vote and the Village's win.

```sh
cd frontend
npm run test:e2e
```

The first time, install its browser with `npx playwright install chromium`. It runs on the server's real clock, so it takes about three minutes. `PU_TOWN_URL` overrides the page address, for example `PU_TOWN_URL=https://192.168.1.5:5173/`.

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

## Run with Docker

No JDK, Node or Maven needed:

```sh
docker compose up --build
```

Open `http://localhost:5173`; other computers use `http://<this computer's address>:5173`. The backend is on port 8080. Browsers only grant the microphone on `localhost` or https, so voice chat from another computer needs https (see `run.py`).
