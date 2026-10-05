import type { SoundEffects } from "./sound-effects.js";
import type { ReconnectingGameClient } from "./reconnecting-game-client.js";
import type { WorldState } from "./world-state.js";
import { areaAt } from "./room-rules.js";

/** Personal assignments and their current server-authorized interaction, rendered at frames. */
export class TaskInterface {
  readonly #root = document.createElement("section");
  readonly #ledger = document.createElement("details");
  readonly #summary = document.createElement("summary");
  readonly #heading = document.createElement("strong");
  readonly #content = document.createElement("div");
  #signature = "";

  constructor(private readonly client: ReconnectingGameClient, private readonly effects: SoundEffects, private readonly now = Date.now) {
    this.#root.className = "task-interface";
    this.#root.setAttribute("aria-label", "Tasks");
    this.#summary.append(this.#heading);
    this.#ledger.append(this.#summary, this.#content);
    this.#root.append(this.#ledger);
    document.body.append(this.#root);
  }

  destroy(): void { this.#root.remove(); }

  render(world: WorldState | undefined): void {
    const game = world?.game;
    const state = world?.tasks;
    this.#root.hidden = !game || !state || game.phase !== "day";
    if (!game || !state) return;
    const pos = world.field?.self;
    const seconds = Math.ceil(Math.max(0, (world.taskEndsAt ?? this.now()) - this.now()) / 1000);
    const available = game.phase === "day" && game.self.status !== "left" && this.client.state.status === "playing";
    this.#heading.textContent = `Village Tasks: ${state.completed}/${state.total}`;
    // A ticking countdown or a movement update must not replace a focused control.
    const signature = JSON.stringify([game.round, game.phase, state.tasks, state.activeTaskId]);
    if (signature !== this.#signature) {
      this.#signature = signature;
      const list = document.createElement("ul");
      for (const task of state.tasks) {
        const item = document.createElement("li");
        item.dataset.taskId = task.taskId;
        item.hidden = state.activeTaskId !== null && state.activeTaskId !== task.taskId;
        const title = document.createElement("strong");
        title.textContent = `${task.fake ? "Fake · " : ""}${task.name}`;
        const progress = document.createElement("small");
        progress.textContent = `${task.step}/${task.steps} steps · ${areaAt(task.x, task.y)}`;
        const direction = document.createElement("small");
        direction.className = "task-direction";
        item.append(title, progress, direction);
        if (task.step < task.steps) {
          const active = state.activeTaskId === task.taskId;
          if (task.kind === "sequence") {
            const pattern = document.createElement("small");
            pattern.textContent = `Sequence: ${task.sequence.map(value => value + 1).join(" → ")}`;
            item.append(pattern);
          }
          const controls = document.createElement("div");
          controls.className = "task-controls";
          for (const value of active && task.kind === "sequence" ? [0, 1, 2, 3] : [0]) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = active
              ? task.kind === "sequence" ? `${value + 1}` : task.kind === "delivery" ? task.step % 2 === 0 ? "Pick up item" : "Deliver item" : "Finish repair step"
              : task.kind === "sequence" ? "Start sequence" : task.kind === "delivery" ? task.step % 2 === 0 ? "Collect" : "Deliver" : "Repair";
            button.addEventListener("click", () => {
              this.effects.play(active ? "click" : "select");
              if (active) this.client.taskStep(game.round, task.taskId, task.step, value);
              else this.client.openTask(game.round, task.taskId);
            });
            controls.append(button);
          }
          item.append(controls);
          if (active) {
            const timer = document.createElement("p");
            timer.className = "task-timer";
            timer.setAttribute("role", "timer");
            item.append(timer);
          }
        }
        list.append(item);
      }
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Close interaction";
      cancel.hidden = state.activeTaskId === null;
      cancel.addEventListener("click", () => this.client.closeTask());
      this.#content.replaceChildren(list, cancel);
      if (state.activeTaskId !== null) this.#ledger.open = true;
    }
    for (const item of Array.from(this.#content.querySelectorAll<HTMLLIElement>("li"))) {
      const task = state.tasks.find(task => task.taskId === item.dataset.taskId)!;
      const distance = pos ? Math.hypot(task.x - pos.x, task.y - pos.y) : Infinity;
      const nearby = available && !!pos && distance <= 64 && areaAt(task.x, task.y) === areaAt(pos.x, pos.y);
      const active = state.activeTaskId === task.taskId;
      for (const button of Array.from(item.querySelectorAll<HTMLButtonElement>("button"))) button.disabled = !nearby || active && seconds > 0;
      const timer = item.querySelector(".task-timer");
      if (timer) timer.textContent = seconds > 0 ? `Working… ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} remaining` : "Ready — finish this step";
      const direction = item.querySelector(".task-direction")!;
      direction.textContent = task.step === task.steps ? "Complete" : nearby ? "Within reach" : pos ? this.directionTo(task.x - pos.x, task.y - pos.y, distance) : "Explore the town to find this Task";
    }
  }

  private directionTo(dx: number, dy: number, distance: number): string {
    const headings = ["East", "Southeast", "South", "Southwest", "West", "Northwest", "North", "Northeast"];
    const heading = headings[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];
    return `${heading} · ${Math.ceil(distance / 32)} tiles away`;
  }
}
