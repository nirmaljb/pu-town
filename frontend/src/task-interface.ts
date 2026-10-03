import type { ReconnectingGameClient } from "./reconnecting-game-client.js";
import type { WorldState } from "./world-state.js";
import type { GameView } from "./protocol.js";

/** Assignment details are private; the shared progress line never names a Participant. */
export class TaskInterface {
  readonly root = document.createElement("details");
  readonly #progress = document.createElement("p");
  readonly #list = document.createElement("ul");
  readonly #controls = new Map<string, HTMLButtonElement[]>();
  readonly #timers = new Map<string, HTMLElement>();
  #renderedGame: GameView | null = null;

  constructor(private readonly client: ReconnectingGameClient) {
    this.root.className = "tasks-panel";
    const summary = document.createElement("summary");
    summary.textContent = "Tasks";
    const hint = document.createElement("p");
    hint.textContent = "Green rings mark your assigned locations. Walk beside one to start. Repairs take 20 seconds per step. Sequences repeat the displayed order, with 5 seconds between inputs. Completed steps stay between Days.";
    this.root.append(summary, this.#progress, hint, this.#list);
  }

  render(world: WorldState | undefined, playing: boolean, now: number): void {
    const game = world?.game;
    this.root.hidden = !playing || !game;
    if (!game || !world) { this.#renderedGame = null; return; }
    if (game !== this.#renderedGame) {
      this.#renderedGame = game;
      this.#progress.textContent = `Village progress: ${game.taskProgress.completed} / ${game.taskProgress.total} steps`;
      this.#timers.clear();
      this.#controls.clear();
      const rows = (game.self.tasks ?? []).map(task => {
        const row = document.createElement("li");
        const name = document.createElement("p");
        name.textContent = `${task.name} · ${task.completedSteps} / ${task.totalSteps}`;
        const timer = document.createElement("span");
        this.#timers.set(task.taskId, timer);
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = task.active ? "Finish step" : task.kind === "sequence" ? "Start sequence" : "Start repair";
        button.disabled = game.phase !== "day" || game.self.status !== "living" || task.completedSteps === task.totalSteps;
        button.addEventListener("click", () => this.client.taskAction(game.round, task.taskId, task.completedSteps, task.active ? "complete" : "start"));
        row.append(name, timer);
        if (task.kind === "sequence") {
          const instruction = document.createElement("p");
          instruction.textContent = `Repeat ${task.sequence!.join(" → ")} · Next: ${task.sequence![task.completedSteps % task.sequence!.length]}`;
          row.append(instruction);
        }
        const controls: HTMLButtonElement[] = [];
        if (task.kind === "sequence" && task.active) {
          for (const input of [1, 2, 3, 4] as const) {
            const press = document.createElement("button");
            press.type = "button";
            press.textContent = String(input);
            press.addEventListener("click", () => this.client.taskAction(game.round, task.taskId, task.completedSteps, `press_${input}`));
            controls.push(press);
            row.append(press);
          }
        } else {
          row.append(button);
          if (task.active) controls.push(button);
        }
        this.#controls.set(task.taskId, controls);
        if (task.active) {
          const cancel = document.createElement("button");
          cancel.type = "button";
          cancel.textContent = "Cancel repair";
          cancel.addEventListener("click", () => this.client.taskAction(game.round, task.taskId, task.completedSteps, "cancel"));
          row.append(cancel);
        }
        return row;
      });
      this.#list.replaceChildren(...rows);
    }
    for (const task of game.self.tasks ?? []) {
      const timer = this.#timers.get(task.taskId);
      const remaining = task.workRemainingMs === null ? 0 : Math.max(0, task.workRemainingMs - (now - world.gameReceivedAt));
      if (timer) timer.textContent = task.workRemainingMs === null ? "" : `${Math.ceil(remaining / 1000)}s · `;
      for (const control of this.#controls.get(task.taskId) ?? [])
        control.disabled = game.phase !== "day" || game.self.status !== "living" || remaining > 0;
    }
  }
}
