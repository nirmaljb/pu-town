import type { Ability, ChatChannel, ChatEntry, FieldPlayer, GameView, Role, RosterEntry } from "./protocol.js";
import { MAX_CHAT_CHARACTERS } from "./protocol.js";
import type { LocalPosition } from "./field-controller.js";
import type { ReconnectingGameClient } from "./reconnecting-game-client.js";
import { BUTTON_X, BUTTON_Y, EMERGENCY_RANGE, KILL_RANGE, REPORT_RANGE, SCAN_RANGE, SHIELD_RANGE } from "./room-rules.js";
import type { WorldState } from "./world-state.js";

const PHASE_TITLES: Record<GameView["phase"], string> = {
  role_reveal: "Your role",
  roam: "Roam the town",
  meeting_call: "Meeting called!",
  discussion: "Meeting · Discussion",
  voting: "Meeting · Voting",
  voting_result: "The verdict",
  finished: "Game over"
};

const ROLE_BRIEFS: Record<Role, string> = {
  mafia: "Hunt the Village. Q kills a Player right next to you. E makes you vanish from everyone but your team for 10 seconds.",
  villager: "Find the Mafia. Walk the town, but you cannot stay close to one Player for long — linger and you get pushed away.",
  doctor: "Q shields a nearby Player for 20 seconds. The next kill on them fails.",
  sheriff: "Q scans a nearby Player and tells you, privately, whether they are Mafia."
};

const EVERYONE_BRIEF = "Walk with WASD or the arrow keys. R reports a Body next to you. F at the red button in the Town Square calls an Emergency Meeting (once per Game).";

const DEATH_SCREEN_MS = 2_000;

/** Client ranges are a little tighter than the server's, so a highlighted target is really in reach. */
const REACH_MARGIN = 12;

type Slot = Readonly<{ ability: Ability; key: string; label: string }>;

function capitalized(role: Role): string {
  return role[0]!.toUpperCase() + role.slice(1);
}

type Preview = Readonly<{ round: number; phase: GameView["phase"]; targetPlayerId: string | null }>;

/** The Game's own controls. Every rule it presents is enforced again by the server. */
export class GameInterface {
  readonly #root = document.createElement("div");
  #preview: Preview | null = null;
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
  // The scene renders every frame, but the target list holds focus and receives clicks, so
  // it is rebuilt only when the Game, the world or the local selection behind it changed.
  #rendered: Readonly<{ game: GameView; world: WorldState; preview: Preview | null }> | null = null;
  readonly #onKey = (event: KeyboardEvent) => this.keyPressed(event);

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
      <section class="ability-bar" hidden aria-label="Abilities">
        <div class="crowding" hidden>
          <span>Personal space</span>
          <div class="crowding-meter"><div class="crowding-fill"></div></div>
        </div>
        <div class="ability-buttons"></div>
        <p class="ability-status"></p>
      </section>
      <p class="ability-toast" hidden role="status"></p>
      <section class="death-screen" hidden role="alert">
        <h2>You are dead</h2>
        <p class="death-cause"></p>
      </section>
      <aside class="game-panel" hidden aria-label="Game controls">
        <div class="role-card">
          <p class="eyebrow role-faction"></p>
          <h2 class="role-name"></h2>
          <p class="role-brief"></p>
          <p class="role-brief role-everyone"></p>
          <p class="role-team"></p>
          <p class="role-notice"></p>
        </div>
        <div class="action-panel" hidden>
          <h3 class="action-title">Cast your ballot</h3>
          <p class="action-hint"></p>
          <ul class="target-list"></ul>
          <button type="button" class="primary confirm-action">Confirm ballot</button>
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
    this.element(".role-everyone").textContent = EVERYONE_BRIEF;
    this.element(".confirm-action").addEventListener("click", () => this.confirm());
    this.element<HTMLFormElement>(".chat-form").addEventListener("submit", event => {
      event.preventDefault();
      const input = this.element<HTMLInputElement>(".chat-input");
      const channel: ChatChannel = this.#lastGame?.phase === "roam" ? "mafia" : "public";
      if (input.value.trim() === "") return;
      this.client.chat(channel, input.value);
      input.value = "";
    });
    window.addEventListener("keydown", this.#onKey);
  }

