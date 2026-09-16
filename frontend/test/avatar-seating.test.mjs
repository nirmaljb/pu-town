import test from 'node:test';
import assert from 'node:assert/strict';
import { AvatarSeating, SIT_DURATION_MS } from '../dist/avatar-seating.js';
import { NetworkFrameBoundary } from '../dist/network-frame-boundary.js';
import { NetworkInbox } from '../dist/network-inbox.js';
import { emptyWorld } from '../dist/world-state.js';

const player = (id, seat) => ({ playerId: id, displayName: id, colour: '#4F8CFF', avatarPreset: 'townsperson-1',
  seat, ready: false, facing: 'down', x: 640, y: 177, sequence: 0, epoch: 0 });

function lobby() {
  const inbox = new NetworkInbox();
  const poses = new Map();
  let time = 0;
  const boundary = new NetworkFrameBoundary(inbox, emptyWorld(), {
    reconcile(world, arrivals = new Set()) {
      for (const id of poses.keys()) if (!world.players.has(id)) poses.delete(id);
      for (const p of world.players.values()) {
        const pose = poses.get(p.playerId) ?? new AvatarSeating();
        pose.reconcile(world.phase === 'lobby' ? p.seat : null, arrivals.has(p.playerId), time);
        poses.set(p.playerId, pose);
      }
    }
  });
  return { poses, boundary, frame(events, at) {
    time = at;
    events.forEach(event => inbox.enqueue({ version: 1, ...event }));
    boundary.beginFrame();
  }};
}
const snapshot = (self = 'self', players = [player('host', 0), player(self, 1)]) => ({
  type: 'room_snapshot', roomId: 'ABC234', selfPlayerId: self, hostPlayerId: 'host', phase: 'lobby', players
});

test('snapshot occupants are seated; self and a subsequent arrival in the same frame sit down', () => {
  const l = lobby();
  l.frame([snapshot(), { type: 'player_joined', player: player('later', 2) }], 100);
  assert.equal(l.poses.get('host').progress(100), 1);
  for (const id of ['self', 'later']) {
    assert.equal(l.poses.get(id).progress(100), 0);
    assert.equal(l.poses.get(id).progress(100 + SIT_DURATION_MS / 2), 0.5);
    assert.equal(l.poses.get(id).progress(100 + SIT_DURATION_MS), 1);
  }
});

test('readiness, Host changes and repeated snapshots never restart sitting', () => {
  const l = lobby();
  l.frame([snapshot()], 0);
  l.frame([{ type: 'room_state', phase: 'lobby', hostPlayerId: 'self',
    players: [player('host', 0), { ...player('self', 1), ready: true }] }], 100);
  assert.equal(l.poses.get('self').progress(210), 0.5);
  l.frame([snapshot()], 300);
  assert.equal(l.poses.get('self').progress(420), 1);
  l.frame([{ type: 'player_joined', player: player('self', 1) }], 500);
  assert.equal(l.poses.get('self').progress(500), 1);
});

test('Start cancels unfinished sitting, including Join and Start in one frame', () => {
  const start = { type: 'room_state', phase: 'playing', hostPlayerId: 'host',
    players: [player('host', null), player('self', null)] };
  const l = lobby();
  l.frame([snapshot()], 0);
  l.frame([start], 100);
  assert.equal(l.poses.get('self').progress(100), null);
  const batched = lobby();
  batched.frame([snapshot(), start], 0);
  assert.equal(batched.poses.get('self').progress(0), null);
});

test('Leave destroys pending seating and reconnect animates only the new membership', () => {
  const l = lobby();
  l.frame([snapshot()], 0);
  l.frame([{ type: 'player_left', playerId: 'self', reason: 'disconnected' }], 100);
  assert.equal(l.poses.has('self'), false);
  l.frame([snapshot('reconnected')], 150);
  assert.equal(l.poses.get('reconnected').progress(150), 0);
  assert.equal(l.poses.get('host').progress(150), 1);
  l.boundary.reset();
  assert.equal(l.poses.size, 0);
});

test('a delayed frame settles sitting without a repeated transition', () => {
  const pose = new AvatarSeating();
  pose.reconcile(0, true, 100);
  assert.equal(pose.progress(30_000), 1);
  pose.reconcile(0, false, 30_100);
  assert.equal(pose.progress(30_100), 1);
});

test('changing appearance while seated preserves sit progress and Start restores standing', () => {
  const l = lobby();
  l.frame([snapshot()], 0);
  l.frame([{ type: 'room_state', phase: 'lobby', hostPlayerId: 'host',
    players: [player('host', 0), { ...player('self', 1), avatarPreset: 'townsperson-10', ready: true }] }], 100);
  assert.equal(l.poses.get('self').progress(210), 0.5);
  l.frame([{ type: 'room_state', phase: 'lobby', hostPlayerId: 'host',
    players: [player('host', 0), { ...player('self', 1), avatarPreset: 'townsperson-9', ready: true }] }], 500);
  assert.equal(l.poses.get('self').progress(500), 1);
  l.frame([{ type: 'room_state', phase: 'playing', hostPlayerId: 'host',
    players: [{ ...player('self', null), avatarPreset: 'townsperson-9' }] }], 550);
  assert.equal(l.poses.get('self').progress(550), null);
});
