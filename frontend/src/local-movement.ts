import type { Direction } from "./avatar-motion.js";
import { MOVEMENT_SPEED, ROOM_HEIGHT, ROOM_WIDTH } from "./room-rules.js";
import type { MovementState } from "./protocol.js";

/** Prediction for one membership; accepted echoes acknowledge rather than replace it. */
export class LocalMovement {
  x: number;
  y: number;
  facing: Direction;
  dirty = false;
  #sequence: number;
  #epoch: number;

  constructor(state: MovementState) {
    this.x = state.x;
    this.y = state.y;
    this.facing = state.facing;
    this.#sequence = state.sequence;
    this.#epoch = state.epoch;
  }

  advance(horizontal: number, vertical: number, delta: number): void {
    if (horizontal === 0 && vertical === 0) return;
    const facing = vertical !== 0 ? (vertical > 0 ? "down" : "up") : (horizontal > 0 ? "right" : "left");
    const distance = MOVEMENT_SPEED * Math.min(Math.max(delta, 0), 50) / 1_000;
    const magnitude = Math.hypot(horizontal, vertical);
    const x = Math.max(0, Math.min(ROOM_WIDTH, this.x + horizontal / magnitude * distance));
    const y = Math.max(0, Math.min(ROOM_HEIGHT, this.y + vertical / magnitude * distance));
    this.dirty ||= x !== this.x || y !== this.y || facing !== this.facing;
    this.x = x;
    this.y = y;
    this.facing = facing;
  }

  submission(): MovementState {
    this.dirty = false;
    return { x: this.x, y: this.y, facing: this.facing, sequence: ++this.#sequence, epoch: this.#epoch };
  }

  accept(state: MovementState): void {
    if (state.epoch <= this.#epoch) return;
    this.#epoch = state.epoch;
    this.#sequence = Math.max(this.#sequence, state.sequence);
    this.x = state.x;
    this.y = state.y;
    this.dirty = this.facing !== state.facing;
  }
}
