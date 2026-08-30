import type { ServerMessage } from "./protocol.js";

export class NetworkInbox {
  readonly #events: ServerMessage[] = [];

  enqueue(event: ServerMessage): void {
    this.#events.push(event);
  }

  drain(): readonly ServerMessage[] {
    return this.#events.splice(0);
  }
}
