import { MOVEMENT_SEND_INTERVAL_MS } from "./room-rules.js";

export const DIRECTIONS = ["up", "left", "down", "right"] as const;
export type Direction = typeof DIRECTIONS[number];
export const REMOTE_IDLE_DELAY_MS = MOVEMENT_SEND_INTERVAL_MS * 3;

/** Presentation state only: authoritative positions remain in WorldState. */
export class AvatarMotion {
  direction: Direction = "down";
  walking = false;
  #lastMovedAt = -Infinity;

  constructor(private x: number, private y: number) {}

  update(x: number, y: number, time: number, local: boolean, frozen = false): void {
    const dx = x - this.x;
    const dy = y - this.y;
    this.x = x;
    this.y = y;
    if (frozen) {
      this.#lastMovedAt = -Infinity;
      this.walking = false;
      return;
    }
    const moved = dx !== 0 || dy !== 0;
    if (moved) {
      this.direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
      this.#lastMovedAt = time;
    }
    this.walking = local ? moved : time - this.#lastMovedAt < REMOTE_IDLE_DELAY_MS;
  }
}
