import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeServerMessage } from '../dist/protocol.js';

test('town selection uses known map identifiers and structural Room state decodes strictly', async () => {
  const { selectMap } = await import('../dist/protocol.js');
  assert.deepEqual(selectMap('horror'), { version: 1, type: 'select_map', mapId: 'horror' });
  assert.throws(() => selectMap('../unknown'));
  const state = { version: 1, type: 'room_state', phase: 'lobby', hostPlayerId: 'p',
    roleSetup: { mafia: 1, doctors: 1, sheriffs: 1 }, mapId: 'cyberpunk', players: [] };
  assert.deepEqual(decodeServerMessage(JSON.stringify(state)), state);
  assert.deepEqual(decodeServerMessage(JSON.stringify({ ...state, mapId: 'campus' })), { ...state, mapId: 'campus' });
  for (const mapId of [undefined, null, 'unknown', 1])
    assert.throws(() => decodeServerMessage(JSON.stringify({ ...state, mapId })));
  assert.throws(() => decodeServerMessage(JSON.stringify({ ...state, extra: true })));
});
