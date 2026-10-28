import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { mapLights } from "../dist/map-lights.js";
import { BUTTON_X, BUTTON_Y, walkable } from "../dist/room-rules.js";

const root = new URL("../public/maps/pu-town/", import.meta.url);
const map = JSON.parse(readFileSync(new URL("pu-town.json", root), "utf8"));
const FLIPS = 0xe0000000;
const tilesetOf = gid => map.tilesets.find(t => gid >= t.firstgid && gid < t.firstgid + t.tilecount);

test("every tileset the map names is served", () => {
  for (const tileset of map.tilesets) {
    assert.ok(existsSync(new URL(tileset.image, root)), `${tileset.name}: ${tileset.image}`);
  }
});

test("every tile and object belongs to a tileset, and every animation frame exists", () => {
  for (const layer of map.layers) {
    const gids = layer.type === "tilelayer" ? layer.data.filter(Boolean) : (layer.objects ?? []).map(o => o.gid).filter(Boolean);
    for (const raw of gids) assert.ok(tilesetOf((raw & ~FLIPS) >>> 0), `${layer.name}: gid ${raw}`);
  }
  for (const tileset of map.tilesets) {
    for (const tile of tileset.tiles ?? []) {
      for (const frame of tile.animation ?? []) assert.ok(frame.tileid < tileset.tilecount, `${tileset.name} frame ${frame.tileid}`);
    }
  }
});

test("the night has lights, and the Town Square is lit for the Meetings", () => {
  const lights = mapLights(map.layers.find(l => l.name === "lights").objects);
  assert.ok(lights.length >= 20);
  for (const light of lights) {
    assert.ok(light.radius > 0 && Number.isInteger(light.color) && light.color >= 0 && light.color <= 0xffffff);
  }
  assert.ok(lights.some(l => Math.hypot(l.x - BUTTON_X, l.y - BUTTON_Y) < 60 && l.radius >= 200));
});

test("Tiled's property lists and plain records read the same", () => {
  const [fromList] = mapLights([{ x: 4, y: 5, properties: [{ name: "radius", value: 90 }, { name: "color", value: "#ff8a3d" }, { name: "flicker", value: 1 }] }]);
  const [fromRecord] = mapLights([{ x: 4, y: 5, properties: { radius: 90, color: "#ff8a3d", flicker: 1 } }]);
  assert.deepEqual(fromList, { x: 4, y: 5, radius: 90, color: 0xff8a3d, flicker: true });
  assert.deepEqual(fromRecord, fromList);
});

test("every spawn, task spot and the button stand on open ground", () => {
  const collision = JSON.parse(readFileSync(new URL("pu-town.collision.json", root), "utf8"));
  for (const point of [...collision.spawns, ...collision.tasks]) assert.ok(walkable(point.x, point.y), JSON.stringify(point));
  assert.ok(walkable(BUTTON_X, BUTTON_Y + 50));
});