  destroy(): void {
    window.removeEventListener("keydown", this.#onKey);
    this.#root.remove();
    document.body.classList.remove("in-game");
  }

  render(world: WorldState | undefined, self: LocalPosition | null = null): void {
    this.#lastWorld = world;
    this.#self = self;
    const game = world?.game ?? null;
    const active = Boolean(game) && this.client.state.status === "playing";
    document.body.classList.toggle("in-game", active);
    document.body.classList.toggle("roaming", active && game?.phase === "roam");
    this.element(".game-banner").hidden = !active;
    this.element(".game-panel").hidden = !active;
    if (!game || !world) {
      this.element(".outcome-reveal").hidden = true;
      this.element(".ability-bar").hidden = true;
      this.element(".ability-toast").hidden = true;
      this.element(".death-screen").hidden = true;
      this.#wasLiving = null;
      this.#deathUntil = 0;
      this.#lastGame = null;
      this.#renderedChat = 0;
      this.#renderedInvestigations = -1;
      this.#rendered = null;
      return;
    }
    if (game !== this.#lastGame) {
      if (this.#lastGame === null || game.round !== this.#lastGame.round || game.phase !== this.#lastGame.phase) {
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
    this.renderAbilities(game, world);
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
    if (game.phase === "finished") return game.winner === "mafia" ? "The Mafia win." : "The Village wins.";
    if (game.phase === "roam") return game.self.status === "living" ? "Find the Mafia before they find you." : "You are a ghost. Nobody living can see you.";
    const outcome = this.outcomeText(game);
    return outcome === null ? "" : [outcome.headline, outcome.verdict].filter(Boolean).join(" ");
  }

  /** A Meeting Call names who was found dead, never their Role; a verdict reveals only Mafia or not. */
  private outcomeText(game: GameView): Readonly<{ headline: string; verdict: string; mafia: boolean | null }> | null {
    const outcome = game.outcome;
    if (!outcome) return null;
    if (outcome.kind !== "meeting") {
      const caller = outcome.callerPlayerId === null ? "" : this.nameOf(game, outcome.callerPlayerId);
      const headline = outcome.kind === "report"
        ? `${caller} found ${this.nameOf(game, outcome.bodyPlayerId ?? "")}'s body!`
        : outcome.kind === "emergency" ? `${caller} called an Emergency Meeting.` : "Time's up. Everyone to the Town Square.";
      const verdict = outcome.deaths.length === 0 ? "Nobody has died since the last Meeting."
        : `Dead since the last Meeting: ${outcome.deaths.map(id => this.nameOf(game, id)).join(", ")}.`;
      return { headline, verdict, mafia: null };
    }
    if (outcome.eliminatedPlayerId === null) {
      return { headline: "The town could not agree. Nobody was eliminated.", verdict: "", mafia: null };
    }
    return {
      headline: `${this.nameOf(game, outcome.eliminatedPlayerId)} was eliminated.`,
      verdict: outcome.eliminatedMafia ? "They were Mafia." : "They were not Mafia.",
      mafia: outcome.eliminatedMafia
    };
  }

  private renderOutcome(game: GameView): void {
    const reveal = this.element(".outcome-reveal");
    const outcome = game.phase === "meeting_call" || game.phase === "voting_result" ? this.outcomeText(game) : null;
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

  // ----- the Roam: abilities --------------------------------------------------------------

  /** The abilities this Player's Role offers, in the order their keys are shown. */
  private slots(role: Role): readonly Slot[] {
    const own: Slot[] = role === "mafia" ? [{ ability: "kill", key: "Q", label: "Kill" }, { ability: "vanish", key: "E", label: "Vanish" }]
      : role === "doctor" ? [{ ability: "shield", key: "Q", label: "Shield" }]
        : role === "sheriff" ? [{ ability: "scan", key: "Q", label: "Scan" }] : [];
    return [...own, { ability: "report", key: "R", label: "Report" }, { ability: "emergency", key: "F", label: "Emergency" }];
  }

  /** The nearest Player this ability could reach right now, or null when nobody is in range. */
  private targetFor(ability: Ability, game: GameView, world: WorldState): FieldPlayer | null {
    const self = this.#self;
    if (!self || !world.field) return null;
    const range = ability === "kill" ? KILL_RANGE : ability === "shield" ? SHIELD_RANGE : ability === "scan" ? SCAN_RANGE : 0;
    const team = new Set(game.self.mafiaTeam ?? []);
    let best: FieldPlayer | null = null;
    let bestDistance = range - REACH_MARGIN;
    for (const other of world.field.players) {
      if (other.playerId === world.selfPlayerId || other.ghost) continue;
      if (ability === "kill" && team.has(other.playerId)) continue;
      const distance = Math.hypot(other.x - self.x, other.y - self.y);
      if (distance <= bestDistance) {
        best = other;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** Whether the ability may be used now, and why not when it may not. */
  private readiness(ability: Ability, game: GameView, world: WorldState): Readonly<{ ready: boolean; note: string; target: FieldPlayer | null }> {
    const own = world.field?.self;
    const self = this.#self;
    if (!own || !self) return { ready: false, note: "", target: null };
    const seconds = (ms: number | null) => ms !== null && ms > 0 ? `${Math.ceil(ms / 1_000)}s` : "";
    if (ability === "kill" || ability === "shield" || ability === "scan") {
      const cooling = seconds(own.primaryCooldownMs);
      const target = this.targetFor(ability, game, world);
      if (cooling) return { ready: false, note: cooling, target };
      return target ? { ready: true, note: this.nameOf(game, target.playerId), target } : { ready: false, note: "nobody near", target: null };
    }
    if (ability === "vanish") {
      if ((own.vanishedMs ?? 0) > 0) return { ready: false, note: `hidden ${seconds(own.vanishedMs)}`, target: null };
      const cooling = seconds(own.vanishCooldownMs);
      return { ready: !cooling, note: cooling, target: null };
    }
    if (ability === "report") {
      const near = world.field?.bodies.some(body => Math.hypot(body.x - self.x, body.y - self.y) <= REPORT_RANGE - REACH_MARGIN) ?? false;
      return { ready: near, note: near ? "Body!" : "", target: null };
    }
    if (!own.emergencyAvailable) return { ready: false, note: "used", target: null };
    const atButton = Math.hypot(BUTTON_X - self.x, BUTTON_Y - self.y) <= EMERGENCY_RANGE - REACH_MARGIN;
    return { ready: atButton, note: atButton ? "" : "at the button", target: null };
  }

  private renderAbilities(game: GameView, world: WorldState): void {
    const bar = this.element(".ability-bar");
    const roaming = game.phase === "roam" && world.field !== null && this.#self !== null;
    bar.hidden = !roaming;
    if (!roaming) return;
    const own = world.field!.self;
    const living = game.self.status === "living";
    const buttons = this.element(".ability-buttons");
    const slots = living ? this.slots(game.self.role) : [];
    if (buttons.dataset.role !== (living ? game.self.role : "ghost")) {
      buttons.dataset.role = living ? game.self.role : "ghost";
      buttons.replaceChildren(...slots.map(slot => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `ability ability-${slot.ability}`;
        button.dataset.ability = slot.ability;
        button.innerHTML = `<kbd></kbd><span class="ability-label"></span><small class="ability-note"></small>`;
        button.querySelector("kbd")!.textContent = slot.key;
        button.querySelector(".ability-label")!.textContent = slot.label;
        button.addEventListener("click", () => this.trigger(slot.ability));
        return button;
      }));
    }
    for (const slot of slots) {
      const button = buttons.querySelector<HTMLButtonElement>(`[data-ability="${slot.ability}"]`);
      if (!button) continue;
      const state = this.readiness(slot.ability, game, world);
      button.disabled = !state.ready;
      button.querySelector(".ability-note")!.textContent = state.note;
    }
    const crowding = this.element(".crowding");
    crowding.hidden = own.crowding === null;
    if (own.crowding !== null) {
      const fill = this.element(".crowding-fill");
      fill.style.width = `${Math.round(own.crowding * 100)}%`;
      fill.dataset.level = own.crowding > 0.66 ? "high" : own.crowding > 0.33 ? "mid" : "low";
    }
    const status = own.shieldTargetPlayerId !== null
      ? `Shielding ${this.nameOf(game, own.shieldTargetPlayerId)} · ${Math.ceil((own.shieldMs ?? 0) / 1_000)}s`
      : (own.vanishedMs ?? 0) > 0 ? "You are invisible to the Village." : living ? "" : "You are a ghost. Wander and watch.";
    this.element(".ability-status").textContent = status;
  }

  private keyPressed(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.repeat) return;
    const game = this.#lastGame;
    if (!game || game.phase !== "roam" || game.self.status !== "living") return;
    const slot = this.slots(game.self.role).find(candidate => candidate.key === event.key.toUpperCase());
    if (!slot) return;
    event.preventDefault();
    this.trigger(slot.ability);
  }

  private trigger(ability: Ability): void {
    const game = this.#lastGame;
    const world = this.#lastWorld;
    if (!game || !world || game.phase !== "roam") return;
    const state = this.readiness(ability, game, world);
    if (!state.ready) return;
    const targeted = ability === "kill" || ability === "shield" || ability === "scan";
    this.client.useAbility(ability, game.round, targeted ? state.target!.playerId : null);
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
      if (world.lastError && game.phase === "roam") this.showToast(world.lastError.message, "danger");
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
    const open = game.phase === "voting" && game.self.status === "living";
    panel.hidden = !open;
    if (!open) return;
    const living = game.players.filter(entry => entry.status === "living");
    const locked = game.self.meetingVoted;
    const accepted = game.self.meetingVote;
    this.element(".action-hint").textContent = locked
      ? `Locked in: ${accepted === null ? "Skip" : this.nameOf(game, accepted)}`
      : "Select a Player, then confirm. A confirmed ballot is final.";
    const list = this.element(".target-list");
    list.replaceChildren(...living.map(target => this.targetButton(game, target, locked, accepted)));
    if (!locked) list.append(this.skipButton());
    const confirm = this.element<HTMLButtonElement>(".confirm-action");
    confirm.disabled = locked || this.#preview === null;
    confirm.hidden = locked;
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
    // A click previews locally; nothing is submitted until the explicit confirmation.
    button.addEventListener("click", () => {
      this.#preview = { round: game.round, phase: game.phase, targetPlayerId: target.playerId };
      this.render(this.#lastWorld, this.#self);
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
      this.render(this.#lastWorld, this.#self);
    });
    item.append(button);
    return item;
  }

  private confirm(): void {
    const game = this.#lastGame;
    const preview = this.#preview;
    if (!game || !preview || preview.round !== game.round || preview.phase !== game.phase) return;
    if (game.phase !== "voting" || game.self.status !== "living") return;
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
    // An eliminated Mafia keeps the messages they received while living, so the Roam still
    // shows them the channel; only sending is closed to them.
    const mafiaRoam = game.phase === "roam" && game.self.role === "mafia";
    const meeting = game.phase === "discussion" || game.phase === "voting";
    const panel = this.element(".chat-panel");
    panel.hidden = !(mafiaRoam || meeting || game.phase === "voting_result" || game.phase === "meeting_call");
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
    const canSend = game.self.status === "living" && (mafiaRoam || meeting);
    const input = this.element<HTMLInputElement>(".chat-input");
    input.disabled = !canSend;
    input.placeholder = canSend
      ? (mafiaRoam ? "Whisper to your team" : "Say something to the town")
      : game.self.status === "living" ? "Chat opens in the Meeting" : "The dead cannot speak";
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
