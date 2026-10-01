import type { Direction } from "./avatar-facing.js";
import { walkable, WALK_SPEED } from "./room-rules.js";
import type { WorldState } from "./world-state.js";

export type HeldKeys = Readonly<{ up: boolean; down: boolean; left: boolean; right: boolean }>;
export type LocalPosition = Readonly<{ x: number; y: number; facing: Direction; moving: boolean }>;

/** Positions are sent at most this often while walking. */
const SEND_INTERVAL_MS = 66;

/**
 * Walks this client's own Avatar during a Roam. The server re-checks every step; when it
 * refuses one, or moves us itself (a new Roam, a Crowding push), its correction counter
 * changes and we adopt the position it kept.
 */
export class FieldController {
  #active = false;
  #round = -1;
  #correction = -1;
  #x = 0;
  #y = 0;
  #facing: Direction = "down";
  #moving = false;
  #lastSentAt = -Infinity;
  #sent: Readonly<{ x: number; y: number; facing: Direction }> | null = null;

  constructor(private readonly send: (x: number, y: number, facing: Direction) => void) {}

  /** Where to draw this client's Avatar, or null outside a Roam. */
  get position(): LocalPosition | null {
    return this.#active ? { x: this.#x, y: this.#y, facing: this.#facing, moving: this.#moving } : null;
  }

  update(world: WorldState | undefined, keys: HeldKeys, deltaMs: number, now: number): void {
    const field = world?.field ?? null;
    if (!field || world?.game?.phase !== "roam") {
      this.#active = false;
      this.#round = -1;
      return;
    }
    if (!this.#active || field.round !== this.#round || field.self.correction !== this.#correction) {
      this.#x = field.self.x;
      this.#y = field.self.y;
      this.#facing = field.self.facing;
      this.#round = field.round;
      this.#correction = field.self.correction;
      this.#sent = { x: this.#x, y: this.#y, facing: this.#facing };
      this.#active = true;
    }
    let dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    let dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    this.#moving = dx !== 0 || dy !== 0;
    if (this.#moving) {
      const length = Math.hypot(dx, dy);
      const step = WALK_SPEED * Math.min(deltaMs, 100) / 1_000;
      dx = dx / length * step;
      dy = dy / length * step;
      // Each axis moves on its own, so walking into a wall slides along it.
      if (walkable(this.#x + dx, this.#y)) this.#x += dx;
      if (walkable(this.#x, this.#y + dy)) this.#y += dy;
      this.#facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
    }
    const sent = this.#sent;
    const changed = sent === null || sent.x !== this.#x || sent.y !== this.#y || sent.facing !== this.#facing;
    if (changed && now - this.#lastSentAt >= SEND_INTERVAL_MS) {
      this.send(this.#x, this.#y, this.#facing);
      this.#sent = { x: this.#x, y: this.#y, facing: this.#facing };
      this.#lastSentAt = now;
    }
  }
}
