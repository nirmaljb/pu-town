import type { SoundEffects } from "./sound-effects.js";
import type { ReconnectingGameClient } from "./reconnecting-game-client.js";
import type { WorldState } from "./world-state.js";
import { areaAt } from "./room-rules.js";

/** Personal assignments and their current server-authorized interaction, rendered at frames. */
export class TaskInterface {
  readonly #root = document.createElement("section");
  #signature = "";
  constructor(private readonly client: ReconnectingGameClient, private readonly effects: SoundEffects, private readonly now = Date.now) {
    this.#root.className = "task-interface";
    this.#root.setAttribute("aria-label", "Tasks");
    document.querySelector("#game-container")?.append(this.#root);
  }
  destroy(): void { this.#root.remove(); }
  render(world: WorldState | undefined): void {
    const game = world?.game;
    const state = world?.tasks;
    this.#root.hidden = !game || !state || game.phase === "role_reveal";
    if (!game || !state) return;
    const pos = world.field?.self;
    const seconds = Math.ceil(Math.max(0, (world.taskEndsAt ?? this.now()) - this.now()) / 1000);
    const available = game.phase === "day" && game.self.status !== "left" && this.client.state.status === "playing";
    const nearby = state.tasks.map(task => available && !!pos && Math.hypot(task.x - pos.x, task.y - pos.y) <= 64 && areaAt(task.x, task.y) === areaAt(pos.x, pos.y));
    const signature = JSON.stringify([game.round, game.phase, state, seconds, nearby, available]);
    if (signature === this.#signature) return;
    this.#signature = signature;
    const heading = document.createElement("strong");
    heading.textContent = `Village Tasks: ${state.completed}/${state.total}`;
    const list = document.createElement("ul");
    for (const [index, task] of state.tasks.entries()) {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = `${task.fake ? "Fake · " : ""}${task.name} · ${task.step}/${task.steps} · ${areaAt(task.x, task.y)} (${task.x}, ${task.y})`;
      item.append(label);
      if (task.step < task.steps) {
        const active = state.activeTaskId === task.taskId;
        const values = active && task.kind === "sequence" ? [0, 1, 2, 3] : [0];
        if (task.kind === "sequence") {
          const pattern = document.createElement("small");
          pattern.textContent = `Sequence: ${task.sequence.map(value => value + 1).join(" → ")}`;
          item.append(pattern);
        }
        for (const value of values) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = active ? seconds > 0 ? `Working… ${seconds}s` : task.kind === "sequence" ? `${value + 1}` : task.kind === "delivery" ? task.step % 2 === 0 ? "Pick up item" : "Deliver item" : "Finish repair step"
            : task.kind === "sequence" ? "Start sequence" : task.kind === "delivery" ? task.step % 2 === 0 ? "Collect" : "Deliver" : "Repair";
          button.disabled = !nearby[index] || active && seconds > 0;
          button.addEventListener("click", () => { this.effects.play(active ? "click" : "select");
            if (active) this.client.taskStep(game.round, task.taskId, task.step, value);
            else this.client.openTask(game.round, task.taskId);
          });
          item.append(button);
        }
      }
      list.append(item);
    }
    const cancel = document.createElement("button");
    cancel.type = "button"; cancel.textContent = "Close interaction"; cancel.hidden = state.activeTaskId === null;
    cancel.addEventListener("click", () => this.client.closeTask());
    this.#root.replaceChildren(heading, list, cancel);
  }
}
