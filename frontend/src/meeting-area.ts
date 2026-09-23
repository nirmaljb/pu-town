import Phaser from "phaser";
import { seatFacing, type Direction } from "./avatar-facing.js";
import { HALL_X, HALL_Y, OBSTACLES, WORLD_HEIGHT, WORLD_WIDTH } from "./room-rules.js";

export const ROOM_CAPACITY = 10;

/** Seat zero is north; clockwise geometry mirrors authoritative RoomRules, in town coordinates. */
export function meetingSeat(seat: number): { x: number; y: number; facing: Direction } {
  return {
    x: HALL_X + Math.round(640 + 390 * Math.sin(seat * 2 * Math.PI / ROOM_CAPACITY)),
    y: HALL_Y + Math.round(382 - 205 * Math.cos(seat * 2 * Math.PI / ROOM_CAPACITY)),
    facing: seatFacing(seat)
  };
}

/** The town the Players roam, with the Town Hall and its Meeting Area at its centre. */
export class MeetingArea {
  readonly #container: Phaser.GameObjects.Container;
  readonly #town: Phaser.GameObjects.Graphics;
  readonly #canopies: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.#town = drawTown(scene);
    this.#canopies = drawCanopies(scene);
    const floor = scene.add.graphics();
    floor.fillStyle(0x493126).fillRect(66, 72, 1148, 610);
    // Staggered plank joints and small grain marks keep the floor pixel aligned.
    for (let row = 0; row < 18; row++) {
      for (let col = 0; col < 9; col++) {
        const x = 80 + col * 140 - (row % 2) * 70;
        const y = 92 + row * 32;
        const left = Math.max(80, x);
        const right = Math.min(1200, x + 138);
        if (left >= right) continue;
        floor.fillStyle([0x92613c, 0x875936, 0x9b6941][(row + col) % 3]!).fillRect(left, y, right - left, 30);
        floor.fillStyle(0xb7804c, 0.6).fillRect(left + 3, y + 2, right - left - 6, 2);
        floor.fillStyle(0x6e482e, 0.55).fillRect(left + 12, y + 20, Math.min(40, right - left - 14), 2);
      }
    }
    floor.fillStyle(0x382921).fillRect(64, 66, 1152, 28);
    floor.fillStyle(0xc59559).fillRect(76, 64, 1128, 6);
    for (const x of [68, 1186]) {
      floor.fillStyle(0x3f2b25).fillRect(x, 80, 26, 582);
      floor.fillStyle(0xb27a45).fillRect(x + 4, 80, 5, 580);
    }
    // An unoccupied woven rug defines the centre of the circle.
    floor.fillStyle(0x624234).fillRect(432, 278, 416, 204);
    floor.fillStyle(0xb68c56).fillRect(440, 286, 400, 188);
    floor.fillStyle(0x425951).fillRect(450, 296, 380, 168);
    floor.lineStyle(3, 0x98a081).strokeRect(460, 306, 360, 148);
    for (let x = 444; x < 840; x += 12) {
      floor.fillStyle(0xd4ad70).fillRect(x, 280, 4, 8).fillRect(x, 474, 4, 8);
    }
    // Two wall lanterns frame the gathering.
    for (const x of [330, 950]) {
      floor.fillStyle(0x3c2925).fillRect(x - 12, 82, 24, 36);
      floor.fillStyle(0xefbd72).fillRect(x - 8, 87, 16, 22);
      floor.fillStyle(0xffe1a0).fillRect(x - 4, 90, 8, 14);
    }
    const title = scene.add.text(640, 332, "Town Hall", {
      fontFamily: '"Courier New", monospace', fontStyle: "bold", fontSize: "25px",
      color: "#fff0c9", stroke: "#382921", strokeThickness: 5
    }).setOrigin(0.5);
    // The Emergency Meeting button stands at the centre of the rug.
    const button = scene.add.graphics();
    button.fillStyle(0x2c2c34).fillEllipse(640, 390, 58, 26);
    button.fillStyle(0x7a1f1f).fillEllipse(640, 382, 40, 22);
    button.fillStyle(0xd93b3b).fillEllipse(640, 378, 34, 16);
    button.fillStyle(0xff8a80, 0.8).fillEllipse(634, 375, 10, 5);
    const hint = scene.add.text(640, 420, "Emergency Meeting · press F here", {
      fontFamily: "sans-serif", fontSize: "13px", color: "#d7ddc7"
    }).setOrigin(0.5);
    this.#container = scene.add.container(HALL_X, HALL_Y, [floor, title, button, hint]).setDepth(-1000);
    for (let seat = 0; seat < ROOM_CAPACITY; seat++) {
      const world = meetingSeat(seat);
      const x = world.x - HALL_X;
      const y = world.y - HALL_Y;
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
      this.#container.add(chair);
    }
    this.setVisible(false);
  }

  setVisible(visible: boolean): void {
    this.#container.setVisible(visible);
    this.#town.setVisible(visible);
    this.#canopies.setVisible(visible);
  }
}

