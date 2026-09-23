import { AvatarChooser } from "./avatar-chooser.js";
import type { AvatarCollection } from "./avatar-presets.js";
import { ROOM_CAPACITY } from "./meeting-area.js";
import { MIN_PLAYERS } from "./room-rules.js";
import type { WorldState } from "./world-state.js";
import { MAX_MAFIA, MAX_SHERIFFS, normalizeDisplayName, type RoleSetup } from "./protocol.js";
import { ReconnectingGameClient, type ConnectionState } from "./reconnecting-game-client.js";

const NAME_KEY = "pu-town.display-name";

type SetupRole = keyof RoleSetup;
const SETUP_ROLES: readonly Readonly<{ role: SetupRole; label: string; max: number }>[] = [
  { role: "mafia", label: "Mafia", max: MAX_MAFIA },
  { role: "doctors", label: "Doctors", max: ROOM_CAPACITY },
  { role: "sheriffs", label: "Sheriffs", max: MAX_SHERIFFS }
];

function specialRoles(setup: RoleSetup): number {
  return setup.mafia + setup.doctors + setup.sheriffs;
}

export class JoinInterface {
  readonly #root = document.createElement("div");
  readonly #chooser: AvatarChooser;
  readonly #form: HTMLFormElement;
  readonly #name: HTMLInputElement;
  readonly #code: HTMLInputElement;
  #lastState: ConnectionState | null = null;
  #world?: WorldState;
  #lastWorld?: WorldState;

