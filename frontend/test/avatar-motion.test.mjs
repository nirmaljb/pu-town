import test from "node:test";
import assert from "node:assert/strict";
import { AvatarMotion, REMOTE_IDLE_DELAY_MS } from "../dist/avatar-motion.js";

test("local walking faces movement and stops immediately, retaining facing", () => {
  const motion = new AvatarMotion(640, 360);
  assert.equal(motion.walking, false);
  for (const [x, y, direction] of [[641,360,"right"], [640,360,"left"], [640,359,"up"], [640,360,"down"]]) {
    motion.update(x, y, 1, true);
    assert.equal(motion.direction, direction);
    assert.equal(motion.walking, true);
    motion.update(x, y, 2, true);
    assert.equal(motion.walking, false);
    assert.equal(motion.direction, direction);
  }
});

test("remote walking spans network gaps then returns to a standing frame", () => {
  const motion = new AvatarMotion(640, 360);
  motion.update(650, 360, 100, false);
  motion.update(650, 360, 100 + REMOTE_IDLE_DELAY_MS - 1, false);
  assert.equal(motion.walking, true);
  motion.update(650, 360, 100 + REMOTE_IDLE_DELAY_MS, false);
  assert.equal(motion.walking, false);
  assert.equal(motion.direction, "right");
});

test("diagonal movement has stable facing, and disconnect freezes animation", () => {
  const motion = new AvatarMotion(0, 0);
  motion.update(1, 1, 1, false);
  assert.equal(motion.direction, "down");
  motion.update(2, 2, 2, false, true);
  assert.equal(motion.walking, false);
  motion.update(2, 2, 3, false);
  assert.equal(motion.walking, false);
});