function drawTown(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const town = scene.add.graphics().setDepth(-1100);
  town.fillStyle(0x4f7d3e).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  // Deterministic grass tufts, so every client draws the same town.
  for (let index = 0; index < 900; index++) {
    const x = (index * 7919) % WORLD_WIDTH;
    const y = (index * 104729) % WORLD_HEIGHT;
    town.fillStyle(index % 3 === 0 ? 0x5f9149 : 0x43703a).fillRect(x, y, 6, 3);
  }
  // Dirt roads: one leaves the open south side of the Town Hall, one crosses the town.
  town.fillStyle(0xa98a5c).fillRect(1180, 1040, 200, WORLD_HEIGHT - 1040);
  town.fillStyle(0xa98a5c).fillRect(0, 1110, WORLD_WIDTH, 70);
  town.fillStyle(0xa98a5c).fillRect(560, 0, 70, WORLD_HEIGHT);
  town.fillStyle(0xa98a5c).fillRect(1930, 0, 70, WORLD_HEIGHT);
  town.fillStyle(0xa98a5c).fillRect(0, 440, WORLD_WIDTH, 60);
  for (const obstacle of OBSTACLES) {
    const { x, y, width, height } = obstacle;
    if (obstacle.kind === "house") {
      town.fillStyle(0x2d2420).fillRect(x - 4, y + 8, width + 8, height);
      town.fillStyle(0xcdb58a).fillRect(x, y + height * 0.45, width, height * 0.55);
      town.fillStyle(0x8b3a2e).fillRect(x - 10, y, width + 20, height * 0.5);
      town.fillStyle(0xa84a3a).fillRect(x - 10, y, width + 20, 10);
      town.fillStyle(0x5a3a26).fillRect(x + width / 2 - 20, y + height - 56, 40, 56);
      town.fillStyle(0x9fd3e6).fillRect(x + 40, y + height - 70, 44, 32).fillRect(x + width - 84, y + height - 70, 44, 32);
    } else if (obstacle.kind === "shed") {
      town.fillStyle(0x6b4a2e).fillRect(x, y, width, height);
      town.fillStyle(0x7f5a38).fillRect(x + 8, y + 8, width - 16, height - 16);
      for (let plank = x + 20; plank < x + width - 10; plank += 26) town.fillStyle(0x5b3e26).fillRect(plank, y + 8, 3, height - 16);
    } else if (obstacle.kind === "stall") {
      town.fillStyle(0x6d4c30).fillRect(x, y + 30, width, height - 30);
      for (let stripe = 0; stripe < width; stripe += 28) {
        town.fillStyle(stripe % 56 === 0 ? 0xe6d3a3 : 0xc0443a).fillRect(x + stripe, y, Math.min(28, width - stripe), 34);
      }
      town.fillStyle(0xe0a040).fillCircle(x + 50, y + 70, 12).fillCircle(x + 110, y + 72, 12).fillCircle(x + 170, y + 68, 12);
    } else if (obstacle.kind === "tree") {
      town.fillStyle(0x5a3a22).fillRect(x + 16, y + 8, 16, 40);
    }
  }
  return town;
}

/** Tree canopies are drawn above the Avatars, so walking under one hides you from sight. */
function drawCanopies(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const canopies = scene.add.graphics().setDepth(5_000);
  for (const obstacle of OBSTACLES) {
    if (obstacle.kind !== "tree") continue;
    const x = obstacle.x + obstacle.width / 2;
    const y = obstacle.y;
    canopies.fillStyle(0x2f5a2a, 0.95).fillCircle(x, y, 62);
    canopies.fillStyle(0x3d7336, 0.95).fillCircle(x - 14, y - 12, 44);
    canopies.fillStyle(0x4f8a42, 0.9).fillCircle(x - 22, y - 22, 20);
  }
  return canopies;
}
