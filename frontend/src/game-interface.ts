import type { ChatChannel, ChatEntry, GameView, Role, RosterEntry } from "./protocol.js";
import { MAX_CHAT_CHARACTERS } from "./protocol.js";
import type { ReconnectingGameClient } from "./reconnecting-game-client.js";
import type { WorldState } from "./world-state.js";

const PHASE_TITLES: Record<GameView["phase"], string> = {
  role_reveal: "Your role",
  night: "Night",
  night_result: "Dawn",
  discussion: "Meeting · Discussion",
  voting: "Meeting · Voting",
  voting_result: "The verdict",
  finished: "Game over"
};

const ROLE_BRIEFS: Record<Role, string> = {
  mafia: "Agree with your team on one Village Player each Night.",
  villager: "You have no Night action. Find the Mafia by talking.",
  doctor: "Protect one living Player each Night, but never the same one twice in a row.",
  sheriff: "Investigate one other living Player each Night to learn whether they are Mafia."
};

type Preview = Readonly<{ round: number; phase: GameView["phase"]; targetPlayerId: string | null }>;

type Choice = "mafia_vote" | "protect" | "investigate" | "meeting_vote";

/**
 * Everything one kind of choice needs, in one place: what to call it, who may be chosen,
 * and what the server has already accepted. Every rule here is enforced again by the server.
 */
type ChoiceKind = Readonly<{
  title: string;
  confirm: string;
  /** The Role this choice belongs to, or null for the Meeting ballot every Player casts. */
  role: Role | null;
  accepted: (game: GameView) => string | null;
  locked: (game: GameView) => boolean;
  targets: (game: GameView, living: readonly RosterEntry[], selfPlayerId: string | null) => readonly RosterEntry[];
  /** Only a Meeting ballot may name nobody. */
  skippable: boolean;
}>;

const CHOICES: Record<Choice, ChoiceKind> = {
  mafia_vote: {
    title: "Choose tonight's target", confirm: "Confirm vote", role: "mafia",
    accepted: game => game.self.mafiaVote,
    locked: game => game.self.mafiaVote !== null,
    targets: (game, living) => {
      const team = new Set(game.self.mafiaTeam ?? []);
      return living.filter(entry => !team.has(entry.playerId));
    },
    skippable: false
  },
  protect: {
    title: "Choose who to protect", confirm: "Confirm protection", role: "doctor",
    accepted: game => game.self.protect,
    locked: game => game.self.protect !== null,
    targets: (game, living) => living.filter(entry => entry.playerId !== game.self.protectBlockedPlayerId),
    skippable: false
  },
  investigate: {
    title: "Choose who to investigate", confirm: "Confirm investigation", role: "sheriff",
    accepted: game => game.self.investigate,
    locked: game => game.self.investigate !== null,
    targets: (_game, living, selfPlayerId) => living.filter(entry => entry.playerId !== selfPlayerId),
    skippable: false
  },
  meeting_vote: {
    title: "Cast your ballot", confirm: "Confirm ballot", role: null,
    accepted: game => game.self.meetingVote,
    // A Skip is an accepted ballot that names nobody, so the lock is its own flag.
    locked: game => game.self.meetingVoted,
    targets: (_game, living) => living,
    skippable: true
  }
};

