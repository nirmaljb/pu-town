# Village interface

The title, Lobby and Game controls should feel like part of PU Town's illustrated village. This refresh follows the requested menu and interactivity recommendation on `live-619e990-tailscale`, adapted to that branch's Day, Night and Townhall rules. It does not restore the retired live Roam abilities.

## Presentation and interaction

- Show the existing animated town behind the title. Present Create Room and Join Room first, then the relevant Display Name and Room Code inputs. Back or Escape returns to those choices before connecting. Retain the remembered Display Name and existing recovery flow.
- Use original pixel-grid timber and paper frames, a forest-green ribbon palette and local Silkscreen headings. Keep longer instructions and chat in readable system text. Artwork and font provenance live in `frontend/public/assets/ui/README.md`.
- Share materials, visible keyboard focus, hover, pressed and unavailable states across Lobby, Game, tasks, voice, settings and recovery controls. Keep text alongside icons and colour cues.
- Animate character thumbnails on hover or keyboard focus. Reduced motion disables the animation and the town's decorative movement. Accepted character and Ready state remain server-owned; local animation never changes a cosmetic selection.
- Add portraits from the Room's pinned collection to Night and Townhall choices. Retain ballot DOM elements so incoming chat and state updates preserve focus. Selection is a local preview; explicit confirmation sends the existing request and accepted state follows the frame boundary.
- Reuse the saved effects volume for quiet press/selection cues and a separate cue for an accepted Ready or character change. Recovery snapshots establish a silent baseline. Existing task sounds and sound previews keep their own cues.
- Measure the Room bar and Lobby controls to reserve space for the scene and chooser as controls wrap. Narrow or short windows stack the scene, a usable character chooser and Host controls in a scrolling Lobby, with a sticky Room bar.

## Verification

Run `npm run typecheck`, `npm test` and `npm run build` from `frontend/`, with the documented Pillow dependency available to Python. Browser automation is explicitly excluded by the request. Passing these checks does not establish browser appearance or multiplayer integration acceptance.

For manual acceptance, check entry/Back/Enter with mouse and keyboard, invalid entry and retry, Lobby selection/Ready, narrow and short windows, sound volume zero, reduced motion, Night and Townhall choices, Leave and reconnect. Use two Players when inspecting accepted shared changes and recovery. This checklist records remaining manual verification, not a claim that it was performed.

## Design references

- [Consistency — Pedro Medeiros](https://saint11.art/blog/consistency/)
- [Juice It or Lose It — Jonasson and Purho](https://gdcvault.com/play/1016487/Juice-It-or-Lose)
- [The User Interface Continuum — Kristine Jørgensen](https://www.gamedeveloper.com/design/the-user-interface-continuum-a-study-of-player-preference)
- [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/full-list/)
- [Tiny Swords — Pixel Frog](https://pixelfrog-assets.itch.io/tiny-swords), the town's existing art family; no new third-party pack is redistributed by this refresh.
