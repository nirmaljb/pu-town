import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeServerMessage } from '../dist/protocol.js';
import { NetworkInbox } from '../dist/network-inbox.js';
import { NetworkFrameBoundary } from '../dist/network-frame-boundary.js';
import { emptyWorld } from '../dist/world-state.js';
const status = { version: 1, type: 'developer_status', controllerId: 'controller', paused: true,
  nightMovement: false, taskRange: true, scenario: 'four_roles', revision: 1, simulatedPlayerIds: ['sim'] };
const inspector = { version: 1, type: 'developer_state', settings: { automatic: true, factionVictory: true, taskVictory: true, taskRange: true, taskDuration: true, nightMovement: false },
  players: [{ playerId: 'sim', displayName: 'Doctor', role: 'doctor', status: 'living', simulated: true, x: 10, y: 20, nightChoice: null, voted: false, vote: null,
    tasks: [{ playerId: 'sim', taskId: 'task', location: 0, currentLocation: 0, kind: 'repair', steps: 2, durationMs: 5000, step: 1, fake: false }] }], locations: [{ name: 'Ledger', x: 10, y: 20 }] };
test('developer inspector and public status decode exact independent schemas', () => {
  assert.deepEqual(decodeServerMessage(JSON.stringify(status)), status);
  assert.deepEqual(decodeServerMessage(JSON.stringify(inspector)), inspector);
  for (const invalid of [{ ...status, role: 'mafia' }, { ...status, paused: 'true' }, { ...inspector, settings: { ...inspector.settings, unknown: false } },
    { ...inspector, players: [{ ...inspector.players[0], tasks: [{ ...inspector.players[0].tasks[0], step: 3 }] }] }]) assert.throws(() => decodeServerMessage(JSON.stringify(invalid)));
});
test('developer inspection applies at frames only for the controller, and Lobby clears Game interactions', () => {
  const inbox = new NetworkInbox();
  const boundary = new NetworkFrameBoundary(inbox, { ...emptyWorld(), selfPlayerId: 'controller' }, { reconcile() {} });
  inbox.enqueue(status); inbox.enqueue(inspector);
  assert.equal(boundary.world.inspector, null);
  boundary.beginFrame(); assert.equal(boundary.world.inspector.players[0].role, 'doctor');
  inbox.enqueue({ ...status, controllerId: 'other' }); inbox.enqueue(inspector);
  boundary.beginFrame(); assert.equal(boundary.world.inspector, null);
  inbox.enqueue({ version: 1, type: 'room_state', phase: 'lobby', hostPlayerId: 'controller', roleSetup: { mafia: 1, doctors: 1, sheriffs: 1 }, mapId: 'village', players: [] });
  boundary.beginFrame(); assert.equal(boundary.world.game, null); assert.equal(boundary.world.tasks, null);
});
