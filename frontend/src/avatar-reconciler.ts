import Phaser from "phaser";
import type { WorldReconciler } from "./network-frame-boundary.js";
import type { WorldState } from "./world-state.js";

type AvatarView = Readonly<{ container: Phaser.GameObjects.Container }>;

export class AvatarReconciler implements WorldReconciler {
  readonly #avatars = new Map<string, AvatarView>();

  constructor(private readonly scene: Phaser.Scene) {}

  reconcile(world: WorldState): void {
    for (const [playerId, avatar] of this.#avatars) {
      if (!world.players.has(playerId)) {
        avatar.container.destroy(true);
        this.#avatars.delete(playerId);
      }
    }
    for (const player of world.players.values()) {
      const avatar = this.#avatars.get(player.playerId) ?? this.createAvatar(player.playerId, player.displayName, player.colour);
      avatar.container.setPosition(player.x, player.y);
    }
  }

  moveLocally(playerId: string, x: number, y: number): void {
    this.#avatars.get(playerId)?.container.setPosition(x, y);
  }

  private createAvatar(playerId: string, displayName: string, colour: string): AvatarView {
    const body = this.scene.add.circle(0, 0, 16, Number.parseInt(colour.slice(1), 16));
    const label = this.scene.add.text(0, -28, displayName, {
      color: "#ffffff",
      fontFamily: "sans-serif",
      fontSize: "14px"
    }).setOrigin(0.5);
    const avatar = { container: this.scene.add.container(0, 0, [body, label]) };
    this.#avatars.set(playerId, avatar);
    return avatar;
  }
}
