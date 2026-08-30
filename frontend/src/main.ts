import Phaser from "phaser";
import { PuTownScene } from "./pu-town-scene.js";
import "./style.css";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 1_280,
  height: 720,
  scene: [PuTownScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
});
