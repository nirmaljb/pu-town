import Phaser from "phaser";
import { AVATAR_PRESETS } from "./avatar-presets.js";
import { AvatarMotion, DIRECTIONS, type Direction } from "./avatar-motion.js";
import { AvatarSeating } from "./avatar-seating.js";
import { drawSeatedLegs } from "./seated-pose.js";
import type { WorldReconciler } from "./network-frame-boundary.js";
import type { PlayerView } from "./protocol.js";
import type { WorldState } from "./world-state.js";

type AvatarView = {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  motion: AvatarMotion;
  seating: AvatarSeating;
  legs: Phaser.GameObjects.Graphics;
  poseKey: string;
  preset: PlayerView["avatarPreset"];
  label: Phaser.GameObjects.Text;
  readiness: Phaser.GameObjects.Text;
  seat: number | null;
  facing: Direction;
  connected: boolean;
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

  reconcile(world: WorldState, arrivals: ReadonlySet<string> = new Set()): void {
    for (const [playerId, avatar] of this.#avatars) {
      if (!world.players.has(playerId)) {
        avatar.container.destroy(true);
        this.#avatars.delete(playerId);
      }
    }
    for (const player of world.players.values()) {
      const avatar = this.#avatars.get(player.playerId) ?? this.createAvatar(player);
      avatar.connected = player.connected;
      avatar.container.setAlpha(player.connected ? 1 : 0.5);
      avatar.seat = world.phase === "lobby" ? player.seat : null;
      avatar.seating.reconcile(avatar.seat, arrivals.has(player.playerId), this.scene.time.now);
      const seated = avatar.seat !== null;
      avatar.label.setY(seated ? -66 : -62);
      avatar.readiness.setVisible(seated || !player.connected).setText(
        !player.connected ? "Reconnecting…" : (player.ready ? "✓ Ready" : "Not Ready") + (world.hostPlayerId === player.playerId ? " • Host" : "")
      ).setColor(player.ready ? "#b9f4c9" : "#fff0c9");
      if (player.playerId !== world.selfPlayerId || world.phase !== "playing") {
        avatar.container.setPosition(player.x, player.y);
        avatar.facing = player.facing;
      }
    }
  }

  moveLocally(playerId: string, x: number, y: number, facing: Direction): void {
    const avatar = this.#avatars.get(playerId);
    if (avatar) { avatar.container.setPosition(x, y); avatar.facing = facing; }
  }

  updateAnimations(time: number, localPlayerId: string | null, frozen = false): void {
    for (const [playerId, avatar] of this.#avatars) {
      const { container, sprite, motion } = avatar;
      motion.update(container.x, container.y, time, playerId === localPlayerId, frozen || !avatar.connected || avatar.seat !== null);
      motion.direction = avatar.facing;
      container.setDepth(container.y);
      const sitting = avatar.seating.progress(time);
      if (sitting !== null) {
        sprite.stop().setFrame(DIRECTIONS.indexOf(avatar.facing) * 9);
        const lowering = Math.round(10 * (1 - (1 - sitting) ** 3));
        const bent = sitting >= 0.2;
        sprite.setY(lowering);
        if (bent) sprite.setCrop(0, 0, 64, 42);
        else sprite.setCrop();
        avatar.legs.setVisible(bent);
        const poseKey = `${avatar.facing}-${lowering}`;
        if (avatar.poseKey !== poseKey) {
          drawSeatedLegs(avatar.legs, avatar.preset, avatar.facing, lowering);
          avatar.poseKey = poseKey;
        }
        continue;
      }
      sprite.setCrop().setY(0);
      avatar.legs.setVisible(false);
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
    const legs = this.scene.add.graphics().setVisible(false);
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
      container: this.scene.add.container(player.x, player.y, [marker, legs, sprite, label, readiness]),
      sprite, legs, label, readiness, seat: null, seating: new AvatarSeating(),
      poseKey: "", preset: player.avatarPreset,
      motion: new AvatarMotion(player.x, player.y),
      connected: player.connected,
      facing: player.facing
    };
    this.#avatars.set(player.playerId, avatar);
    return avatar;
  }
}