  constructor(private readonly client: ReconnectingGameClient) {
    this.#root.className = "interface";
    this.#root.innerHTML = `
      <section class="entry-panel" aria-labelledby="entry-title">
        <div class="menu-heading">
          <h1 id="entry-title">PU Town</h1>
          <p class="intro">A little place to be together.</p>
        </div>
        <form class="menu-card" novalidate>
          <h2 class="menu-title">Meet you in town</h2>
          <p class="menu-description">Create a Room, or join your friends.</p>
          <label for="display-name">Display Name</label>
          <input id="display-name" name="displayName" autocomplete="nickname" placeholder="What should we call you?" aria-describedby="name-hint" required>
          <p id="name-hint" class="hint">1–24 characters. No account needed.</p>
          <button class="primary" type="submit" value="create"><span aria-hidden="true" class="play-marker">▶</span> Create Room</button>
          <div class="divider"><span>or join your friends</span></div>
          <label for="room-code">Room Code</label>
          <div class="join-row">
            <input id="room-code" name="roomCode" autocomplete="off" spellcheck="false" placeholder="ABC234">
            <button type="submit" value="join">Join Lobby</button>
          </div>
          <p class="entry-status" role="status" aria-live="polite"></p>
        </form>
        <p class="footnote"><span>4–10 Players</span><span>Roam the town. Find the Mafia.</span></p>
      </section>
      <header class="room-bar" hidden>
        <span class="wordmark">PU Town.</span>
        <div class="room-code-label">Room Code <strong class="active-code"></strong></div>
        <button type="button" class="copy-code">Copy code</button>
        <span class="occupancy"></span>
        <span class="room-status" role="status"></span>
        <button type="button" class="leave-room">Leave Room</button>
      </header>
      <section class="lobby-controls" hidden aria-label="Lobby controls">
        <div class="role-setup" role="group" aria-label="Roles">
          <span class="role-setup-title">Roles</span>
          ${SETUP_ROLES.map(({ role, label }) => `
          <span class="role-count">
            <span>${label}</span>
            <button type="button" class="role-step" data-role="${role}" data-step="-1" aria-label="Fewer ${label}">−</button>
            <output data-role="${role}">1</output>
            <button type="button" class="role-step" data-role="${role}" data-step="1" aria-label="More ${label}">+</button>
          </span>`).join("")}
          <span class="role-villagers"></span>
        </div>
        <div><strong>Gather in the Town Square</strong><p class="host-guidance"></p></div>
        <button type="button" class="ready-toggle" aria-pressed="false">Ready</button>
        <button type="button" class="primary start-game">Start Game</button>
      </section>
      <section class="connection-overlay" hidden aria-labelledby="connection-title">
        <div class="connection-card">
          <p class="eyebrow">Connection interrupted</p>
          <h2 id="connection-title">Reconnecting…</h2>
          <p class="connection-description" role="status">Your place is held while we bring you back.</p>
          <div class="connection-actions">
            <button type="button" class="primary back">Leave Room</button>
          </div>
        </div>
      </section>
      <a class="art-credits" href="assets/avatars/credits.html" target="_blank" rel="noopener">Character art credits</a>`;
    this.#chooser = new AvatarChooser(id => this.client.selectAvatar(id));
    this.#root.insertBefore(this.#chooser.element, this.element(".connection-overlay"));
    document.body.append(this.#root);
    this.#form = this.element("form");
    this.#name = this.element("#display-name");
    this.#code = this.element("#room-code");
    try { this.#name.value = localStorage.getItem(NAME_KEY) ?? ""; } catch { /* Storage may be disabled. */ }
    this.#form.addEventListener("submit", event => {
      event.preventDefault();
      if (this.client.state.status !== "join") return;
      try {
        const name = normalizeDisplayName(this.#name.value);
        const action = (event.submitter as HTMLButtonElement | null)?.value ?? "create";
        if (action === "join" && !/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(this.#code.value.trim().toUpperCase())) {
          throw new Error("Enter a 6-character Room Code.");
        }
        this.#name.value = name;
        try { localStorage.setItem(NAME_KEY, name); } catch { /* Joining works without storage. */ }
        if (action === "join") this.client.join(this.#code.value, name);
        else this.client.create(name);
        this.render();
      } catch (error) {
        this.element(".entry-status").textContent = error instanceof Error ? error.message : String(error);
      }
    });
    this.element(".ready-toggle").addEventListener("click", () => {
      const self = this.#world?.players.get(this.#world.selfPlayerId ?? "");
      if (self) this.client.setReady(!self.ready);
    });
    this.element(".start-game").addEventListener("click", () => this.client.startGame());
    for (const button of Array.from(this.#root.querySelectorAll<HTMLButtonElement>(".role-step"))) {
      button.addEventListener("click", () => {
        const setup = this.#world?.roleSetup;
        if (!setup) return;
        const role = button.dataset.role as SetupRole;
        this.client.setRoleSetup({ ...setup, [role]: setup[role] + Number(button.dataset.step) });
      });
    }
    this.element(".leave-room").addEventListener("click", () => { this.client.leave(); this.render(); });
    this.element(".back").addEventListener("click", () => { this.client.leave(); this.render(); });
    this.element(".copy-code").addEventListener("click", () => {
      const code = this.client.state.roomId;
      if (!code) return;
      void navigator.clipboard.writeText(code).then(
        () => { this.element(".room-status").textContent = "Code copied"; },
        () => { this.element(".room-status").textContent = "Could not copy. Select the Room Code to copy it."; }
      );
    });
    this.render();
  }

  setAvatarCollection(collection: AvatarCollection): void {
    this.#chooser.setCollection(collection);
  }

  render(world?: WorldState): void {
    if (world) this.#world = world;
    const state = this.client.state;
    if (state === this.#lastState && this.#world === this.#lastWorld) return;
    this.#lastWorld = this.#world;
    const lobby = this.#world?.phase === "lobby";
    const host = this.#world?.hostPlayerId === this.#world?.selfPlayerId;
    const self = this.#world?.players.get(this.#world.selfPlayerId ?? "");
    const choosing = lobby && state.status === "playing";
    this.#chooser.render(self, choosing);
    document.body.classList.toggle("in-lobby", Boolean(lobby && state.status !== "join" && state.status !== "connecting"));
    this.element(".lobby-controls").hidden = !lobby || state.status === "join" || state.status === "connecting";
    this.element(".occupancy").textContent = this.#world ? this.#world.players.size + " / " + ROOM_CAPACITY + " Players" : "";
    const gathered = this.#world?.players.size ?? 0;
    const waiting = [...(this.#world?.players.values() ?? [])].filter(player => !player.ready || !player.connected).length;
    this.element(".host-guidance").textContent = host
      ? gathered < MIN_PLAYERS
        ? `You are the Host. ${MIN_PLAYERS - gathered} more ${MIN_PLAYERS - gathered === 1 ? "Player" : "Players"} needed.`
        : waiting > 0 ? `You are the Host. Waiting for ${waiting} to be Ready and connected.` : "You are the Host. Everyone is Ready."
      : "Waiting for the Host to start";
    const setup = this.#world?.roleSetup ?? null;
    const needed = setup ? Math.max(MIN_PLAYERS, specialRoles(setup) + 1) : MIN_PLAYERS;
    if (host && gathered >= MIN_PLAYERS && gathered < needed) {
      this.element(".host-guidance").textContent = `You are the Host. These Roles need ${needed} Players, so one is left a Villager.`;
    }
    this.renderRoleSetup(setup, host && state.status === "playing", gathered);
    this.element<HTMLButtonElement>(".start-game").hidden = !host;
    this.element<HTMLButtonElement>(".start-game").disabled =
      state.status !== "playing" || gathered < needed || waiting > 0;
    const ready = this.element<HTMLButtonElement>(".ready-toggle");
    ready.disabled = state.status !== "playing";
    ready.textContent = self?.ready ? "Not Ready" : "Ready";
    ready.setAttribute("aria-pressed", String(self?.ready ?? false));
    const previous = this.#lastState;
    this.#lastState = state;
    const entry = state.status === "join" || state.status === "connecting";
    const interrupted = state.status === "reconnecting" || state.status === "failed";
    this.element(".entry-panel").hidden = !entry;
    this.element(".room-bar").hidden = entry;
    this.element(".connection-overlay").hidden = !interrupted;
    document.getElementById("stage")!.style.visibility = entry ? "hidden" : "visible";
    for (const control of Array.from(this.#form.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button"))) {
      control.disabled = state.status === "connecting";
    }
    this.element(".entry-status").textContent = state.status === "connecting" ? "Connecting…" : state.error ?? "";
    this.element(".active-code").textContent = state.roomId ?? "";
    this.element(".room-status").textContent = state.status === "leaving" ? "Leaving…" : state.error ?? "";
    this.element<HTMLButtonElement>(".leave-room").disabled = state.status === "leaving";
    this.element(".back").textContent = state.status === "failed" ? "Back to lobby selection" : "Leave Room";
    this.element("#connection-title").textContent = state.status === "failed" ? "Connection lost" : "Reconnecting…";
    this.element(".connection-description").textContent = state.status === "failed"
      ? state.error ?? "Recovery cannot continue."
      : "Your place is held while we bring you back.";
    if (state.status === "join" && previous?.status !== "join") this.#name.focus();
    if (interrupted && previous?.status !== state.status) this.element<HTMLButtonElement>(".back").focus();
  }

  /** Only the Host changes the deal; everyone sees it. The server enforces every limit again. */
  private renderRoleSetup(setup: RoleSetup | null, editable: boolean, gathered: number): void {
    this.element(".role-setup").hidden = setup === null;
    if (!setup) return;
    for (const { role, max } of SETUP_ROLES) {
      this.element(`output[data-role="${role}"]`).textContent = String(setup[role]);
      const fewer = this.element<HTMLButtonElement>(`.role-step[data-role="${role}"][data-step="-1"]`);
      const more = this.element<HTMLButtonElement>(`.role-step[data-role="${role}"][data-step="1"]`);
      fewer.hidden = more.hidden = !editable;
      fewer.disabled = setup[role] <= 1;
      // Always leave room for at least one Villager in a full Room.
      more.disabled = setup[role] >= max || specialRoles(setup) >= ROOM_CAPACITY - 1;
    }
    const villagers = gathered - specialRoles(setup);
    this.element(".role-villagers").textContent = villagers >= 1
      ? `Villagers ${villagers}`
      : `Needs ${specialRoles(setup) + 1}+ Players`;
    this.element(".role-villagers").classList.toggle("short", villagers < 1);
  }

  destroy(): void { this.#root.remove(); document.body.classList.remove("in-lobby"); }

  private element<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.#root.querySelector<T>(selector)!;
  }
}
