import { LocalMovement } from "./local-movement.js";
import { NetworkInbox } from "./network-inbox.js";
import { emptyWorld, reduceWorldEvent, type WorldState } from "./world-state.js";

export interface WorldReconciler {
  reconcile(world: WorldState): void;
}

export class NetworkFrameBoundary {
  #world: WorldState;
  localMovement: LocalMovement | null = null;

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

  reset(): void {
    this.inbox.drain();
    this.#world = emptyWorld();
    this.localMovement = null;
    this.view.reconcile(this.#world);
  }

  /** Call first from the Phaser scene's update method. */
  beginFrame(): void {
    const events = this.inbox.drain();
    if (events.length === 0) return;
    for (const event of events) {
      const previousPhase = this.#world.phase;
      this.#world = reduceWorldEvent(this.#world, event);
      const player = this.#world.players.get(this.#world.selfPlayerId ?? "");
      if (!player || this.#world.phase !== "playing") this.localMovement = null;
      else if (event.type === "room_snapshot" || previousPhase !== "playing" || !this.localMovement) {
        this.localMovement = new LocalMovement(player);
      } else this.localMovement.accept(player);
    }
    this.view.reconcile(this.#world);
  }
}
