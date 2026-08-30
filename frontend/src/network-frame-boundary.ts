import { NetworkInbox } from "./network-inbox.js";
import { reduceWorldEvent, type WorldState } from "./world-state.js";

export interface WorldReconciler {
  reconcile(world: WorldState): void;
}

export class NetworkFrameBoundary {
  #world: WorldState;

  constructor(
    private readonly inbox: NetworkInbox,
    initialWorld: WorldState,
    private readonly view: WorldReconciler
  ) {
    this.#world = initialWorld;
  }

  get world(): WorldState {
    return this.#world;
  }

  /** Call first from the Phaser scene's update method. */
  beginFrame(): void {
    const events = this.inbox.drain();
    if (events.length === 0) return;
    this.#world = events.reduce(reduceWorldEvent, this.#world);
    this.view.reconcile(this.#world);
  }
}
