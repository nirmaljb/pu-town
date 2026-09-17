import { NetworkInbox } from "./network-inbox.js";
import { emptyWorld, reduceWorldEvent, type WorldState } from "./world-state.js";

export interface WorldReconciler {
  reconcile(world: WorldState, arrivals?: ReadonlySet<string>): void;
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

  reset(): void {
    this.inbox.drain();
    this.#world = emptyWorld();
    this.view.reconcile(this.#world);
  }

  /** Call first from the Phaser scene's update method. */
  beginFrame(): void {
    const events = this.inbox.drain();
    if (events.length === 0) return;
    const arrivals = new Set<string>();
    for (const event of events) {
      if (event.type === "room_snapshot") {
        arrivals.clear();
        if (event.selfPlayerId !== this.#world.selfPlayerId || event.roomId !== this.#world.roomId) {
          arrivals.add(event.selfPlayerId);
        }
      } else if (event.type === "player_joined" && !this.#world.players.has(event.player.playerId)) {
        arrivals.add(event.player.playerId);
      } else if (event.type === "player_left") arrivals.delete(event.playerId);
      else if (event.type === "room_left") arrivals.clear();
      this.#world = reduceWorldEvent(this.#world, event);
    }
    this.view.reconcile(this.#world, arrivals);
  }
}
