import { normalizeDisplayName } from "./protocol.js";
import { ReconnectingGameClient, type ConnectionState } from "./reconnecting-game-client.js";

const NAME_KEY = "pu-town.display-name";

export class JoinInterface {
  readonly #root = document.createElement("div");
  readonly #form: HTMLFormElement;
  readonly #name: HTMLInputElement;
  readonly #code: HTMLInputElement;
  #lastState: ConnectionState | null = null;

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
            <button type="submit" value="join">Join Room</button>
          </div>
          <p class="entry-status" role="status" aria-live="polite"></p>
        </form>
        <p class="footnote"><span>Up to 8 Players</span><span>Move with <span class="key-hint" aria-label="the arrow keys">↑ ← ↓ →</span></span></p>
      </section>
      <header class="room-bar" hidden>
        <span class="wordmark">PU Town.</span>
        <div class="room-code-label">Room Code <strong class="active-code"></strong></div>
        <button type="button" class="copy-code">Copy code</button>
        <span class="room-status" role="status"></span>
        <button type="button" class="leave-room">Leave Room</button>
      </header>
      <section class="connection-overlay" hidden aria-labelledby="connection-title">
        <div class="connection-card">
          <p class="eyebrow">Connection interrupted</p>
          <h2 id="connection-title">Reconnecting…</h2>
          <p class="connection-description" role="status">Movement is paused while we bring you back.</p>
          <div class="connection-actions">
            <button type="button" class="primary retry">Retry</button>
            <button type="button" class="back">Back to join</button>
          </div>
        </div>
      </section>
      <a class="art-credits" href="assets/avatars/credits.html" target="_blank" rel="noopener">Character art credits</a>`;
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
    this.element(".leave-room").addEventListener("click", () => { this.client.leave(); this.render(); });
    this.element(".back").addEventListener("click", () => { this.client.cancel(); this.render(); });
    this.element(".retry").addEventListener("click", () => { this.client.retry(); this.render(); });
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

  render(): void {
    const state = this.client.state;
    if (state === this.#lastState) return;
    const previous = this.#lastState;
    this.#lastState = state;
    const entry = state.status === "join" || state.status === "connecting";
    const interrupted = state.status === "reconnecting" || state.status === "failed";
    this.element(".entry-panel").hidden = !entry;
    this.element(".room-bar").hidden = entry;
    this.element(".connection-overlay").hidden = !interrupted;
    document.getElementById("game")!.style.visibility = entry ? "hidden" : "visible";
    for (const control of Array.from(this.#form.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button"))) {
      control.disabled = state.status === "connecting";
    }
    this.element(".entry-status").textContent = state.status === "connecting" ? "Connecting…" : state.error ?? "";
    this.element(".active-code").textContent = state.roomId ?? "";
    this.element(".room-status").textContent = state.status === "leaving" ? "Leaving…" : state.error ?? "";
    this.element<HTMLButtonElement>(".leave-room").disabled = state.status !== "playing";
    this.element(".retry").hidden = state.status !== "failed";
    this.element("#connection-title").textContent = state.status === "failed" ? "Connection lost" : "Reconnecting…";
    this.element(".connection-description").textContent = state.status === "failed"
      ? "We could not rejoin within 30 seconds. Try again or return to join."
      : "Movement is paused while we bring you back.";
    if (state.status === "join" && previous?.status !== "join") this.#name.focus();
    if (interrupted && previous?.status !== state.status) this.element<HTMLButtonElement>(state.status === "failed" ? ".retry" : ".back").focus();
  }

  destroy(): void { this.#root.remove(); }

  private element<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.#root.querySelector<T>(selector)!;
  }
}
