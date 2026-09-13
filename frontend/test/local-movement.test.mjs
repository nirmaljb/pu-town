import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalMovement } from '../dist/local-movement.js';
const spawn = { x: 640, y: 360, facing: 'down', sequence: 0, epoch: 0 };
test('older acknowledgments do not rewind newer unsent prediction or final Facing', () => {
  const movement = new LocalMovement(spawn);
  movement.advance(1, 0, 50);
  const sent = movement.submission();
  movement.advance(0, -1, 25);
  movement.accept({ ...sent, type: 'player_moved' });
  assert.equal(movement.x, 652);
  assert.equal(movement.y, 354);
  assert.equal(movement.facing, 'up');
  assert.equal(movement.submission().sequence, 2);
});
test('a correction discards outstanding prediction once and preserves input Facing', () => {
  const movement = new LocalMovement(spawn);
  movement.advance(1, 0, 50);
  movement.submission();
  movement.advance(0, -1, 50);
  const outstanding = movement.submission();
  movement.accept({ ...spawn, type: 'movement_correction', sequence: 1, epoch: 1 });
  assert.equal(movement.x, 640);
  assert.equal(movement.y, 360);
  assert.equal(movement.facing, 'up');
  movement.advance(-1, 0, 50);
  movement.accept({ ...outstanding, type: 'player_moved' });
  movement.accept({ ...spawn, type: 'movement_correction', epoch: 1, sequence: 2 });
  assert.equal(movement.x, 628);
  assert.deepEqual(movement.submission(), { x: 628, y: 360, facing: 'left', epoch: 1, sequence: 3 });
});
test('blocked input retains Facing at all boundaries and diagonal input prefers vertical', () => {
  for (const [x, y, horizontal, vertical, facing] of [[0, 360, -1, 0, 'left'], [1280, 360, 1, 0, 'right'], [640, 0, 0, -1, 'up'], [640, 720, 0, 1, 'down']]) {
    const movement = new LocalMovement({ ...spawn, facing: 'right', x, y });
    movement.advance(horizontal, vertical, 16);
    assert.equal(movement.x, x);
    assert.equal(movement.y, y);
    assert.equal(movement.facing, facing);
    movement.advance(0, 0, 16);
    assert.equal(movement.facing, facing);
  }
  const movement = new LocalMovement(spawn);
  movement.advance(1, -1, 16);
  assert.equal(movement.facing, 'up');
});

test('a stalled frame cannot turn background time into catch-up movement', () => {
  const movement = new LocalMovement(spawn);
  movement.advance(1, 0, 30_000);
  assert.equal(movement.x, 652);
});
