import type Phaser from "phaser";
import type { AvatarCollection } from "./avatar-presets.js";
import { AvatarMotion, DIRECTIONS, type Direction } from "./avatar-motion.js";
import { AvatarSeating } from "./avatar-seating.js";
import type { WorldReconciler } from "./network-frame-boundary.js";
import type { PlayerView } from "./protocol.js";
import type { WorldState } from "./world-state.js";

type AvatarView = {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  motion: AvatarMotion;
  seating: AvatarSeating;
  legs: Phaser.GameObjects.Sprite;
  preset: PlayerView["avatarPreset"];
  label: Phaser.GameObjects.Text;
  readiness: Phaser.GameObjects.Text;
  seat: number | null;
  facing: Direction;
  connected: boolean;
};

let loaded: AvatarCollection | null = null;

/**
 * Creates every texture and walk animation in a Room's pinned collection. The scene waits
 * on this before it renders the Room, so nothing downstream loads artwork on demand.
 */
export function loadAvatarCollection(scene: Phaser.Scene, collection: AvatarCollection): Promise<void> {
  if (loaded?.collectionId === collection.collectionId) return Promise.resolve();
  releaseAvatarCollection(scene);
  for (const preset of collection.presets) {
    scene.load.spritesheet(preset.id, preset.sprite, { frameWidth: 64, frameHeight: 64 });
    scene.load.spritesheet(`${preset.id}-seated`, preset.seatedSprite, { frameWidth: 64, frameHeight: 64 });
  }
  return new Promise((resolve, reject) => {
    scene.load.once("complete", () => {
      const incomplete = collection.presets.find(preset =>
        !scene.textures.exists(preset.id) || !scene.textures.exists(`${preset.id}-seated`));
      if (incomplete) {
        releaseAvatarCollection(scene);
        reject(new Error(`Avatar Preset artwork could not be decoded: ${incomplete.id}`));
        return;
      }
      for (const preset of collection.presets) {
        DIRECTIONS.forEach((direction, row) => {
          scene.anims.create({
            key: `${preset.id}-walk-${direction}`,
            frames: scene.anims.generateFrameNumbers(preset.id, { start: row * 9 + 1, end: row * 9 + 8 }),
            frameRate: 10,
            repeat: -1
          });
        });
      }
      loaded = collection;
      resolve();
    });
    scene.load.start();
  });
}

/** Presets are only unique within a collection, so superseded artwork must go first. */
function releaseAvatarCollection(scene: Phaser.Scene): void {
  for (const preset of loaded?.presets ?? []) {
    for (const direction of DIRECTIONS) scene.anims.remove(`${preset.id}-walk-${direction}`);
    scene.textures.remove(preset.id);
    scene.textures.remove(`${preset.id}-seated`);
  }
  loaded = null;
}

export class AvatarReconciler implements WorldReconciler {
  readonly #avatars = new Map<string, AvatarView>();

  constructor(private readonly scene: Phaser.Scene) {}

  reconcile(world: WorldState, arrivals: ReadonlySet<string> = new Set()): void {
    for (const [playerId, avatar] of this.#avatars) {
      if (!world.players.has(playerId)) {
        avatar.container.destroy(true);
        this.#avatars.delete(playerId);
      }
    }
    for (const player of world.players.values()) {
      const avatar = this.#avatars.get(player.playerId) ?? this.createAvatar(player);
      if (avatar.preset !== player.avatarPreset) {
        avatar.sprite.stop().setTexture(player.avatarPreset, DIRECTIONS.indexOf(player.facing) * 9);
        avatar.legs.setTexture(`${player.avatarPreset}-seated`);
        avatar.preset = player.avatarPreset;
      }
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
        avatar.legs.setFrame(DIRECTIONS.indexOf(avatar.facing) * 11 + lowering);
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
    const legs = this.scene.add.sprite(0, 0, `${player.avatarPreset}-seated`, 0).setOrigin(0.5, 40 / 64).setVisible(false);
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
      preset: player.avatarPreset,
      motion: new AvatarMotion(player.x, player.y),
      connected: player.connected,
      facing: player.facing
    };
    this.#avatars.set(player.playerId, avatar);
    return avatar;
  }
}
