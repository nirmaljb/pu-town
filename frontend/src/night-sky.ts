import Phaser from "phaser";
import type { MapLight } from "./map-lights.js";
import { ROOM_HEIGHT, ROOM_WIDTH, WORLD_HEIGHT, WORLD_WIDTH } from "./room-rules.js";

type Point = Readonly<{ x: number; y: number }>;

/** Above every Avatar and the town; beneath the Vision fog. */
const NIGHT_DEPTH = 5_000;
/** The blue the town is multiplied by where no light reaches. */
const NIGHT_SHADE = 0x4f5a92;
const LIGHT_TEXTURE = "night-light";
const LIGHT_SIZE = 256;
/** Every Avatar carries a small lantern so the Players and their names stay readable. */
const LANTERN_RADIUS = 105;
const OWN_LANTERN_RADIUS = 190;
const FIREFLIES = 70;

/** A soft round light, bright in the middle and gone at the rim. */
function createLightTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(LIGHT_TEXTURE)) return;
  const texture = scene.textures.createCanvas(LIGHT_TEXTURE, LIGHT_SIZE, LIGHT_SIZE);
  if (!texture) return;
  const context = texture.getContext();
  const half = LIGHT_SIZE / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.25, "rgba(255,255,255,0.72)");
  gradient.addColorStop(0.6, "rgba(255,255,255,0.22)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, LIGHT_SIZE, LIGHT_SIZE);
  texture.refresh();
  // The game draws pixel art without smoothing; a light must not show its texels.
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

/**
 * The town at night: a blue shade over the screen, lifted wherever a map light or an Avatar's
 * lantern shines, warm glows over the lamps and fires, and fireflies drifting over the grass.
 */
export class NightSky {
  readonly #shade: Phaser.GameObjects.RenderTexture;
  readonly #stamp: Phaser.GameObjects.Image;
  readonly #glows: { image: Phaser.GameObjects.Image; light: MapLight; phase: number }[] = [];
  readonly #fireflies: { image: Phaser.GameObjects.Image; x: number; y: number; phase: number; speed: number }[] = [];
  #night = false;
  #shown = false;

  constructor(scene: Phaser.Scene, private readonly lights: readonly MapLight[], fireflyGround: (x: number, y: number) => boolean) {
    createLightTexture(scene);
    this.#shade = scene.add.renderTexture(0, 0, ROOM_WIDTH, ROOM_HEIGHT)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(NIGHT_DEPTH).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.#stamp = scene.make.image({ key: LIGHT_TEXTURE, add: false });
    for (const light of lights) {
      const image = scene.add.image(light.x, light.y, LIGHT_TEXTURE)
        .setDepth(NIGHT_DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD).setTint(light.color)
        .setScale(light.radius * 1.1 / LIGHT_SIZE);
      this.#glows.push({ image, light, phase: Math.random() * 1_000 });
    }
    for (let tries = 0; this.#fireflies.length < FIREFLIES && tries < FIREFLIES * 40; tries++) {
      const x = 80 + Math.random() * (WORLD_WIDTH - 160);
      const y = 80 + Math.random() * (WORLD_HEIGHT - 160);
      if (!fireflyGround(x, y)) continue;
      const image = scene.add.image(x, y, LIGHT_TEXTURE)
        .setDepth(NIGHT_DEPTH + 2).setBlendMode(Phaser.BlendModes.ADD).setTint(0xd8ff8a).setScale(0.07);
      this.#fireflies.push({ image, x, y, phase: Math.random() * Math.PI * 2, speed: 0.4 + Math.random() * 0.6 });
    }
    this.apply();
  }

  /** Whether it is night for this viewer. */
  setNight(night: boolean): void {
    this.#night = night;
    this.apply();
  }

  /** Night only shows while the town itself does. */
  setShown(shown: boolean): void {
    if (shown === this.#shown) return;
    this.#shown = shown;
    this.apply();
  }

  private apply(): void {
    const visible = this.#night && this.#shown;
    this.#shade.setVisible(visible);
    for (const glow of this.#glows) glow.image.setVisible(visible);
    for (const fly of this.#fireflies) fly.image.setVisible(visible);
  }

  /** Redraws the shade for this frame's view; `own` is this Player's walking Avatar, if any. */
  update(time: number, camera: Phaser.Cameras.Scene2D.Camera, lanterns: readonly Point[], own: Point | null): void {
    if (!this.#night || !this.#shown) return;
    const view = camera.worldView;
    this.#shade.clear().fill(NIGHT_SHADE, 1);
    // A light lifts most of the shade, never all of it, so overlapping lamps stay night-time.
    const lift = (x: number, y: number, radius: number, strength: number) => {
      if (x + radius < view.x || x - radius > view.right || y + radius < view.y || y - radius > view.bottom) return;
      this.#stamp.setPosition(x - view.x, y - view.y).setScale(radius * 2 / LIGHT_SIZE).setAlpha(strength);
      this.#shade.erase(this.#stamp);
    };
    for (const light of this.lights) lift(light.x, light.y, light.radius * this.flicker(light, time), 0.8);
    for (const lantern of lanterns) lift(lantern.x, lantern.y - 24, LANTERN_RADIUS, 0.7);
    if (own) lift(own.x, own.y - 24, OWN_LANTERN_RADIUS, 0.75);

    for (const glow of this.#glows) {
      const f = this.flicker(glow.light, time + glow.phase);
      glow.image.setAlpha((glow.light.flicker ? 0.26 : 0.14) * f).setScale(glow.light.radius * 0.9 * f / LIGHT_SIZE);
    }
    for (const fly of this.#fireflies) {
      const t = time / 1_000 * fly.speed + fly.phase;
      fly.image.setPosition(fly.x + Math.sin(t * 0.9) * 26 + Math.sin(t * 2.3) * 6, fly.y + Math.cos(t * 0.7) * 18)
        .setAlpha(Math.max(0, Math.sin(t * 1.7)) * 0.9);
    }
  }

  /** Fires breathe; lamps hold steady. */
  private flicker(light: MapLight, time: number): number {
    if (!light.flicker) return 1;
    return 0.92 + 0.05 * Math.sin(time / 90 + light.x) + 0.03 * Math.sin(time / 37 + light.y);
  }
}
