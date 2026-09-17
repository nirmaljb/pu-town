import type Phaser from "phaser";
import type { AvatarCollection, AvatarPreset } from "./avatar-presets.js";
import { DIRECTIONS, seatFacing, type Direction } from "./avatar-facing.js";
import { AvatarSeating } from "./avatar-seating.js";
import type { WorldReconciler } from "./network-frame-boundary.js";
import { meetingSeat } from "./meeting-area.js";
import type { RosterEntry } from "./protocol.js";
import type { WorldState } from "./world-state.js";

type AvatarView = {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  seating: AvatarSeating;
  legs: Phaser.GameObjects.Sprite;
  preset: AvatarPreset;
  label: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
  seat: number;
  facing: Direction;
};

let loaded: AvatarCollection | null = null;

/**
 * Creates every texture in a Room's pinned collection. The scene waits on this before it
 * renders the Room, so nothing downstream loads artwork on demand.
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
      loaded = collection;
      resolve();
    });
    scene.load.start();
  });
}

/** Presets are only unique within a collection, so superseded artwork must go first. */
function releaseAvatarCollection(scene: Phaser.Scene): void {
  for (const preset of loaded?.presets ?? []) {
    scene.textures.remove(preset.id);
    scene.textures.remove(`${preset.id}-seated`);
  }
  loaded = null;
}

export class AvatarReconciler implements WorldReconciler {
  readonly #avatars = new Map<string, AvatarView>();
  readonly #emptySeats = new Map<string, Phaser.GameObjects.Text>();

  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * A started Room draws its Game Roster, so an Eliminated Player keeps their Seat and a
   * departed one leaves it empty without moving anyone else.
   */
  reconcile(world: WorldState, arrivals: ReadonlySet<string> = new Set()): void {
    const roster: readonly RosterEntry[] = world.game?.players
      ?? [...world.players.values()].map(player => ({
        playerId: player.playerId, displayName: player.displayName, colour: player.colour,
        avatarPreset: player.avatarPreset, seat: player.seat, status: "living" as const
      }));
    const seated = roster.filter(entry => entry.status !== "left");
    const present = new Set(seated.map(entry => entry.playerId));
    for (const [playerId, avatar] of this.#avatars) {
      if (!present.has(playerId)) {
        avatar.container.destroy(true);
        this.#avatars.delete(playerId);
      }
    }
    const departed = new Set(roster.filter(entry => entry.status === "left").map(entry => entry.playerId));
    for (const [playerId, marker] of this.#emptySeats) {
      if (!departed.has(playerId)) {
        marker.destroy();
        this.#emptySeats.delete(playerId);
      }
    }
    for (const entry of roster) {
      if (entry.status === "left") {
        this.markSeatLeft(entry);
        continue;
      }
      const member = world.players.get(entry.playerId);
      const avatar = this.#avatars.get(entry.playerId) ?? this.createAvatar(entry);
      if (avatar.preset !== entry.avatarPreset) {
        avatar.sprite.stop().setTexture(entry.avatarPreset, DIRECTIONS.indexOf(avatar.facing) * 9);
        avatar.legs.setTexture(`${entry.avatarPreset}-seated`);
        avatar.preset = entry.avatarPreset;
      }
      avatar.facing = seatFacing(entry.seat);
      avatar.seat = entry.seat;
      const place = meetingSeat(entry.seat);
      avatar.container.setPosition(place.x, place.y).setDepth(place.y);
      avatar.seating.reconcile(entry.seat, arrivals.has(entry.playerId), this.scene.time.now);
      const eliminated = entry.status === "eliminated";
      const connected = member?.connected ?? false;
      avatar.container.setAlpha(eliminated ? 0.45 : connected ? 1 : 0.55);
      avatar.status.setVisible(true).setText(this.statusText(world, entry, connected))
        .setColor(eliminated ? "#d8b3b3" : member?.ready && world.phase === "lobby" ? "#b9f4c9" : "#fff0c9");
    }
  }

  private statusText(world: WorldState, entry: RosterEntry, connected: boolean): string {
    if (entry.status === "eliminated") return "Eliminated";
    if (!connected) return "Reconnecting…";
    if (world.phase !== "lobby") return "";
    const member = world.players.get(entry.playerId);
    return (member?.ready ? "✓ Ready" : "Not Ready") + (world.hostPlayerId === entry.playerId ? " • Host" : "");
  }

  private markSeatLeft(entry: RosterEntry): void {
    const place = meetingSeat(entry.seat);
    const existing = this.#emptySeats.get(entry.playerId);
    if (existing) return;
    const marker = this.scene.add.text(place.x, place.y - 46, `${entry.displayName} • Left`, {
      color: "#c8c2b4", fontFamily: "sans-serif", fontSize: "13px",
      backgroundColor: "#2a2118", padding: { x: 6, y: 3 }
    }).setOrigin(0.5).setDepth(place.y);
    this.#emptySeats.set(entry.playerId, marker);
  }

  /** Seated Avatars only lower into their chair; nothing in a Game walks. */
  updateAnimations(time: number): void {
    for (const avatar of this.#avatars.values()) {
      const { sprite } = avatar;
      const sitting = avatar.seating.progress(time);
      sprite.setFrame(DIRECTIONS.indexOf(avatar.facing) * 9);
      const lowering = Math.round(10 * (1 - (1 - sitting) ** 3));
      const bent = sitting >= 0.2;
      sprite.setY(lowering);
      if (bent) sprite.setCrop(0, 0, 64, 42);
      else sprite.setCrop();
      avatar.legs.setVisible(bent);
      avatar.legs.setFrame(DIRECTIONS.indexOf(avatar.facing) * 11 + lowering);
    }
  }

  private createAvatar(entry: RosterEntry): AvatarView {
    const colour = Number.parseInt(entry.colour.slice(1), 16);
    const place = meetingSeat(entry.seat);
    const marker = this.scene.add.ellipse(0, 0, 28, 10, colour, 0.35).setStrokeStyle(2, colour);
    // LPC feet sit near pixel 56 in a 64px cell. World coordinates mark the feet.
    const sprite = this.scene.add.sprite(0, 0, entry.avatarPreset, 18).setOrigin(0.5, 56 / 64);
    const legs = this.scene.add.sprite(0, 0, `${entry.avatarPreset}-seated`, 0).setOrigin(0.5, 40 / 64).setVisible(false);
    const label = this.scene.add.text(0, -66, entry.displayName, {
      color: "#ffffff", fontFamily: "sans-serif", fontSize: "14px",
      stroke: "#101725", strokeThickness: 3, backgroundColor: "#302820", padding: { x: 5, y: 3 }
    }).setOrigin(0.5);
    const status = this.scene.add.text(0, -46, "", {
      color: "#fff0c9", fontFamily: "sans-serif", fontSize: "13px",
      backgroundColor: "#302820", padding: { x: 6, y: 3 }
    }).setOrigin(0.5);
    // Fit the longest accepted Display Names within neighbouring seat labels.
    if (label.width > 210) label.setScale(210 / label.width);
    const avatar: AvatarView = {
      container: this.scene.add.container(place.x, place.y, [marker, legs, sprite, label, status]),
      sprite, legs, label, status, seat: entry.seat, seating: new AvatarSeating(),
      preset: entry.avatarPreset,
      facing: seatFacing(entry.seat)
    };
    this.#avatars.set(entry.playerId, avatar);
    return avatar;
  }
}
