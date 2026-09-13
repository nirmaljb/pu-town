import Phaser from "phaser";
import type { Direction } from "./avatar-motion.js";

export const ROOM_CAPACITY = 10;

/** Seat zero is north; clockwise geometry mirrors authoritative RoomRules. */
export function meetingSeat(seat: number): { x: number; y: number; facing: Direction } {
  return {
    x: Math.round(640 + 390 * Math.sin(seat * Math.PI / 5)),
    y: Math.round(382 - 205 * Math.cos(seat * Math.PI / 5)),
    facing: seat === 0 ? "down" : seat < 5 ? "left" : seat === 5 ? "up" : "right"
  };
}

/** The physical Meeting Area is independent of the Room's waiting-phase controls. */
export class MeetingArea {
  readonly #container: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    const floor = scene.add.graphics();
    floor.fillStyle(0x251e22).fillRect(0, 0, 1280, 720);
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
    const centre = scene.add.text(640, 366, "Meeting Area", {
      fontFamily: '"Courier New", monospace', fontSize: "20px", color: "#ece4bf"
    }).setOrigin(0.5);
    const hint = scene.add.text(640, 399, "Take a moment. Gather your people.", {
      fontFamily: "sans-serif", fontSize: "13px", color: "#d7ddc7"
    }).setOrigin(0.5);
    this.#container = scene.add.container(0, 0, [floor, title, centre, hint]).setDepth(-1000);
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
      chair.setPosition(x, y - 3).setRotation(seat * Math.PI / 5);
      this.#container.add(chair);
    }
    this.setVisible(false);
  }

  setVisible(visible: boolean): void { this.#container.setVisible(visible); }
}