/** The Game's own controls. Every rule it presents is enforced again by the server. */
export class GameInterface {
  readonly #root = document.createElement("div");
  #preview: Preview | null = null;
  #receivedAt = 0;
  #lastGame: GameView | null = null;
  #lastWorld: WorldState | undefined;
  #renderedChat = 0;
  // The scene renders every frame, but the target list holds focus and receives clicks, so
  // it is rebuilt only when the Game, the world or the local selection behind it changed.
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
      <section class="sleep-veil" hidden>
        <div>
          <h2>The town sleeps</h2>
          <p class="sleep-note">Close your eyes. You have no Night action.</p>
        </div>
      </section>
      <aside class="game-panel" hidden aria-label="Game controls">
        <div class="role-card">
          <p class="eyebrow role-faction"></p>
          <h2 class="role-name"></h2>
          <p class="role-brief"></p>
          <p class="role-team"></p>
          <p class="role-notice"></p>
        </div>
        <div class="action-panel" hidden>
          <h3 class="action-title"></h3>
          <p class="action-hint"></p>
          <ul class="target-list"></ul>
          <button type="button" class="primary confirm-action"></button>
        </div>
        <div class="results-panel" hidden></div>
        <div class="chat-panel" hidden>
          <ul class="chat-log" aria-live="polite"></ul>
          <form class="chat-form">
            <input class="chat-input" autocomplete="off" maxlength="${MAX_CHAT_CHARACTERS}" placeholder="Say something">
            <button type="submit">Send</button>
          </form>
        </div>
      </aside>`;
    document.body.append(this.#root);
    this.element(".confirm-action").addEventListener("click", () => this.confirm());
    this.element<HTMLFormElement>(".chat-form").addEventListener("submit", event => {
      event.preventDefault();
      const input = this.element<HTMLInputElement>(".chat-input");
      const channel = this.#lastGame?.phase === "night" ? "mafia" : "public";
      if (input.value.trim() === "") return;
      this.client.chat(channel as ChatChannel, input.value);
      input.value = "";
    });
  }

  destroy(): void {
    this.#root.remove();
    document.body.classList.remove("in-game");
  }

  render(world: WorldState | undefined): void {
    this.#lastWorld = world;
    const game = world?.game ?? null;
    const active = Boolean(game) && this.client.state.status === "playing";
    document.body.classList.toggle("in-game", active);
    this.element(".game-banner").hidden = !active;
    this.element(".game-panel").hidden = !active;
    if (!game || !world) {
      this.element(".sleep-veil").hidden = true;
      this.#lastGame = null;
      this.#renderedChat = 0;
      this.#rendered = null;
      return;
    }
    if (game !== this.#lastGame) {
      if (this.#lastGame === null || game.round !== this.#lastGame.round || game.phase !== this.#lastGame.phase) {
        this.#preview = null;
      }
      this.#lastGame = game;
      this.#receivedAt = this.now();
    }
    // Only the countdown changes between messages; everything else is rebuilt on demand.
    this.renderBanner(game);
    const rendered = this.#rendered;
    if (rendered === null || rendered.game !== game || rendered.world !== world || rendered.preview !== this.#preview) {
      this.#rendered = { game, world, preview: this.#preview };
      this.renderRole(game, world);
      this.renderAction(game, world);
      this.renderResults(game);
    }
    this.renderChat(game, world);
  }

  private renderBanner(game: GameView): void {
    this.element(".game-phase").textContent = PHASE_TITLES[game.phase];
    this.element(".game-round").textContent = game.round > 0 && game.phase !== "finished" ? `Round ${game.round}` : "";
    this.element(".game-countdown").textContent = this.countdown(game);
    this.element(".game-announcement").textContent = this.announcement(game);
  }

  /** The server owns the deadline; this only presents the time it last published. */
  private countdown(game: GameView): string {
    if (game.remainingMs === null) return "";
    const left = Math.max(0, game.remainingMs - (this.now() - this.#receivedAt));
    const seconds = Math.ceil(left / 1_000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  private announcement(game: GameView): string {
    const outcome = game.outcome;
    if (game.phase === "finished") {
      return game.winner === "mafia" ? "The Mafia win." : "The Village wins.";
    }
    if (!outcome) return "";
    if (outcome.kind === "night") {
      return outcome.victimPlayerId === null
        ? "Nobody died last night."
        : `${this.nameOf(game, outcome.victimPlayerId)} did not survive the night.`;
    }
    if (outcome.eliminatedPlayerId === null) return "The town could not agree. Nobody was eliminated.";
    return `${this.nameOf(game, outcome.eliminatedPlayerId)} was eliminated. They were `
      + (outcome.eliminatedMafia ? "Mafia." : "not Mafia.");
  }

  private renderRole(game: GameView, world: WorldState): void {
    const self = game.self;
    this.element(".role-faction").textContent = self.faction === "mafia" ? "Mafia" : "Village";
    this.element(".role-name").textContent = self.role[0]!.toUpperCase() + self.role.slice(1);
    this.element(".role-brief").textContent = ROLE_BRIEFS[self.role];
    const team = self.mafiaTeam?.filter(playerId => playerId !== world.selfPlayerId) ?? [];
    this.element(".role-team").textContent = team.length === 0
      ? "" : `Your team: ${team.map(playerId => this.nameOf(game, playerId)).join(", ")}`;
    this.element(".role-notice").textContent = self.killedByMafia
      ? "The Mafia killed you in the night."
      : self.status === "eliminated" ? "You were eliminated. You can watch, but not act." : "";
  }

  private renderAction(game: GameView, world: WorldState): void {
    const self = game.self;
    const living = game.players.filter(entry => entry.status === "living");
    const panel = this.element(".action-panel");
    const sleeping = game.phase === "night" && this.openChoice(game) === null;
    this.element(".sleep-veil").hidden = !sleeping;
    this.element(".sleep-note").textContent = self.status === "living"
      ? "Close your eyes. You have no Night action."
      : "You are watching the rest of the Game.";
    const choice = this.openChoice(game);
    panel.hidden = choice === null;
    if (choice === null) return;
    const kind = CHOICES[choice];
    const accepted = kind.accepted(game);
    const locked = kind.locked(game);
    this.element(".action-title").textContent = kind.title;
    this.element(".action-hint").textContent = locked
      ? `Locked in: ${accepted === null ? "Skip" : this.nameOf(game, accepted)}`
      : "Select a Player, then confirm. A confirmed choice is final.";
    const list = this.element(".target-list");
    list.replaceChildren(...kind.targets(game, living, world.selfPlayerId)
      .map(target => this.targetButton(game, target, locked, accepted)));
    if (kind.skippable && !locked) list.append(this.skipButton());
    const confirm = this.element<HTMLButtonElement>(".confirm-action");
    confirm.textContent = kind.confirm;
    confirm.disabled = locked || this.#preview === null;
    confirm.hidden = locked;
  }

  /** The one choice this Player may make in this phase, or null when they may make none. */
  private openChoice(game: GameView): Choice | null {
    if (game.self.status !== "living") return null;
    if (game.phase === "voting") return "meeting_vote";
    if (game.phase !== "night") return null;
    return (Object.keys(CHOICES) as Choice[]).find(choice => CHOICES[choice].role === game.self.role) ?? null;
  }

  private targetButton(game: GameView, target: RosterEntry, locked: boolean, accepted: string | null): HTMLLIElement {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = target.displayName;
    const chosen = locked ? accepted === target.playerId : this.#preview?.targetPlayerId === target.playerId;
    button.setAttribute("aria-pressed", String(chosen));
    button.disabled = locked;
    button.style.borderLeft = `6px solid ${target.colour}`;
    // The Night's Mafia votes stand until the next Night begins, so they belong to the
    // Night's own target list and not to a Meeting ballot for the same Player.
    const teammateVotes = game.phase !== "night" ? []
      : (game.self.mafiaVotes ?? []).filter(ballot => ballot.targetPlayerId === target.playerId);
    if (teammateVotes.length > 0) {
      const tally = document.createElement("span");
      tally.className = "target-votes";
      tally.textContent = teammateVotes.map(ballot => this.nameOf(game, ballot.voterPlayerId)).join(", ");
      button.append(tally);
    }
    // A click previews locally; nothing is submitted until the explicit confirmation.
    button.addEventListener("click", () => {
      this.#preview = { round: game.round, phase: game.phase, targetPlayerId: target.playerId };
      this.render(this.#lastWorld);
    });
    item.append(button);
    return item;
  }

  private skipButton(): HTMLLIElement {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Skip — eliminate nobody";
    button.setAttribute("aria-pressed", String(this.#preview !== null && this.#preview.targetPlayerId === null));
    button.addEventListener("click", () => {
      this.#preview = { round: this.#lastGame!.round, phase: this.#lastGame!.phase, targetPlayerId: null };
      this.render(this.#lastWorld);
    });
    item.append(button);
    return item;
  }

  private confirm(): void {
    const game = this.#lastGame;
    const preview = this.#preview;
    if (!game || !preview || preview.round !== game.round || preview.phase !== game.phase) return;
    const choice = this.openChoice(game);
    if (choice === null) return;
    if (choice === "meeting_vote") this.client.meetingVote(game.round, preview.targetPlayerId);
    else if (preview.targetPlayerId !== null) this.client.nightAction(choice, game.round, preview.targetPlayerId);
  }

  private renderResults(game: GameView): void {
    const panel = this.element(".results-panel");
    const parts: HTMLElement[] = [];
    const investigations = game.self.investigations ?? [];
    if (investigations.length > 0) {
      parts.push(this.list("What you found", investigations.map(result =>
        `Night ${result.round}: ${this.nameOf(game, result.targetPlayerId)} is ${result.mafia ? "Mafia" : "not Mafia"}`)));
    }
    if (game.ballots && game.ballots.length > 0) {
      parts.push(this.list("How the town voted", game.ballots.map(ballot =>
        `${this.nameOf(game, ballot.voterPlayerId)} → ${ballot.targetPlayerId === null ? "Skip" : this.nameOf(game, ballot.targetPlayerId)}`)));
    }
    if (game.roles) {
      parts.push(this.list("Everyone's Role", game.roles.map(reveal =>
        `${this.nameOf(game, reveal.playerId)} — ${reveal.role}`)));
    }
    panel.hidden = parts.length === 0;
    panel.replaceChildren(...parts);
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
    // An eliminated Mafia keeps the messages they received while living, so the Night still
    // shows them the channel; only sending is closed to them.
    const mafiaNight = game.phase === "night" && game.self.role === "mafia";
    const meeting = game.phase === "discussion" || game.phase === "voting";
    const panel = this.element(".chat-panel");
    panel.hidden = !(mafiaNight || meeting || game.phase === "voting_result");
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
    this.updateChatForm(game, mafiaNight, meeting);
  }

  private updateChatForm(game: GameView, mafiaNight: boolean, meeting: boolean): void {
    const canSend = game.self.status === "living" && (mafiaNight || meeting);
    const input = this.element<HTMLInputElement>(".chat-input");
    input.disabled = !canSend;
    input.placeholder = canSend
      ? (mafiaNight ? "Whisper to your team" : "Say something to the town")
      : game.self.status === "living" ? "Chat opens in the Meeting" : "Eliminated Players cannot speak";
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
