import { expect, type Page } from "@playwright/test";
import type { ServerMessage } from "../src/protocol.js";
import { GAME_URL } from "./environment.js";
import { walkable } from "../src/room-rules.js";

/** Observe only messages delivered to this browser, never hidden Game state. */
export class Player {
  readonly events: ServerMessage[] = [];
  constructor(readonly page: Page, readonly name: string) {
    page.on("websocket", socket => {
      if (!socket.url().includes("/ws/game")) return;
      socket.on("framereceived", ({ payload }) => this.events.push(JSON.parse(String(payload)) as ServerMessage));
    });
  }
  latest<T extends ServerMessage["type"]>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    return [...this.events].reverse().find(event => event.type === type) as Extract<ServerMessage, { type: T }> | undefined;
  }
  async enter(code?: string): Promise<void> {
    await this.page.bringToFront();
    await this.page.goto(GAME_URL);
    await this.page.getByLabel("Display Name", { exact: true }).fill(this.name);
    if (code) await this.page.getByLabel("Room Code", { exact: true }).fill(code);
    await this.page.getByRole("button", { name: code ? "Join Lobby" : "Create Room", exact: true }).click();
    await expect(this.page.locator(".room-bar")).toBeVisible();
  }
  async phase(phase: string, timeout = 15_000): Promise<void> {
    await this.page.bringToFront();
    await expect.poll(() => this.latest("game_state")?.phase, { timeout }).toBe(phase);
    await this.page.bringToFront();
    await expect(this.page.locator(".game-phase")).toContainText(phase === "day" ? "Day" : phase === "night" ? "Night" : phase === "finished" ? "Game over" : phase === "voting_result" ? "verdict" : "Townhall");
  }
  /** Keyboard movement stays on the production prediction/validation path. */
  async walkAxis(axis: "x" | "y", target: number): Promise<void> {
    await this.page.bringToFront();
    const canvas = await this.page.locator("canvas").boundingBox();
    await this.page.locator("canvas").click({ position: { x: canvas!.width / 2, y: canvas!.height / 2 } });
    await expect.poll(() => this.latest("field_state")?.self[axis]).toBeDefined();
    const start = this.latest("field_state")!.self[axis];
    const key = axis === "x" ? target > start ? "d" : "a" : target > start ? "s" : "w";
    await this.page.keyboard.down(key);
    try {
      await expect.poll(() => this.latest("field_state")!.self[axis], { timeout: Math.abs(target - start) / 100 * 1000 + 5000, intervals: [30] })
        [target > start ? "toBeGreaterThanOrEqual" : "toBeLessThanOrEqual"](target);
    } finally { await this.page.keyboard.up(key); }
  }
  async walkTo(x: number, y: number): Promise<void> {
    await this.page.bringToFront();
    const canvas = await this.page.locator("canvas").boundingBox();
    await this.page.locator("canvas").click({ position: { x: canvas!.width / 2, y: canvas!.height / 2 } });
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const position = this.latest("field_state")!.self;
      if (Math.hypot(x - position.x, y - position.y) < 38) return;
      const next = route(position, { x, y });
      const dx = next.x - position.x, dy = next.y - position.y;
      const keys = [Math.abs(dx) > .5 ? dx > 0 ? "d" : "a" : null, Math.abs(dy) > .5 ? dy > 0 ? "s" : "w" : null].filter((key): key is string => key !== null);
      const distance = keys.length === 2 ? Math.min(Math.abs(dx), Math.abs(dy)) * Math.SQRT2 : Math.hypot(dx, dy);
      for (const key of keys) await this.page.keyboard.down(key);
      try { await this.page.waitForTimeout(Math.min(160, distance / 220 * 1000)); }
      finally { for (const key of keys) await this.page.keyboard.up(key); }
      await this.page.waitForTimeout(120);
    }
    throw new Error(`Keyboard navigation did not reach (${x}, ${y}); last accepted position ${JSON.stringify(this.latest("field_state")!.self)}`);
  }
}

/** Route keyboard gestures around map obstacles; assertions still use server messages. */
function route(start: { x: number; y: number }, target: { x: number; y: number }): { x: number; y: number } {
  const grid = 16;
  const origin = { x: Math.round(start.x / grid) * grid, y: Math.round(start.y / grid) * grid };
  const queue = [origin];
  const key = (point: { x: number; y: number }) => `${point.x},${point.y}`;
  const previous = new Map<string, typeof origin | null>([[key(origin), null]]);
  for (let index = 0; index < queue.length; index++) {
    const point = queue[index]!;
    if (Math.hypot(point.x - target.x, point.y - target.y) < 28) {
      const path = [point];
      let parent = previous.get(key(point));
      while (parent) { path.unshift(parent); parent = previous.get(key(parent)); }
      // Never skip a bend by cutting an obstacle corner with diagonal key input.
      const clear = (end: typeof origin) => {
        const distance = Math.hypot(end.x - start.x, end.y - start.y);
        const steps = Math.ceil(distance / 2);
        for (let step = 1; step <= steps; step++) {
          if (!walkable(start.x + (end.x - start.x) * step / steps, start.y + (end.y - start.y) * step / steps)) return false;
        }
        return true;
      };
      for (let index = Math.min(6, path.length - 1); index > 0; index--) {
        const point = path[index]!;
        if ((Math.abs(point.x - start.x) < .5 || Math.abs(point.y - start.y) < .5) && clear(point)) return point;
      }
      if (path[1] && clear(path[1])) return path[1];
      return path[0]!;
    }
    for (const [dx, dy] of [[grid, 0], [-grid, 0], [0, grid], [0, -grid]]) {
      const next = { x: point.x + dx!, y: point.y + dy! };
      if (walkable(next.x, next.y) && !previous.has(key(next))) { previous.set(key(next), point); queue.push(next); }
    }
  }
  throw new Error(`No walkable route to (${target.x}, ${target.y})`);
}
