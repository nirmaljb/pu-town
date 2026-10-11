import test from 'node:test';
import assert from 'node:assert/strict';
import { PhaseTransition } from '../dist/phase-transition.js';
const view = (phase, time, serial = 1) => ({ snapshotSerial: serial, phaseReceivedAt: time,
  game: { phase, round: phase === 'role_reveal' ? 0 : 1, self: { role: 'doctor' } } });
test('phase title fades for 350 ms, holds 800 ms and reveals over 350 ms without owning deadlines', () => {
  const transition = new PhaseTransition();
  assert.equal(transition.update(view('role_reveal', 100), 100, true, false).blocked, true);
  assert.equal(transition.update(view('role_reveal', 100), 450, true, false).opacity, 1);
  assert.equal(transition.update(view('role_reveal', 100), 450, true, false).role, 'doctor');
  assert.equal(transition.update(view('role_reveal', 100), 1249, true, false).opacity, 1);
  assert.equal(transition.update(view('role_reveal', 100), 1600, true, false).blocked, false);
  assert.equal(transition.update(view('night', 1700), 1700, true, false).blocked, true);
});
test('recovery, foregrounding and delayed frames skip stale transitions', () => {
  const transition = new PhaseTransition();
  assert.equal(transition.update(view('day', 100), 100, true, false).blocked, false);
  transition.update(view('night', 200), 200, true, false);
  assert.equal(transition.update(view('night', 200, 2), 300, true, false).blocked, false);
  transition.update(view('discussion', 400, 2), 400, false, false);
  assert.equal(transition.update(view('discussion', 400, 2), 500, true, false).blocked, false);
  assert.equal(transition.update(view('voting', 600, 2), 2600, true, false).blocked, false);
});
test('reduced motion uses a brief title card', () => {
  const transition = new PhaseTransition();
  assert.equal(transition.update(view('role_reveal', 0), 0, true, true).opacity, 1);
  assert.equal(transition.update(view('role_reveal', 0), 300, true, true).blocked, false);
});
