import Phaser from "phaser";
import { seatFacing, type Direction } from "./avatar-facing.js";
import { BUTTON_X, BUTTON_Y } from "./room-rules.js";

export const ROOM_CAPACITY = 10;

const MAP_KEY = "pu-town";
const MAP_ROOT = "maps/pu-town/";
/** Tile layers, bottom to top, all beneath the Avatars. */
const TILE_LAYERS = ["water", "sand", "grass", "bridge", "floor", "walls"];
const LAYER_DEPTH = -1_100;
/** Surf is drawn between the sea and the island; rugs and doormats lie beneath everyone. */
const FOAM_DEPTH = LAYER_DEPTH + 0.5;
const FLOOR_DECOR_DEPTH = -1_050;

type TiledTileset = Readonly<{ name: string; image: string; tilewidth: number; tileheight: number }>;

/** Every tileset image the map names, as a texture key. */
function textureOf(tileset: string): string {
  return `${MAP_KEY}-${tileset}`;
}

/**
 * Queues the PU Town map; once its JSON arrives, every tileset it embeds is queued too, as a
 * spritesheet cut to that tileset's tile size. Call from the scene's preload.
 */
export function loadTownMap(scene: Phaser.Scene): void {
  scene.load.once(`filecomplete-tilemapJSON-${MAP_KEY}`, () => {
    const data = scene.cache.tilemap.get(MAP_KEY)?.data as { tilesets?: TiledTileset[] } | undefined;
    for (const tileset of data?.tilesets ?? []) {
      scene.load.spritesheet(textureOf(tileset.name), MAP_ROOT + tileset.image,
        { frameWidth: tileset.tilewidth, frameHeight: tileset.tileheight });
    }
  });
  scene.load.tilemapTiledJSON(MAP_KEY, `${MAP_ROOT}pu-town.json`);
}

/** Seat zero is north; clockwise geometry mirrors authoritative RoomRules, in town coordinates. */
export function meetingSeat(seat: number): { x: number; y: number; facing: Direction } {
  return {
    x: BUTTON_X + Math.round(330 * Math.sin(seat * 2 * Math.PI / ROOM_CAPACITY)),
    y: BUTTON_Y + Math.round(-205 * Math.cos(seat * 2 * Math.PI / ROOM_CAPACITY)),
    facing: seatFacing(seat)
  };
}

/** The town the Players roam; Meetings gather on chairs around the button in the Town Square. */
export class MeetingArea {
  readonly #town: Phaser.GameObjects.GameObject[] = [];
  readonly #button: Phaser.GameObjects.Container;
  readonly #chairs: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    const map = scene.make.tilemap({ key: MAP_KEY });
    const tilesets = map.tilesets.map(tileset => {
      const added = map.addTilesetImage(tileset.name, textureOf(tileset.name));
      if (!added) throw new Error(`Missing tileset ${tileset.name}`);
      return added;
    });
    for (const [index, name] of TILE_LAYERS.entries()) {
      const layer = map.createLayer(name, tilesets);
      if (layer) this.#town.push(layer.setDepth(LAYER_DEPTH + index));
    }
    for (const object of map.getObjectLayer("foam")?.objects ?? []) this.spawn(scene, map, object, FOAM_DEPTH);
    for (const object of map.getObjectLayer("floor_decor")?.objects ?? []) this.spawn(scene, map, object, FLOOR_DECOR_DEPTH);
    // Buildings, trees and furniture sort by their bottom edge, as the Avatars sort by their feet,
    // so a Player walks behind a roof or a tree top and in front of its base.
    for (const object of map.getObjectLayer("objects")?.objects ?? []) this.spawn(scene, map, object, object.y ?? 0);

    // The Emergency Meeting button stands in the open middle of the Town Square.
    const button = scene.add.graphics();
    button.fillStyle(0x2c2c34).fillEllipse(0, 8, 58, 26);
    button.fillStyle(0x7a1f1f).fillEllipse(0, 0, 40, 22);
    button.fillStyle(0xd93b3b).fillEllipse(0, -4, 34, 16);
    button.fillStyle(0xff8a80, 0.8).fillEllipse(-6, -7, 10, 5);
    const hint = scene.add.text(0, 38, "Emergency Meeting · press F here", {
      fontFamily: "sans-serif", fontSize: "13px", color: "#fff0c9", stroke: "#2a2118", strokeThickness: 4
    }).setOrigin(0.5);
    this.#button = scene.add.container(BUTTON_X, BUTTON_Y, [button, hint]).setDepth(-1_000);

    this.#chairs = scene.add.container(0, 0).setDepth(-999);
    for (let seat = 0; seat < ROOM_CAPACITY; seat++) {
      const { x, y } = meetingSeat(seat);
      const chair = scene.add.graphics();
      chair.fillStyle(0x372822, 0.45).fillRect(-24, -16, 52, 47);
      chair.fillStyle(0x352820).fillRect(-21, -24, 42, 48);
      chair.fillStyle(0xa57545).fillRect(-17, -20, 34, 38);
      chair.fillStyle(0xcc995b).fillRect(-14, -17, 28, 4);
      chair.fillStyle(0x5a4030).fillRect(-14, -9, 28, 22);
      chair.fillStyle(0x82907b).fillRect(-11, -7, 22, 17);
      // The back sits outside the circle; the open front points inward.
      chair.fillStyle(0x372820).fillRect(-23, -30, 46, 12);
      chair.fillStyle(0xc39358).fillRect(-19, -28, 38, 6);
      chair.fillStyle(0x4a3227).fillRect(-20, 17, 7, 12).fillRect(13, 17, 7, 12);
      chair.setPosition(x, y - 3).setRotation(seat * 2 * Math.PI / ROOM_CAPACITY);
      this.#chairs.add(chair);
    }
    this.setVisible(false, false);
  }

  /** One Tiled tile object as a sprite, playing its tileset's animation if it has one. */
  private spawn(scene: Phaser.Scene, map: Phaser.Tilemaps.Tilemap, object: Phaser.Types.Tilemaps.TiledObject, depth: number): void {
    const gid = object.gid;
    if (gid === undefined) return;
    const tileset = map.tilesets.find(candidate => gid >= candidate.firstgid && gid < candidate.firstgid + candidate.total);
    if (!tileset) return;
    const key = textureOf(tileset.name);
    const sprite = scene.add.sprite(object.x ?? 0, object.y ?? 0, key, gid - tileset.firstgid)
      .setOrigin(0, 1).setDepth(depth).setFlip(Boolean(object.flippedHorizontal), Boolean(object.flippedVertical));
    if (object.width && object.height) sprite.setDisplaySize(object.width, object.height);
    const frames = (tileset.tileData as Record<number, { animation?: { tileid: number; duration: number }[] }>)[0]?.animation;
    if (frames && frames.length > 1) {
      const animation = `${key}-loop`;
      if (!scene.anims.exists(animation)) {
        scene.anims.create({
          key: animation, repeat: -1,
          frames: frames.map(frame => ({ key, frame: frame.tileid, duration: frame.duration }))
        });
      }
      // Each sheep, tree and wave starts at its own frame, so the town does not sway in step.
      sprite.play({ key: animation, startFrame: Math.floor(Math.random() * frames.length) });
    }
    this.#town.push(sprite);
  }

  /** The town shows while in a Room; the chairs only while the Players are seated. */
  setVisible(visible: boolean, seated: boolean): void {
    for (const part of this.#town) (part as unknown as Phaser.GameObjects.Components.Visible).setVisible(visible);
    this.#button.setVisible(visible);
    this.#chairs.setVisible(visible && seated);
  }
}
