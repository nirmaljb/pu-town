import type { ChatChannel, ChatEntry, GameView, Role, RosterEntry } from "./protocol.js";
import { MAX_CHAT_CHARACTERS } from "./protocol.js";
import type { LocalPosition } from "./field-controller.js";
import type { ReconnectingGameClient } from "./reconnecting-game-client.js";
import type { WorldState } from "./world-state.js";

const PHASE_TITLES: Record<GameView["phase"], string> = {
  role_reveal: "Your role",
  day: "Day · Explore the town",
  night: "Night · Sleeping",
  discussion: "Townhall · Discussion",
  voting: "Townhall · Voting",
  voting_result: "The verdict",
  finished: "Game over"
};

const ROLE_BRIEFS: Record<Role, string> = {
  mafia: "Choose a Village victim during Night. A strict majority of living Mafia must agree. Your team wins at parity.",
  villager: "Find the Mafia. Discuss at Townhall and vote to eliminate them.",
  doctor: "You belong to the Village. Find the Mafia through Townhall discussion and voting.",
  sheriff: "You belong to the Village. Find the Mafia through Townhall discussion and voting."
};

const EVERYONE_BRIEF = "Walk with WASD or the arrow keys during Day. Sleep in place during Night, then return to your Seat for Townhall discussion and voting.";
const DEATH_SCREEN_MS = 2_000;

function capitalized(role: Role): string {
  return role[0]!.toUpperCase() + role.slice(1);
}

type Preview = Readonly<{ round: number; phase: GameView["phase"]; targetPlayerId: string | null }>;

/** The Game's own controls. Every rule it presents is enforced again by the server. */
export class GameInterface {
  readonly #root = document.createElement("div");
  #preview: Preview | null = null;
  readonly #ballotItems = new Map<string | null, HTMLLIElement>();
  #lastGame: GameView | null = null;
  #lastWorld: WorldState | undefined;
  #self: LocalPosition | null = null;
  #renderedChat = 0;
  #renderedInvestigations = -1;
  #lastError: WorldState["lastError"] = null;
  #toastUntil = 0;
  // Whether this Player was living in the last Game state, so only a death seen live flashes red.
  #wasLiving: boolean | null = null;
  #deathUntil = 0;
  // Re-render personal panels only when their state changes. Ballot buttons are retained
  // across these updates so selecting a choice and receiving chat preserve keyboard focus.
  #rendered: Readonly<{ game: GameView; world: WorldState; preview: Preview | null }> | null = null;

