import Phaser from "phaser";
import type { Direction } from "./avatar-motion.js";
import type { AvatarPreset } from "./avatar-presets.js";
import { SEATED_PALETTE } from "./seated-palette.js";

/** Pixel-drawn knees, shins and shoes join the unchanged LPC upper-body artwork. */
export function drawSeatedLegs(
  graphics: Phaser.GameObjects.Graphics, preset: AvatarPreset, facing: Direction, lowering: number
): void {
  const palette = SEATED_PALETTE[preset].map(colour => Number.parseInt(colour.slice(1), 16));
  const hip = -14 + lowering;
  graphics.clear();
  const rect = (colour: number, x: number, y: number, width: number, height: number) => {
    graphics.fillStyle(colour).fillRect(x, y, width, height);
  };
  if (facing === "left" || facing === "right") {
    // A horizontal thigh and vertical shin form an actual bent knee in profile.
    graphics.setScale(facing === "right" ? -1 : 1, 1);
    rect(palette[0]!, -17, hip, 25, 8);
    rect(palette[2]!, -15, hip + 1, 21, 5);
    rect(palette[3]!, -14, hip + 1, 17, 2);
    rect(palette[0]!, -17, hip + 4, 8, 14 - hip);
    rect(palette[2]!, -15, hip + 5, 5, 10 - hip);
    rect(0x080a0a, -21, 10, 12, 5);
    rect(0x2a3034, -19, 10, 9, 2);
    // Far shoe is offset behind the near leg.
    rect(0x101414, -8, 8, 8, 4);
  } else {
    graphics.setScale(1);
    rect(palette[0]!, -11, hip, 22, 8);
    for (const x of [-11, 3]) {
      rect(palette[2]!, x + 1, hip + 1, 7, 6);
      rect(palette[4]!, x + 2, hip + 2, 5, 2);
      rect(palette[0]!, x + 1, hip + 6, 7, 7 - hip);
      rect(palette[2]!, x + 2, hip + 6, 4, 5 - hip);
      rect(0x080a0a, x, 11, 9, 5);
      rect(0x2a3034, x + 1, 11, 6, 2);
    }
  }
}
