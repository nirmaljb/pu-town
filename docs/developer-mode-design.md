# Developer Mode and phase presentation

Status: confirmed by the implementation request; implementation based on the target commit below.

## Agreed scope

- Developer Mode supports both Simulated Players and real browser clients. A real client can take control of a Simulated Player.
- A developer can assign Roles, start with any Player count, pause or advance phases, and selectively override gameplay restrictions. Normal gameplay rules are enabled initially.
- Developers can choose each Player's Task assignments, required work and completion time, set or reset progress, and toggle Task victory. Test Scenarios arrange existing gameplay.
- Black-screen phase transitions replace the large phase header throughout ordinary multiplayer and Developer Mode: fade to black, show a centered phase title, then reveal the town.
- Show the assigned Role at Game start, keep Role information accessible through a compact control, and retain a small countdown wherever timing affects decisions.

## Accepted testing boundaries

- Developer Mode is local-only, enabled explicitly by backend configuration. It is unavailable through the public/Tailscale deployment. The Room creator controls the developer panel.
- Simulated Players start idle. The controller can move them, perform Tasks, submit Night choices and vote; simple automatic behaviors are optional.
- Developer Rooms retain ten Players initially, but allow additions and removals after Start.
- Pause freezes phase time and timed Task work; connection health and recovery continue.
- A separate controller inspector exposes Roles, choices and Task progress. Ordinary client views preserve recipient privacy.
- Phase transitions fade to black for 350 ms, hold a centered title for 800 ms and fade back for 350 ms, blocking gameplay input while the server clock continues. Stale transitions are skipped on recovery or foregrounding; reduced-motion mode uses a brief title card.

## Target baseline and current implementation

Target: remote `live-619e990-tailscale` at `b956e07921ca66de859533a5ac9c1a2076f243ff`, verified on 2026-10-12. This interview checkout is still at `e8a6bdd`; implementation must use the target baseline and preserve the interview notes.

The target baseline has Solo Practice, Role previews, phase advancement, Tasks and Fake Tasks. Solo Practice is a single-Player noncompetitive session; it does not provide multi-client scenario setup. The current Game interface has a persistent phase banner and Role card. Gameplay uses Day, Night and Townhall rather than the older live Roam abilities.

The server owns transitions, deadlines, membership, Roles, and private views. Normal Rooms have ten Seats and reject new memberships after Start. Developer exceptions must be explicit and scoped, with protocol, tests, and documentation kept synchronized.

## Accepted workflow

- Keep Solo Practice. Add a separate local Developer Room entry and a collapsible testing panel.
- The controller opens a local client for a selected Simulated Player. Automatic behavior stops while that client controls the Player. Explicit Release returns them to idle simulation; unexpected Disconnect uses normal recovery and expiry rules.
- Controller authority survives its recovery window. After expiry, another real client may take over. Simulated Players alone do not keep an abandoned Developer Room alive.
- Individual Roles can change immediately during a Game. Clear pending choices and unfinished Task interaction, switch real/Fake Task banks, and retain earned progress in each bank.
- Initial independent overrides cover automatic phase progression, faction victory, Task victory, Task duration/range, and Night movement. Provide teleport, eliminate/revive, and exact Role assignment controls. Normal rules are the initial defaults.
- Initial Test Scenarios cover a four-Role Game, Doctor protection and Sheriff investigation, Townhall voting, near-complete Task victory, and Disconnect/recovery.
- Reset scenario restores its starting state while retaining browser connections. Return to Lobby permits rebuilding the setup.

## Architecture and synchronization

Developer actions are server-owned Room operations, serialized with ordinary gameplay. Simulated Players are actual Room Players rather than the synthetic selection targets used by Solo Practice. Browser handoff retains the selected Player's identity and state. The local developer inspector is separately authorized and never broadens ordinary Player messages.

Local-only means Developer Mode is explicitly enabled on a local backend and its controls are restricted to loopback access; the public/Tailscale deployment must not expose developer commands or inspector data. Developer Rooms have explicit exceptions to ADR 0009's closed roster and final-Room lifecycle, and ADR 0014's fixed phase deadlines and ordinary private views. Ordinary Rooms retain those decisions. Record the scoped architectural trade-off in ADR 0021.

The implementation must synchronize Java and TypeScript protocol definitions, strict decoders, protocol documentation, README and AGENTS guidance. Recovery, phase timers, paused Task work, resets and late additions need WebSocket-boundary tests; privacy must be asserted against what connections receive. Frontend verification includes tests, typecheck and build; runtime verification includes at least two real browser clients and simulated Players.

Phase presentation applies to ordinary multiplayer, Solo Practice and Developer Mode. Show only recipient-authorized text, with the assigned Role shown at Game start and subsequently accessible through a compact control. Retain functional choices, Tasks, chat and results; remove the large persistent phase header and prominent Role box. Phase animation never delays or resets the server's deadlines.

## Confirmation

No design questions remain open from the interview. The implementation request confirms the complete design. The interview notes above retain the baseline and accepted scope.

## Verified testing needs

The target baseline gives each Task stage a 120-second interaction time. The repair, sequence and delivery assignments therefore require at least eighteen minutes of interaction in Solo Practice; configurable Task duration materially reduces testing time. Solo Practice currently uses synthetic choice targets rather than actual additional Players, and supports neither reset nor multiplayer takeover.

The scope above records the accepted interview answers. Any material expansion requires another design decision.