  constructor(private readonly client: ReconnectingGameClient, private readonly now: () => number = Date.now) {
    this.#root.className = "game-interface";
    this.#root.innerHTML = `
      <section class="game-banner" hidden aria-live="polite">
        <strong class="game-phase"></strong>
        <span class="game-countdown"></span>
        <span class="game-round"></span>
        <p class="game-announcement"></p>
      </section>
      <section class="outcome-reveal" hidden aria-live="polite">
        <div class="outcome-card">
          <h2 class="outcome-headline"></h2>
          <p class="outcome-verdict"></p>
        </div>
      </section>
      <p class="ability-toast" hidden role="status"></p>
      <section class="death-screen" hidden role="alert">
        <h2>You are dead</h2>
        <p class="death-cause"></p>
      </section>
      <section class="game-panel" hidden aria-label="Game controls">
        <div class="personal-panels">
          <details class="role-card">
            <summary><span class="role-name"></span></summary>
            <p class="eyebrow role-faction"></p>
            <p class="role-brief"></p>
            <p class="role-brief role-everyone"></p>
            <p class="role-team"></p>
            <p class="role-notice"></p>
          </details>
          <details class="results-panel" hidden>
            <summary>Results</summary>
            <div class="results-content"></div>
          </details>
        </div>
        <div class="action-panel" hidden>
          <h3 class="action-title">Cast your ballot</h3>
          <p class="action-hint"></p>
          <ul class="target-list"></ul>
          <button type="button" class="primary confirm-action">Confirm ballot</button>
        </div>
        <div class="chat-panel" hidden>
          <ul class="chat-log" aria-live="polite"></ul>
          <form class="chat-form">
            <input class="chat-input" aria-label="Chat message" autocomplete="off" maxlength="${MAX_CHAT_CHARACTERS}" placeholder="Say something">
            <button type="submit">Send</button>
          </form>
        </div>
      </section>`;
    document.body.append(this.#root);
    this.element(".role-everyone").textContent = EVERYONE_BRIEF;
    this.element(".confirm-action").addEventListener("click", () => this.confirm());
    this.element<HTMLFormElement>(".chat-form").addEventListener("submit", event => {
      event.preventDefault();
      const input = this.element<HTMLInputElement>(".chat-input");
      const channel: ChatChannel = "public";
      if (input.value.trim() === "") return;
      this.client.chat(channel, input.value);
      input.value = "";
    });
  }

  destroy(): void {
    this.#root.remove();
    document.body.classList.remove("in-game", "sleeping");
  }

  render(world: WorldState | undefined, self: LocalPosition | null = null): void {
    this.#lastWorld = world;
    this.#self = self;
    const game = world?.game ?? null;
    const active = Boolean(game) && this.client.state.status === "playing";
    document.body.classList.toggle("in-game", active);
    document.body.classList.toggle("sleeping", active && game?.phase === "night");
    this.#root.dataset.phase = active ? game?.phase ?? "" : "";
    this.element(".game-banner").hidden = !active;
    this.element(".game-panel").hidden = !active;
    if (!game || !world) {
      this.element(".outcome-reveal").hidden = true;
      this.element(".ability-toast").hidden = true;
      this.element(".death-screen").hidden = true;
      this.#wasLiving = null;
      this.#deathUntil = 0;
      this.#lastGame = null;
      this.#preview = null;
      this.#ballotItems.clear();
      this.element(".target-list").replaceChildren();
      this.#renderedChat = 0;
      this.#renderedInvestigations = -1;
      this.#rendered = null;
      return;
    }
    if (game !== this.#lastGame) {
      if (this.#lastGame?.phase !== game.phase) {
        this.element<HTMLDetailsElement>(".role-card").open = game.phase === "role_reveal";
      }
      if (this.#lastGame === null || game.round !== this.#lastGame.round || game.phase !== this.#lastGame.phase) {
        this.#preview = null;
      }
      const previewTarget = this.#preview?.targetPlayerId;
      if (previewTarget != null && !game.players.some(entry =>
        entry.playerId === previewTarget && entry.status === "living")) {
        this.#preview = null;
      }
      this.#lastGame = game;
    }
    this.renderBanner(game, world);
    this.renderDeath(game);
    const rendered = this.#rendered;
    if (rendered === null || rendered.game !== game || rendered.world !== world || rendered.preview !== this.#preview) {
      this.#rendered = { game, world, preview: this.#preview };
      this.renderRole(game, world);
      this.renderBallot(game);
      this.renderResults(game);
      this.renderOutcome(game);
    }
    this.renderToasts(game, world);
    this.renderChat(game, world);
  }

  private renderBanner(game: GameView, world: WorldState): void {
    this.element(".game-phase").textContent = PHASE_TITLES[game.phase];
    this.element(".game-round").textContent = game.round > 0 && game.phase !== "finished" ? `Round ${game.round}` : "";
    this.element(".game-countdown").textContent = this.countdown(world);
    this.element(".game-announcement").textContent = this.announcement(game);
  }

  /** The whole screen turns red for two seconds at the moment this Player dies. */
  private renderDeath(game: GameView): void {
    const living = game.self.status === "living";
    if (this.#wasLiving === true && game.self.status === "eliminated") {
      this.#deathUntil = this.now() + DEATH_SCREEN_MS;
      this.element(".death-cause").textContent = game.self.killedByMafia
        ? "The Mafia got you. As a ghost you can still wander and watch."
        : "The Village voted you out.";
    }
    this.#wasLiving = living;
    this.element(".death-screen").hidden = this.now() >= this.#deathUntil;
  }

  /** The server owns the deadline; this counts down to it from when its message arrived. */
  private countdown(world: WorldState): string {
    if (world.phaseEndsAt === null) return "";
    const left = Math.max(0, world.phaseEndsAt - this.now());
    const seconds = Math.ceil(left / 1_000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  private announcement(game: GameView): string {
    if (game.phase === "finished") {
      const winner = game.winner === "mafia" ? "The Mafia win." : "The Village wins.";
      const outcome = this.outcomeText(game);
      return outcome === null ? winner : [outcome.verdict || outcome.headline, winner].join(" ");
    }
    if (game.phase === "day") return "Explore the town. Townhall follows Night.";
    if (game.phase === "night") return "Everyone sleeps in place. Movement and conversation are closed.";
    const outcome = this.outcomeText(game);
    return outcome === null ? "" : [outcome.headline, outcome.verdict].filter(Boolean).join(" ");
  }

  /** Night deaths do not disclose Roles; a Townhall verdict reveals the eliminated Role. */
  private outcomeText(game: GameView): Readonly<{ headline: string; verdict: string; mafia: boolean | null }> | null {
    const outcome = game.outcome;
    if (!outcome) return null;
    if (outcome.kind !== "meeting") {
      const headline = "Everyone to Townhall.";
      const verdict = outcome.deaths.length === 0 ? "Nobody died during Night."
        : `Night deaths: ${outcome.deaths.map(id => this.nameOf(game, id)).join(", ")}.`;
      return { headline, verdict, mafia: null };
    }
    if (outcome.eliminatedPlayerId === null) {
      return { headline: "The town could not agree. Nobody was eliminated.", verdict: "", mafia: null };
    }
    return {
      headline: `${this.nameOf(game, outcome.eliminatedPlayerId)} was eliminated.`,
      verdict: `Their Role was ${outcome.eliminatedRole === null ? "unknown" : capitalized(outcome.eliminatedRole)}.`,
      mafia: outcome.eliminatedRole === "mafia"
    };
  }

  private renderOutcome(game: GameView): void {
    const reveal = this.element(".outcome-reveal");
    const outcome = game.phase === "voting_result" ? this.outcomeText(game) : null;
    reveal.hidden = outcome === null;
    if (outcome === null) return;
    reveal.dataset.verdict = outcome.mafia === null ? "" : outcome.mafia ? "mafia" : "not-mafia";
    this.element(".outcome-headline").textContent = outcome.headline;
    this.element(".outcome-verdict").textContent = outcome.verdict;
  }

  private renderRole(game: GameView, world: WorldState): void {
    const self = game.self;
    this.element(".role-faction").textContent = self.faction === "mafia" ? "Mafia" : "Village";
    this.element(".role-name").textContent = capitalized(self.role);
    this.element(".role-brief").textContent = ROLE_BRIEFS[self.role];
    const team = self.mafiaTeam?.filter(playerId => playerId !== world.selfPlayerId) ?? [];
    this.element(".role-team").textContent = team.length === 0
      ? "" : `Your team: ${team.map(playerId => this.nameOf(game, playerId)).join(", ")}`;
    this.element(".role-notice").textContent = self.killedByMafia
      ? "You were killed by the Mafia. As a ghost you can still wander and watch."
      : self.status === "eliminated" ? "You were eliminated. You can watch, but not act." : "";
  }

  /** Short private notices: refusals from the server, and the Sheriff's newest Scan result. */
  private renderToasts(game: GameView, world: WorldState): void {
    const toast = this.element(".ability-toast");
    const investigations = game.self.investigations ?? [];
    // Only a result that arrives while we watch is announced; recovery restores the list quietly.
    const latest = investigations[investigations.length - 1];
    if (latest && this.#renderedInvestigations >= 0 && investigations.length > this.#renderedInvestigations) {
      this.showToast(`${this.nameOf(game, latest.targetPlayerId)} is ${latest.mafia ? "MAFIA!" : "not Mafia."}`, latest.mafia ? "danger" : "safe");
    }
    this.#renderedInvestigations = investigations.length;
    if (world.lastError !== this.#lastError) {
      this.#lastError = world.lastError;
      if (world.lastError) this.showToast(world.lastError.message, "danger");
    }
    toast.hidden = this.now() > this.#toastUntil;
  }

  private showToast(text: string, tone: "danger" | "safe"): void {
    const toast = this.element(".ability-toast");
    toast.textContent = text;
    toast.dataset.tone = tone;
    this.#toastUntil = this.now() + 3_000;
  }

  // ----- Meetings -------------------------------------------------------------------------

  private renderBallot(game: GameView): void {
    const panel = this.element(".action-panel");
    const night = game.phase === "night" && game.self.role === "mafia";
    const open = (game.phase === "voting" || night) && game.self.status === "living";
    panel.hidden = !open;
    if (!open) return;
    this.element(".action-title").textContent = night ? "Choose tonight's victim" : "Cast your ballot";
    const living = game.players.filter(entry => entry.status === "living"
      && (!night || !game.self.mafiaTeam?.includes(entry.playerId)));
    const locked = !night && game.self.meetingVoted;
    const accepted = night ? game.self.nightChoice : game.self.meetingVote;
    this.element(".action-hint").textContent = locked
      ? `Locked in: ${accepted === null ? "Skip" : this.nameOf(game, accepted)}`
      : night ? `Current choice: ${accepted === null ? "Nobody" : this.nameOf(game, accepted)}. You can revise until Night ends.`
        : "Select a Player, then confirm. A confirmed ballot is final.";
    const list = this.element(".target-list");
    const choices: readonly (RosterEntry | null)[] = [...living, null];
    const available = new Set(choices.map(target => target?.playerId ?? null));
    for (const [playerId, item] of this.#ballotItems) {
      if (!available.has(playerId)) {
        item.remove();
        this.#ballotItems.delete(playerId);
      }
    }
    for (const [index, target] of choices.entries()) {
      const playerId = target?.playerId ?? null;
      let item = this.#ballotItems.get(playerId);
      if (!item) {
        item = this.targetButton(playerId);
        this.#ballotItems.set(playerId, item);
      }
      const button = item.querySelector<HTMLButtonElement>("button")!;
      button.textContent = target?.displayName ?? (night ? "Nobody — withdraw choice" : "Skip — eliminate nobody");
      button.style.borderLeft = target === null ? "" : `6px solid ${target.colour}`;
      const chosen = locked || (night && this.#preview === null) ? accepted === playerId
        : this.#preview !== null && this.#preview.targetPlayerId === playerId;
      button.setAttribute("aria-pressed", String(chosen));
      button.disabled = locked;
      // Leave unaffected buttons in place, including when a preview or chat changes.
      if (list.children[index] !== item) list.insertBefore(item, list.children[index] ?? null);
    }
    const confirm = this.element<HTMLButtonElement>(".confirm-action");
    confirm.textContent = night ? "Set Night choice" : "Confirm ballot";
    confirm.disabled = locked || this.#preview === null;
    confirm.hidden = locked;
  }

  private targetButton(targetPlayerId: string | null): HTMLLIElement {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    // A click previews locally; nothing is submitted until the explicit confirmation.
    button.addEventListener("click", () => {
      const game = this.#lastGame;
      if (!game || game.self.status !== "living") return;
      if (game.phase === "voting" ? game.self.meetingVoted : game.phase !== "night" || game.self.role !== "mafia") return;
      this.#preview = { round: game.round, phase: game.phase, targetPlayerId };
      this.render(this.#lastWorld, this.#self);
    });
    item.append(button);
    return item;
  }

  private confirm(): void {
    const game = this.#lastGame;
    const preview = this.#preview;
    if (!game || !preview || preview.round !== game.round || preview.phase !== game.phase) return;
    if (game.self.status !== "living") return;
    if (game.phase === "night" && game.self.role === "mafia") {
      this.client.nightChoice(game.round, preview.targetPlayerId);
      return;
    }
    if (game.phase !== "voting" || game.self.meetingVoted) return;
    if (preview.targetPlayerId !== null && !game.players.some(entry =>
      entry.playerId === preview.targetPlayerId && entry.status === "living")) return;
    this.client.meetingVote(game.round, preview.targetPlayerId);
  }

  private renderResults(game: GameView): void {
    const panel = this.element(".results-panel");
    const parts: HTMLElement[] = [];
    const investigations = game.self.investigations ?? [];
    if (investigations.length > 0) {
      parts.push(this.list("What your Scans found", investigations.map(result =>
        `Round ${result.round}: ${this.nameOf(game, result.targetPlayerId)} is ${result.mafia ? "Mafia" : "not Mafia"}`)));
    }
    if (game.ballots && game.ballots.length > 0) {
      parts.push(this.list("How the town voted", game.ballots.map(ballot =>
        `${this.nameOf(game, ballot.voterPlayerId)} → ${ballot.targetPlayerId === null ? "Skip" : this.nameOf(game, ballot.targetPlayerId)}`)));
    }
    if (game.roles) {
      parts.push(this.list("Everyone's Role", game.roles.map(reveal => {
        const status = game.players.find(entry => entry.playerId === reveal.playerId)?.status;
        const fate = status === "eliminated" ? " (dead)" : status === "left" ? " (left)" : "";
        return `${this.nameOf(game, reveal.playerId)} — ${capitalized(reveal.role)}${fate}`;
      })));
    }
    panel.hidden = parts.length === 0;
    this.element(".results-content").replaceChildren(...parts);
  }

  private list(title: string, lines: readonly string[]): HTMLElement {
    const section = document.createElement("section");
    const heading = document.createElement("h3");
    heading.textContent = title;
    const list = document.createElement("ul");
    for (const line of lines) {
      const item = document.createElement("li");
      // Chat and names are shown as text, never as markup.
      item.textContent = line;
      list.append(item);
    }
    section.append(heading, list);
    return section;
  }

  private renderChat(game: GameView, world: WorldState): void {
    const meeting = game.phase === "discussion" || game.phase === "voting";
    const panel = this.element(".chat-panel");
    panel.hidden = !(meeting || game.phase === "voting_result");
    const log = this.element(".chat-log");
    if (world.chat.length < this.#renderedChat) {
      // Recovery replaces the authorized history wholesale.
      log.replaceChildren(...world.chat.map(entry => this.chatLine(entry)));
      this.#renderedChat = world.chat.length;
      log.scrollTop = log.scrollHeight;
    } else if (world.chat.length > this.#renderedChat) {
      for (const entry of world.chat.slice(this.#renderedChat)) log.append(this.chatLine(entry));
      this.#renderedChat = world.chat.length;
      log.scrollTop = log.scrollHeight;
    }
    const canSend = game.self.status === "living" && meeting;
    const input = this.element<HTMLInputElement>(".chat-input");
    input.disabled = !canSend;
    input.placeholder = canSend
      ? "Say something to the town"
      : game.self.status === "living" ? "Chat opens at Townhall" : "The dead cannot speak";
    this.element<HTMLButtonElement>(".chat-form button").disabled = !canSend;
  }

  private chatLine(entry: ChatEntry): HTMLLIElement {
    const line = document.createElement("li");
    line.className = entry.channel === "mafia" ? "chat-mafia" : "chat-public";
    const who = document.createElement("strong");
    who.textContent = entry.senderName;
    const text = document.createElement("span");
    text.textContent = entry.text;
    line.append(who, text);
    return line;
  }

  private nameOf(game: GameView, playerId: string): string {
    return game.players.find(entry => entry.playerId === playerId)?.displayName ?? "Someone";
  }

  private element<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.#root.querySelector<T>(selector)!;
  }
}
