import { MapControls } from "./map-controls.js";
import { mapRoot, townName } from "./town-maps.js";
import { WORLD_WIDTH, WORLD_HEIGHT } from "./room-rules.js";
import type { LocalPosition } from "./field-controller.js";
import type { WorldState } from "./world-state.js";

/** Terrain and this recipient's own position/Tasks only; no other Player positions. */
export class MapInterface {
  readonly #controls = new MapControls();
  readonly #button = document.createElement("button");
  readonly #dialog = document.createElement("dialog");
  readonly #title = document.createElement("h2");
  readonly #terrain = document.createElement("img");
  readonly #markers = document.createElement("div");
  #mapId = "";
  #signature = "";
  readonly #keyDown = (event: KeyboardEvent) => {
    const target = event.target;
    const typing = target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable]"));
    const otherModal = Array.from(document.querySelectorAll("dialog:modal")).some(dialog => dialog !== this.#dialog);
    if (this.#controls.handleKey(event.code, typing || otherModal || event.ctrlKey || event.metaKey || event.altKey, event.repeat)) event.preventDefault();
  };

  constructor() {
    this.#button.type = "button";
    this.#button.className = "map-toggle";
    this.#button.textContent = "Map · M";
    this.#button.setAttribute("aria-haspopup", "dialog");
    this.#button.hidden = true;
    this.#button.addEventListener("click", () => this.#controls.toggle());
    this.#dialog.className = "map-dialog";
    this.#dialog.setAttribute("aria-labelledby", "map-title");
    this.#title.id = "map-title";
    const close = document.createElement("button");
    close.type = "button"; close.textContent = "Close · Esc";
    close.addEventListener("click", () => this.#controls.close());
    const header = document.createElement("header"); header.append(this.#title, close);
    const surface = document.createElement("div"); surface.className = "map-surface";
    this.#terrain.alt = "Full town terrain";
    this.#markers.className = "map-markers";
    surface.append(this.#terrain, this.#markers);
    const legend = document.createElement("p");
    legend.className = "map-legend";
    legend.textContent = "● You   ◆ Your Tasks   ·   The Game clock keeps running";
    this.#dialog.append(header, surface, legend);
    this.#dialog.addEventListener("cancel", event => { event.preventDefault(); this.#controls.close(); });
    this.#dialog.addEventListener("close", () => this.#controls.close());
    document.body.append(this.#button, this.#dialog);
    window.addEventListener("keydown", this.#keyDown);
  }

  get open(): boolean { return this.#controls.open; }

  render(world: WorldState | undefined, connected: boolean, self: LocalPosition | null): void {
    const available = connected && world?.roomId != null;
    this.#controls.setAvailable(available);
    this.#button.hidden = !available;
    if (!this.open || !world) {
      if (this.#dialog.open) this.#dialog.close();
      return;
    }
    if (this.#mapId !== world.mapId) {
      this.#mapId = world.mapId;
      this.#title.textContent = townName(world.mapId);
      this.#terrain.src = `${mapRoot(world.mapId)}overview.png`;
      this.#terrain.style.aspectRatio = `${WORLD_WIDTH} / ${WORLD_HEIGHT}`;
      this.#terrain.parentElement?.style.setProperty("--map-aspect", String(WORLD_WIDTH / WORLD_HEIGHT));
    }
    const position = self ?? world.field?.self ?? world.players.get(world.selfPlayerId ?? "");
    const tasks = (world.tasks?.tasks ?? []).filter(task => task.step < task.steps);
    const signature = JSON.stringify([world.mapId, position?.x, position?.y, tasks]);
    if (signature !== this.#signature) {
      this.#signature = signature;
      this.#markers.replaceChildren();
      for (const task of tasks) this.marker(task.x, task.y, "task", task.name);
      if (position) this.marker(position.x, position.y, "self", "You");
    }
    if (!this.#dialog.open) this.#dialog.showModal();
  }

  private marker(x: number, y: number, kind: "self" | "task", label: string): void {
    const marker = document.createElement("span");
    marker.className = `map-marker map-marker-${kind}`;
    marker.style.left = `${x / WORLD_WIDTH * 100}%`;
    marker.style.top = `${y / WORLD_HEIGHT * 100}%`;
    marker.textContent = kind === "self" ? "●" : "◆";
    marker.title = label; marker.setAttribute("role", "img"); marker.setAttribute("aria-label", label);
    this.#markers.append(marker);
  }

  destroy(): void {
    window.removeEventListener("keydown", this.#keyDown);
    this.#button.remove(); this.#dialog.remove();
  }
}
