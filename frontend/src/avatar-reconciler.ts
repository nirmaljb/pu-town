import type Phaser from "phaser";
import type { AvatarCollection, AvatarPreset } from "./avatar-presets.js";
import { DIRECTIONS, seatFacing, type Direction } from "./avatar-facing.js";
import { AvatarSeating } from "./avatar-seating.js";
import type { LocalPosition } from "./field-controller.js";
import type { WorldReconciler } from "./network-frame-boundary.js";
import { meetingSeat } from "./meeting-area.js";
import type { FieldPlayer, RosterEntry } from "./protocol.js";
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
  /** Where the latest field state put this Avatar during a Roam, or null when seated. */
  target: FieldPlayer | null;
  walkingUntil: number;
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
  readonly #bodies = new Map<string, Phaser.GameObjects.Container>();
  #roaming = false;
  #selfPlayerId: string | null = null;

  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * A started Room draws its Game Roster, so an Eliminated Player keeps their Seat and a
   * departed one leaves it empty without moving anyone else. During a Roam, only the
   * Avatars the server sent this recipient are drawn at all.
   */
  reconcile(world: WorldState, arrivals: ReadonlySet<string> = new Set()): void {
    this.#selfPlayerId = world.selfPlayerId;
    const field = world.game?.phase === "roam" ? world.field : null;
    this.#roaming = field !== null;
    const roster: readonly RosterEntry[] = world.game?.players
      ?? [...world.players.values()].map(player => ({
        playerId: player.playerId, displayName: player.displayName, colour: player.colour,
        avatarPreset: player.avatarPreset, seat: player.seat, status: "living" as const
      }));
    // Only a living Participant Forfeits, so an Eliminated Player who leaves, or anyone
    // leaving a finished Game, keeps their status; the ended Membership is what empties the Seat.
    const departed = new Set(roster.filter(entry => entry.status === "left" || !world.players.has(entry.playerId))
      .map(entry => entry.playerId));
    const present = new Set(roster.filter(entry => !departed.has(entry.playerId)).map(entry => entry.playerId));
    for (const [playerId, avatar] of this.#avatars) {
      if (!present.has(playerId)) {
        avatar.container.destroy(true);
        this.#avatars.delete(playerId);
      }
    }
    for (const [playerId, marker] of this.#emptySeats) {
      if (!departed.has(playerId)) {
        marker.destroy();
        this.#emptySeats.delete(playerId);
      }
    }
    const visible = new Map((field?.players ?? []).map(player => [player.playerId, player]));
    for (const entry of roster) {
      if (departed.has(entry.playerId)) {
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
      avatar.seat = entry.seat;
      const connected = member?.connected ?? false;
      if (field !== null) {
        const seen = visible.get(entry.playerId) ?? null;
        if (seen && avatar.target === null) avatar.container.setPosition(seen.x, seen.y);
        if (seen && avatar.target && (seen.x !== avatar.target.x || seen.y !== avatar.target.y)) {
          avatar.walkingUntil = this.scene.time.now + 160;
        }
        avatar.target = seen;
        if (seen) avatar.facing = seen.facing;
        avatar.container.setVisible(seen !== null);
        avatar.container.setAlpha(seen?.ghost || seen?.vanished ? 0.4 : connected ? 1 : 0.6);
        avatar.status.setVisible(Boolean(seen?.ghost || seen?.vanished || !connected))
          .setText(seen?.ghost ? "Ghost" : seen?.vanished ? "Vanished" : "Reconnecting…").setColor("#fff0c9");
        continue;
      }
      avatar.target = null;
      avatar.container.setVisible(true);
      avatar.facing = seatFacing(entry.seat);
      const place = meetingSeat(entry.seat);
      avatar.container.setPosition(place.x, place.y).setDepth(place.y);
      avatar.seating.reconcile(entry.seat, arrivals.has(entry.playerId), this.scene.time.now);
      const eliminated = entry.status === "eliminated";
      avatar.container.setAlpha(eliminated ? 0.45 : connected ? 1 : 0.55);
      avatar.status.setVisible(true).setText(this.statusText(world, entry, connected))
        .setColor(eliminated ? "#d8b3b3" : member?.ready && world.phase === "lobby" ? "#b9f4c9" : "#fff0c9");
    }
    this.reconcileBodies(world, field?.bodies ?? []);
  }

  private reconcileBodies(world: WorldState, bodies: readonly Readonly<{ playerId: string; x: number; y: number }>[]): void {
    const current = new Set(bodies.map(body => body.playerId));
    for (const [playerId, body] of this.#bodies) {
      if (!current.has(playerId)) {
        body.destroy(true);
        this.#bodies.delete(playerId);
      }
    }
    for (const body of bodies) {
      if (this.#bodies.has(body.playerId)) continue;
      const entry = world.game?.players.find(player => player.playerId === body.playerId);
      const colour = Number.parseInt((entry?.colour ?? "#FFFFFF").slice(1), 16);
      const puddle = this.scene.add.ellipse(0, 6, 70, 26, 0x7a0d0d, 0.75);
      const figure = this.scene.add.sprite(0, -4, entry?.avatarPreset ?? "", 18)
        .setRotation(Math.PI / 2).setTint(0xb0a0a0);
      const marker = this.scene.add.ellipse(0, 10, 30, 10, colour, 0.5);
      const label = this.scene.add.text(0, -40, `${entry?.displayName ?? "Someone"} ✝`, {
        color: "#ffd6d6", fontFamily: "sans-serif", fontSize: "13px", backgroundColor: "#3a1515", padding: { x: 5, y: 2 }
      }).setOrigin(0.5);
      const container = this.scene.add.container(body.x, body.y, [puddle, marker, figure, label]).setDepth(body.y - 1);
      this.#bodies.set(body.playerId, container);
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

  /**
   * Seated Avatars lower into their chair. During a Roam, other Avatars glide toward the
   * position the server last sent, and this client's own Avatar follows local input.
   */
  updateAnimations(time: number, delta = 16, self: LocalPosition | null = null): void {
    const walkFrame = 1 + Math.floor(time / 90) % 8;
    for (const [playerId, avatar] of this.#avatars) {
      const { sprite } = avatar;
      if (this.#roaming) {
        sprite.setY(0).setCrop();
        avatar.legs.setVisible(false);
        let walking = time < avatar.walkingUntil;
        if (playerId === this.#selfPlayerId && self) {
          avatar.container.setPosition(self.x, self.y).setVisible(true);
          avatar.facing = self.facing;
          walking = self.moving;
        } else if (avatar.target) {
          const blend = Math.min(1, delta / 1_000 * 14);
          avatar.container.setPosition(
            avatar.container.x + (avatar.target.x - avatar.container.x) * blend,
            avatar.container.y + (avatar.target.y - avatar.container.y) * blend);
        }
        avatar.container.setDepth(avatar.container.y);
        sprite.setFrame(DIRECTIONS.indexOf(avatar.facing) * 9 + (walking ? walkFrame : 0));
        continue;
      }
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
      facing: seatFacing(entry.seat),
      target: null,
      walkingUntil: 0
    };
    this.#avatars.set(entry.playerId, avatar);
    return avatar;
  }
}
