import Phaser from "phaser";
import { PuTownScene } from "./pu-town-scene.js";
import { ROOM_HEIGHT, ROOM_WIDTH } from "./room-rules.js";
import "./style.css";

new Phaser.Game({
  type: Phaser.AUTO,
  pixelArt: true,
  parent: "game",
  width: ROOM_WIDTH,
  height: ROOM_HEIGHT,
  scene: [PuTownScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
});
