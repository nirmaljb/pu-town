import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { FieldController } from "../dist/field-controller.js";
import { BUTTON_X, BUTTON_Y, OBSTACLES, WORLD_HEIGHT, WORLD_WIDTH, walkable } from "../dist/room-rules.js";

const own = (patch = {}) => ({
  x: 1280, y: 900, facing: "down", correction: 1, crowding: null, primaryCooldownMs: null,
  vanishCooldownMs: null, vanishedMs: null, shieldTargetPlayerId: null, shieldMs: null, emergencyAvailable: true, ...patch
});
const world = (self, round = 1, phase = "roam") => ({
  game: { phase, round }, field: { round, players: [], bodies: [], self }
});
const idle = { up: false, down: false, left: false, right: false };

test("walking starts from the server's position and sends throttled steps", () => {
  const sent = [];
  const controller = new FieldController((x, y, facing) => sent.push({ x, y, facing }));
  controller.update(world(own()), { ...idle, right: true }, 100, 1_000);
  assert.ok(controller.position.x > 1280);
  assert.equal(controller.position.facing, "right");
  assert.equal(sent.length, 1);
  controller.update(world(own()), { ...idle, right: true }, 16, 1_016);
  assert.equal(sent.length, 1, "steps are throttled");
  controller.update(world(own()), idle, 16, 1_100);
  assert.equal(sent.length, 2, "the final resting position is always sent");
  assert.equal(controller.position.moving, false);
});

test("a server correction or a new Roam replaces the local position", () => {
  const controller = new FieldController(() => {});
  controller.update(world(own()), { ...idle, up: true }, 100, 0);
  controller.update(world(own({ x: 1000, y: 800, correction: 2 })), idle, 16, 100);
  assert.deepEqual([controller.position.x, controller.position.y], [1000, 800]);
  controller.update(world(own({ x: 950, y: 800, correction: 2 }), 2), idle, 16, 200);
  assert.equal(controller.position.x, 950);
  controller.update(world(own(), 2, "discussion"), idle, 16, 300);
  assert.equal(controller.position, null, "nobody walks outside a Roam");
});

test("walls stop movement on their own axis only", () => {
  // The Town Hall's front wall ends at y 512, so a Player just below it can only slide.
  const controller = new FieldController(() => {});
  controller.update(world(own({ x: 1280, y: 530 })), { ...idle, up: true, right: true }, 100, 0);
  assert.ok(controller.position.x > 1280, "slides along the wall");
  assert.equal(controller.position.y, 530);
  assert.ok(walkable(controller.position.x, controller.position.y));
  assert.equal(walkable(1280, 500), false);
});

test("the client's collision copy is the map's own collision layer", () => {
  const map = JSON.parse(readFileSync(new URL("../public/maps/pu-town/pu-town.collision.json", import.meta.url), "utf8"));
  assert.deepEqual(OBSTACLES, map.obstacles);
  assert.deepEqual([WORLD_WIDTH, WORLD_HEIGHT], [map.world.width, map.world.height]);
  assert.deepEqual([BUTTON_X, BUTTON_Y], [map.emergencyButton.x, map.emergencyButton.y]);
});
