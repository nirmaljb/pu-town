import Phaser from "phaser";
import { PuTownScene } from "./pu-town-scene.js";
import { ROOM_HEIGHT, ROOM_WIDTH } from "./room-rules.js";
import "./style.css";
import "./game-skin.css";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  pixelArt: true,
  parent: "game",
  width: ROOM_WIDTH,
  height: ROOM_HEIGHT,
  scene: [PuTownScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
});


// Fill the available viewport; camera zoom preserves the town's intended visual scale.
const stage = document.getElementById("stage")!;
const resize = new ResizeObserver(() => {
  if (stage.clientWidth > 0 && stage.clientHeight > 0) game.scale.setParentSize(stage.clientWidth, stage.clientHeight);
});
resize.observe(stage);
game.events.once(Phaser.Core.Events.DESTROY, () => resize.disconnect());
