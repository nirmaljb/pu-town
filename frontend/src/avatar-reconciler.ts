import Phaser from "phaser";
import { meetingSeat } from "./meeting-area.js";
import { AVATAR_PRESETS } from "./avatar-presets.js";
import { AvatarMotion, DIRECTIONS } from "./avatar-motion.js";
import type { WorldReconciler } from "./network-frame-boundary.js";
import type { PlayerView } from "./protocol.js";
import type { WorldState } from "./world-state.js";

type AvatarView = {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  motion: AvatarMotion;
  label: Phaser.GameObjects.Text;
  readiness: Phaser.GameObjects.Text;
  seat: number | null;
  authoritativeX: number;
  authoritativeY: number;
};

export function preloadAvatars(scene: Phaser.Scene): void {
  for (const preset of AVATAR_PRESETS) {
    scene.load.spritesheet(preset, `assets/avatars/${preset}.png`, { frameWidth: 64, frameHeight: 64 });
  }
}

export class AvatarReconciler implements WorldReconciler {
  readonly #avatars = new Map<string, AvatarView>();

  constructor(private readonly scene: Phaser.Scene) {
    for (const preset of AVATAR_PRESETS) {
      DIRECTIONS.forEach((direction, row) => {
        const key = `${preset}-walk-${direction}`;
        if (!scene.anims.exists(key)) scene.anims.create({
          key,
          frames: scene.anims.generateFrameNumbers(preset, { start: row * 9 + 1, end: row * 9 + 8 }),
          frameRate: 10,
          repeat: -1
        });
      });
    }
  }

  reconcile(world: WorldState): void {
    for (const [playerId, avatar] of this.#avatars) {
      if (!world.players.has(playerId)) {
        avatar.container.destroy(true);
        this.#avatars.delete(playerId);
      }
    }
    for (const player of world.players.values()) {
      const avatar = this.#avatars.get(player.playerId) ?? this.createAvatar(player);
      avatar.seat = world.phase === "lobby" ? player.seat : null;
      const seated = avatar.seat !== null;
      avatar.sprite.setScale(1, seated ? 0.78 : 1);
      avatar.sprite.setY(seated ? -4 : 0);
      avatar.label.setY(seated ? -66 : -62);
      avatar.readiness.setVisible(seated).setText(
        (player.ready ? "✓ Ready" : "Not Ready") + (world.hostPlayerId === player.playerId ? " • Host" : "")
      ).setColor(player.ready ? "#b9f4c9" : "#fff0c9");
      // Unrelated network events must not rewind the locally predicted position.
      if (player.x !== avatar.authoritativeX || player.y !== avatar.authoritativeY) {
        avatar.container.setPosition(player.x, player.y);
        avatar.authoritativeX = player.x;
        avatar.authoritativeY = player.y;
      }
    }
  }

  moveLocally(playerId: string, x: number, y: number): void {
    this.#avatars.get(playerId)?.container.setPosition(x, y);
  }

  updateAnimations(time: number, localPlayerId: string | null, frozen = false): void {
    for (const [playerId, avatar] of this.#avatars) {
      const { container, sprite, motion } = avatar;
      motion.update(container.x, container.y, time, playerId === localPlayerId, frozen || avatar.seat !== null);
      if (avatar.seat !== null) motion.direction = meetingSeat(avatar.seat).facing;
      container.setDepth(container.y);
      if (motion.walking) sprite.play(`${sprite.texture.key}-walk-${motion.direction}`, true);
      else {
        sprite.stop();
        sprite.setFrame(DIRECTIONS.indexOf(motion.direction) * 9);
      }
    }
  }

  private createAvatar(player: PlayerView): AvatarView {
    const colour = Number.parseInt(player.colour.slice(1), 16);
    const marker = this.scene.add.ellipse(0, 0, 28, 10, colour, 0.35).setStrokeStyle(2, colour);
    // LPC feet sit near pixel 56 in a 64px cell. World coordinates mark the feet.
    const sprite = this.scene.add.sprite(0, 0, player.avatarPreset, 18).setOrigin(0.5, 56 / 64);
    const label = this.scene.add.text(0, -62, player.displayName, {
      color: "#ffffff", fontFamily: "sans-serif", fontSize: "14px",
      stroke: "#101725", strokeThickness: 3, backgroundColor: "#302820", padding: { x: 5, y: 3 }
    }).setOrigin(0.5);
    const readiness = this.scene.add.text(0, -46, "", {
      color: "#fff0c9", fontFamily: "sans-serif", fontSize: "13px",
      backgroundColor: "#302820", padding: { x: 6, y: 3 }
    }).setOrigin(0.5);
    // Fit the longest accepted Display Names within neighbouring seat labels.
    if (label.width > 210) label.setScale(210 / label.width);
    const avatar: AvatarView = {
      container: this.scene.add.container(player.x, player.y, [marker, sprite, label, readiness]),
      sprite, label, readiness, seat: null,
      motion: new AvatarMotion(player.x, player.y),
      authoritativeX: player.x,
      authoritativeY: player.y
    };
    this.#avatars.set(player.playerId, avatar);
    return avatar;
  }
}
