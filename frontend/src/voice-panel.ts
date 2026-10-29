import type { VoiceChat } from "./voice-chat.js";
import type { WorldState } from "./world-state.js";

/**
 * The voice controls in the corner of the town: join voice, mute (M), leave, and who this
 * Player can hear right now, lit while they speak.
 */
export class VoicePanel {
  readonly #root = document.createElement("div");
  readonly #toggle = document.createElement("button");
  readonly #leave = document.createElement("button");
  readonly #note = document.createElement("p");
  readonly #list = document.createElement("ul");
  readonly #rows = new Map<string, HTMLLIElement>();
  readonly #keyDown = (event: KeyboardEvent) => {
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    if (event.code === "KeyM" && !typing && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey
      && this.voice.status.joined) this.voice.toggleMute();
  };

  constructor(private readonly voice: VoiceChat) {
    this.#root.className = "voice-panel";
    this.#toggle.type = "button";
    this.#toggle.className = "voice-toggle";
    this.#toggle.addEventListener("click", () => {
      // Without a microphone yet, a click asks for it again; once live, it mutes.
      const { wanted, microphone } = this.voice.status;
      if (wanted && microphone === "live") this.voice.toggleMute();
      else void this.voice.enable();
    });
    this.#leave.type = "button";
    this.#leave.className = "voice-leave";
    this.#leave.textContent = "Leave voice";
    this.#leave.addEventListener("click", () => this.voice.disable());
    this.#note.className = "voice-note";
    this.#list.className = "voice-speakers";
    this.#list.setAttribute("aria-label", "Players you can hear");
    const controls = document.createElement("div");
    controls.className = "voice-controls";
    controls.append(this.#toggle, this.#leave);
    this.#root.append(controls, this.#note, this.#list);
    (document.getElementById("stage") ?? document.body).append(this.#root);
    window.addEventListener("keydown", this.#keyDown);
  }

  render(world: WorldState | undefined): void {
    const status = this.voice.status;
    const talking = status.microphone === "live" && !status.muted;
    this.#toggle.textContent = !status.wanted ? "🎙 Join voice"
      : status.microphone !== "live" ? "🎧 Listening"
      : status.muted ? "🔇 Muted" : "🎙 Live";
    this.#toggle.title = status.wanted ? (status.muted ? "Unmute (M)" : "Mute (M)") : "Talk to the Players near you";
    this.#toggle.setAttribute("aria-pressed", String(status.wanted && !status.muted));
    this.#toggle.classList.toggle("speaking", talking && this.voice.ownLevel() > 0.12);
    this.#toggle.classList.toggle("muted", status.wanted && status.muted);
    this.#leave.hidden = !status.wanted;
    this.#note.textContent = status.problem ?? "";
    this.#note.hidden = !status.problem;

    const audible = status.joined ? this.voice.audible() : [];
    const seen = new Set<string>();
    for (const { playerId, level, link } of audible) {
      seen.add(playerId);
      let row = this.#rows.get(playerId);
      if (!row) {
        row = document.createElement("li");
        this.#rows.set(playerId, row);
        this.#list.append(row);
      }
      const player = world?.players.get(playerId);
      const name = player?.displayName ?? world?.game?.players.find(entry => entry.playerId === playerId)?.displayName ?? "Player";
      if (row.textContent !== name) row.textContent = name;
      row.style.setProperty("--colour", player?.colour ?? "#b9c5d6");
      row.classList.toggle("speaking", level > 0.12);
      // Relayed voice comes through the game server; "connecting" has heard nothing yet.
      row.dataset.link = link;
      row.title = link === "direct" ? "Direct connection" : link === "relayed" ? "Through the game server" : "Connecting…";
    }
    for (const [playerId, row] of this.#rows) {
      if (seen.has(playerId)) continue;
      row.remove();
      this.#rows.delete(playerId);
    }
  }

  destroy(): void {
    window.removeEventListener("keydown", this.#keyDown);
    this.#root.remove();
  }
}
