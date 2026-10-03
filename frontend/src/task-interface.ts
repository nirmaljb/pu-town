import type { ReconnectingGameClient } from "./reconnecting-game-client.js";
import type { WorldState } from "./world-state.js";
import type { GameView } from "./protocol.js";

/** Assignment details are private; the shared progress line never names a Participant. */
export class TaskInterface {
  readonly root = document.createElement("details");
  readonly #progress = document.createElement("p");
  readonly #list = document.createElement("ul");
  readonly #timers = new Map<string, HTMLElement>();
  #renderedGame: GameView | null = null;

  constructor(private readonly client: ReconnectingGameClient) {
    this.root.className = "tasks-panel";
    const summary = document.createElement("summary");
    summary.textContent = "Tasks";
    const hint = document.createElement("p");
    hint.textContent = "Green rings mark your assigned locations. Walk beside one, start repair, wait 20 seconds, then finish the step. Completed steps stay between Days.";
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
      const rows = (game.self.tasks ?? []).map(task => {
        const row = document.createElement("li");
        const name = document.createElement("p");
        name.textContent = `${task.name} · ${task.completedSteps} / ${task.totalSteps}`;
        const timer = document.createElement("span");
        this.#timers.set(task.taskId, timer);
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = task.active ? "Finish step" : "Start repair";
        button.disabled = game.phase !== "day" || game.self.status !== "living" || task.completedSteps === task.totalSteps;
        button.addEventListener("click", () => this.client.taskAction(game.round, task.taskId, task.completedSteps, task.active ? "complete" : "start"));
        row.append(name, timer, button);
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
      if (timer) timer.textContent = task.workRemainingMs === null ? ""
        : `${Math.ceil(Math.max(0, task.workRemainingMs - (now - world.gameReceivedAt)) / 1000)}s · `;
    }
  }
}
