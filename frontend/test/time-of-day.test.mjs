import test from "node:test";
import assert from "node:assert/strict";

import { initialTimeOfDay, otherTimeOfDay, rememberTimeOfDay } from "../dist/time-of-day.js";

const memory = (value = null) => {
  const items = new Map(value === null ? [] : [["pu-town.time-of-day", value]]);
  return { getItem: key => items.get(key) ?? null, setItem: (key, v) => items.set(key, v), items };
};

test("the town starts by day unless this browser chose night", () => {
  assert.equal(initialTimeOfDay("", undefined), "day");
  assert.equal(initialTimeOfDay("", memory()), "day");
  assert.equal(initialTimeOfDay("", memory("night")), "night");
  assert.equal(initialTimeOfDay("", memory("dusk")), "day", "an unknown saved value is ignored");
});

test("the address can ask for a time of day, over the saved one", () => {
  assert.equal(initialTimeOfDay("?time=night", memory("day")), "night");
  assert.equal(initialTimeOfDay("?ws=ws://x:8080/ws/game&time=day", memory("night")), "day");
  assert.equal(initialTimeOfDay("?time=noon", memory("night")), "night");
});

test("the choice is remembered, and blocked storage is harmless", () => {
  const storage = memory();
  rememberTimeOfDay("night", storage);
  assert.equal(initialTimeOfDay("", storage), "night");
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.doesNotThrow(() => rememberTimeOfDay("night", blocked));
  assert.equal(initialTimeOfDay("", blocked), "day");
  assert.equal(otherTimeOfDay("day"), "night");
  assert.equal(otherTimeOfDay("night"), "day");
});
