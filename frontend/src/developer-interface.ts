import { ROLES, type Role } from "./protocol.js";
import { DEVELOPER_SETTINGS, type DeveloperCommand, type DeveloperPlayer } from "./developer-protocol.js";
import type { ReconnectingGameClient } from "./reconnecting-game-client.js";
import type { WorldState } from "./world-state.js";
const LABELS = { automatic: "Automatic phases", factionVictory: "Faction victory", taskVictory: "Task victory", taskRange: "Require nearby Tasks", taskDuration: "Timed Task work", nightMovement: "Allow Night movement" };
/** Separate local inspector; ordinary controls retain recipient-specific views. */
export class DeveloperInterface {
  readonly #root = document.createElement("details");
  #world: WorldState | undefined;
  readonly #pendingSettings = new Map<typeof DEVELOPER_SETTINGS[number], boolean>();
  #selection = "";
  #rendered = "";
  constructor(private readonly client: ReconnectingGameClient) {
    this.#root.className = "developer-panel";
    this.#root.innerHTML = `<summary>Developer Room</summary><div class="developer-body">
      <p class="developer-status"></p><p class="developer-error" role="status"></p>
      <button type="button" class="developer-claim" hidden>Take over controller</button>
      <button type="button" class="developer-release" hidden>Release to idle simulation</button>
      <div class="developer-controller" hidden>
        <div class="developer-actions"><button type="button" data-action="start">Start setup</button><button type="button" data-action="pause">Pause</button><button type="button" data-action="advance">Next phase</button><button type="button" data-action="reset">Reset scenario</button><button type="button" data-action="lobby">Return to Lobby</button></div>
        <label>Test Scenario <select class="developer-scenario"><option value="four_roles">Four Roles</option><option value="protection">Protection and investigation</option><option value="voting">Townhall voting</option><option value="tasks">Near-complete Task victory</option><option value="recovery">Disconnect and recovery</option></select></label><button type="button" class="developer-load">Load scenario</button>
        <fieldset><legend>Rules</legend>${DEVELOPER_SETTINGS.map(name => `<label><input type="checkbox" data-setting="${name}">${LABELS[name]}</label>`).join("")}</fieldset>
        <form class="developer-add"><label>Simulated Player <input name="displayName" maxlength="24" value="Simulated Player" required></label><label>Role <select name="role">${ROLES.map(role => `<option>${role}</option>`).join("")}</select></label><button>Add Player</button></form>
        <label>Inspect Player <select class="developer-player"></select></label><div class="developer-player-controls"></div>
      </div></div>`;
    document.body.append(this.#root);
    this.element(".developer-claim").addEventListener("click", () => this.command({ action: "claim" }));
    this.element(".developer-release").addEventListener("click", () => this.client.releaseDeveloper());
    for (const button of Array.from(this.#root.querySelectorAll<HTMLButtonElement>("[data-action]"))) button.addEventListener("click", () => {
      const action = button.dataset.action as "start" | "pause" | "advance" | "reset" | "lobby";
      this.command(action === "pause" ? { action, enabled: !this.#world?.developer?.paused } : { action });
    });
    this.element(".developer-load").addEventListener("click", () => this.command({ action: "scenario", name: this.element<HTMLSelectElement>(".developer-scenario").value as "four_roles" }));
    for (const checkbox of Array.from(this.#root.querySelectorAll<HTMLInputElement>("[data-setting]"))) checkbox.addEventListener("change", () => { const name = checkbox.dataset.setting as typeof DEVELOPER_SETTINGS[number]; this.#pendingSettings.set(name, checkbox.checked); this.command({ action: "setting", name, enabled: checkbox.checked }); });
    this.element<HTMLFormElement>(".developer-add").addEventListener("submit", event => {
      event.preventDefault(); const form = new FormData(event.currentTarget as HTMLFormElement);
      this.command({ action: "add_player", displayName: String(form.get("displayName")), role: String(form.get("role")) as Role });
    });
    this.element<HTMLSelectElement>(".developer-player").addEventListener("change", event => {
      this.#selection = (event.target as HTMLSelectElement).value; this.#rendered = ""; this.render(this.#world);
    });
  }
  destroy(): void { this.#root.remove(); }
  private command(command: DeveloperCommand): void { this.client.developer(command); }
  render(world: WorldState | undefined): void {
    this.#world = world;
    const dev = world?.developer;
    this.#root.hidden = !dev || this.client.state.status !== "playing";
    if (!dev || !world) return;
    const controller = dev.controllerId === world.selfPlayerId;
    this.element(".developer-controller").hidden = !controller;
    this.element(".developer-claim").hidden = dev.controllerId !== null;
    this.element(".developer-release").hidden = controller || !dev.simulatedPlayerIds.includes(world.selfPlayerId ?? "");
    this.element(".developer-status").textContent = `${dev.paused ? "Paused" : "Running"} · ${dev.scenario} · ${controller ? "You control this Room" : "Player view"}`;
    this.element(".developer-error").textContent = world.lastError?.message ?? "";
    const inspector = world.inspector;
    if (!controller || !inspector) return;
    for (const checkbox of Array.from(this.#root.querySelectorAll<HTMLInputElement>("[data-setting]"))) {
      const name = checkbox.dataset.setting as typeof DEVELOPER_SETTINGS[number];
      const pending = this.#pendingSettings.get(name);
      if (pending === inspector.settings[name]) this.#pendingSettings.delete(name);
      checkbox.checked = this.#pendingSettings.get(name) ?? inspector.settings[name];
    }
    for (const button of Array.from(this.#root.querySelectorAll<HTMLButtonElement>("[data-action]"))) {
      const action = button.dataset.action;
      button.disabled = action === "start" ? world.phase !== "lobby" : action !== "lobby" && !world.game;
      if (action === "pause") button.textContent = dev.paused ? "Resume" : "Pause";
    }
    const select = this.element<HTMLSelectElement>(".developer-player");
    const names = inspector.players.map(player => `${player.playerId}:${player.displayName}:${player.role}:${player.simulated}`).join("|");
    if (select.dataset.names !== names) {
      select.replaceChildren(...inspector.players.map(player => { const option = document.createElement("option"); option.value = player.playerId; option.textContent = `${player.displayName} · ${player.role} · ${player.simulated ? "idle" : "browser"}`; return option; }));
      select.dataset.names = names;
      if (!inspector.players.some(player => player.playerId === this.#selection)) this.#selection = inspector.players[0]?.playerId ?? "";
      select.value = this.#selection;
    }
    const player = inspector.players.find(player => player.playerId === this.#selection);
    const signature = JSON.stringify([player, world.game?.phase, world.game?.round, inspector.locations]);
    const focus = document.activeElement;
    const editing = focus instanceof HTMLElement && focus.matches("input, select, textarea") && this.element(".developer-player-controls").contains(focus);
    if (player && signature !== this.#rendered && !editing) { this.#rendered = signature; this.renderPlayer(player, world); }
  }
  private renderPlayer(player: DeveloperPlayer, world: WorldState): void {
    const controls = this.element(".developer-player-controls"); controls.replaceChildren();
    const brief = document.createElement("p"); brief.textContent = `${player.status} · Night choice: ${player.nightChoice ?? "none"} · Ballot: ${player.voted ? player.vote ?? "Skip" : "unsubmitted"}`; controls.append(brief);
    const role = this.select(controls, "Assigned Role", ROLES.map(value => [value, value])); role.value = player.role;
    role.addEventListener("change", () => this.command({ action: "role", playerId: player.playerId, role: role.value as Role }));
    this.button(controls, "Remove Player", () => this.command({ action: "remove_player", playerId: player.playerId }), player.playerId === world.selfPlayerId);
    this.button(controls, player.status === "living" ? "Eliminate" : "Revive", () => this.command({ action: "status", playerId: player.playerId, living: player.status !== "living" }), !world.game);
    this.button(controls, "Open local browser as this Player", () => {
      const url = new URL(window.location.href); url.searchParams.set("devRoom", world.roomId!); url.searchParams.set("devPlayer", player.playerId); window.open(url, "_blank", "noopener");
    }, !player.simulated);
    const teleport = document.createElement("form"); teleport.className = "developer-teleport";
    const x = this.input(teleport, "X", player.x, 0), y = this.input(teleport, "Y", player.y, 0);
    this.button(teleport, "Teleport", () => {}, !world.game).type = "submit";
    teleport.addEventListener("submit", event => { event.preventDefault(); this.command({ action: "teleport", playerId: player.playerId, x: Number(x.value), y: Number(y.value) }); }); controls.append(teleport);
    if (player.simulated && world.game) {
      const target = this.select(controls, "Simulated choice target", [["", "Nobody / Skip"], ...world.inspector!.players.map(actor => [actor.playerId, actor.displayName] as const)]);
      this.button(controls, "Submit Night choice", () => this.command({ action: "night_choice", playerId: player.playerId, round: world.game!.round, targetPlayerId: target.value || null }), world.game.phase !== "night");
      this.button(controls, "Vote", () => this.command({ action: "vote", playerId: player.playerId, round: world.game!.round, targetPlayerId: target.value || null }), world.game.phase !== "voting");
    }
    const tasks = document.createElement("details"); const summary = document.createElement("summary"); summary.textContent = "Task banks"; tasks.append(summary); controls.append(tasks);
    for (const task of player.tasks) {
      const form = document.createElement("form"); form.className = "developer-task";
      const title = document.createElement("strong"); title.textContent = `${task.fake ? "Fake" : "Real"} · ${task.taskId}`; form.append(title);
      const location = this.select(form, "Assignment", world.inspector!.locations.map((place, index) => [String(index), place.name])); location.value = String(task.location);
      const kind = this.select(form, "Kind", ["repair", "sequence", "delivery"].map(value => [value, value])); kind.value = task.kind;
      const steps = this.input(form, "Required steps", task.steps, 1, 100), duration = this.input(form, "Seconds per step", task.durationMs / 1000, 0, 3600), progress = this.input(form, "Progress", task.step, 0, 100);
      this.button(form, "Apply Task", () => {}).type = "submit";
      form.addEventListener("submit", event => { event.preventDefault(); this.command({ action: "task", playerId: player.playerId, taskId: task.taskId, location: Number(location.value), kind: kind.value as "repair", steps: Number(steps.value), durationMs: Number(duration.value) * 1000, step: Number(progress.value) }); });
      this.button(form, "Teleport to Task", () => { const place = world.inspector!.locations[task.currentLocation]!; this.command({ action: "teleport", playerId: player.playerId, x: place.x, y: place.y }); });
      this.button(form, "Begin simulated work", () => this.command({ action: "open_task", playerId: player.playerId, round: world.game!.round, taskId: task.taskId }), !player.simulated || world.game?.phase !== "day");
      this.button(form, "Finish simulated step", () => this.command({ action: "task_step", playerId: player.playerId, round: world.game!.round, taskId: task.taskId, step: task.step, value: task.kind === "sequence" ? [2,0,3,1][task.step % 4]! : 0 }), !player.simulated || world.game?.phase !== "day" || world.developer?.paused);
      tasks.append(form);
    }
  }
  private select(parent: HTMLElement, text: string, options: readonly (readonly [string, string])[]): HTMLSelectElement {
    const label = document.createElement("label"); label.textContent = text; const select = document.createElement("select"); label.append(select); parent.append(label);
    for (const [value, text] of options) { const option = document.createElement("option"); option.value = value; option.textContent = text; select.append(option); } return select;
  }
  private input(parent: HTMLElement, text: string, value: number, min: number, max?: number): HTMLInputElement {
    const label = document.createElement("label"); label.textContent = text; const input = document.createElement("input"); input.type = "number"; input.value = String(value); input.min = String(min); input.step = "1"; if (max !== undefined) input.max = String(max); input.required = true; label.append(input); parent.append(label); return input;
  }
  private button(parent: HTMLElement, text: string, action: () => void, disabled = false): HTMLButtonElement { const button = document.createElement("button"); button.type = "button"; button.textContent = text; button.disabled = disabled; button.addEventListener("click", action); parent.append(button); return button; }
  private element<T extends HTMLElement = HTMLElement>(selector: string): T { return this.#root.querySelector<T>(selector)!; }
}
