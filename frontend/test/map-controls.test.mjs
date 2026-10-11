import test from 'node:test';
import assert from 'node:assert/strict';

test('M toggles the map, Escape closes it, and typing or held repeats do not toggle', async () => {
  const { MapControls } = await import('../dist/map-controls.js');
  const controls = new MapControls();
  assert.equal(controls.handleKey('KeyM', true, false), false);
  assert.equal(controls.open, false);
  controls.setAvailable(true);
  assert.equal(controls.handleKey('KeyM', true, false), false);
  assert.equal(controls.handleKey('KeyM', false, true), false);
  assert.equal(controls.handleKey('KeyM', false, false), true);
  assert.equal(controls.open, true);
  controls.handleKey('KeyM', false, false);
  assert.equal(controls.open, false);
  controls.handleKey('KeyM', false, false);
  controls.handleKey('Escape', false, false);
  assert.equal(controls.open, false);
  controls.handleKey('KeyM', false, false);
  controls.setAvailable(false);
  assert.equal(controls.open, false);
  assert.equal(controls.handleKey('KeyM', false, false), false);
});
