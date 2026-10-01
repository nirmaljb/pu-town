import type { ServerMessage } from "./protocol.js";

/** A decoded server event and the local time its message arrived. */
export type Arrival = Readonly<{ event: ServerMessage; receivedAt: number }>;

export class NetworkInbox {
  readonly #arrivals: Arrival[] = [];

  constructor(private readonly now: () => number = Date.now) {}

  enqueue(event: ServerMessage): void {
    // Stamped on arrival: frames may not run for a while (a hidden tab), but server clocks keep going.
    this.#arrivals.push({ event, receivedAt: this.now() });
  }

  drain(): readonly Arrival[] {
    return this.#arrivals.splice(0);
  }
}
