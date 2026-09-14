import test from "node:test";
import assert from "node:assert/strict";

import { NetworkInbox } from "../dist/network-inbox.js";
import { NetworkFrameBoundary } from "../dist/network-frame-boundary.js";
import { emptyWorld } from "../dist/world-state.js";

test("network events affect the world only when a game frame begins", () => {
  const inbox = new NetworkInbox();
  const reconciled = [];
  const boundary = new NetworkFrameBoundary(inbox, emptyWorld(), {
    reconcile(world) { reconciled.push(world); }
  });

  inbox.enqueue({
    version: 1,
    type: "room_snapshot", recoveryToken: "a".repeat(64), phase: "playing", hostPlayerId: "p",
    selfPlayerId: "player-1",
    roomId: "plaza",
    players: [{ playerId: "player-1", displayName: "Alex", colour: "#4F8CFF", avatarPreset: "townsperson-1", connected: true, seat: null, ready: false, facing: "down", sequence: 0, epoch: 0, x: 640, y: 360 }]
  });

  assert.equal(boundary.world.players.size, 0);
  assert.equal(reconciled.length, 0);

  boundary.beginFrame();

  assert.equal(boundary.world.players.get("player-1").displayName, "Alex");
  assert.equal(reconciled.length, 1);
});

test("one frame drains queued events in transport order before reconciling once", () => {
  const inbox = new NetworkInbox();
  const reconciled = [];
  const boundary = new NetworkFrameBoundary(inbox, emptyWorld(), {
    reconcile(world) { reconciled.push(world); }
  });

  inbox.enqueue({ version: 1, type: "player_joined", player: {
    playerId: "player-2", displayName: "Sam", colour: "#FF8066", avatarPreset: "townsperson-2", connected: true, seat: null, ready: false, facing: "down", sequence: 0, epoch: 0, x: 640, y: 360
  }});
  inbox.enqueue({ version: 1, type: "player_moved", playerId: "player-2", facing: "down", sequence: 1, epoch: 0, x: 650, y: 360 });
  inbox.enqueue({ version: 1, type: "player_left", playerId: "player-2", reason: "left" });

  boundary.beginFrame();

  assert.equal(boundary.world.players.has("player-2"), false);
  assert.equal(reconciled.length, 1);
});

test("Lobby seats, readiness, Host succession and Start apply in order at frame boundaries", () => {
  const inbox = new NetworkInbox();
  const views = [];
  const boundary = new NetworkFrameBoundary(inbox, emptyWorld(), { reconcile(world) { views.push(world); } });
  const host = { playerId: "h", displayName: "Alex", colour: "#4F8CFF", avatarPreset: "townsperson-1", connected: true, seat: 0, ready: false, facing: "down", sequence: 0, epoch: 0, x: 640, y: 177 };
  const guest = { ...host, playerId: "g", colour: "#FF8066", seat: 1, x: 869, y: 216 };
  inbox.enqueue({ version: 1, type: "room_snapshot", recoveryToken: "a".repeat(64), roomId: "ABC234", selfPlayerId: "g", phase: "lobby", hostPlayerId: "h", players: [host, guest] });
  boundary.beginFrame();
  assert.equal(boundary.world.phase, "lobby");
  inbox.enqueue({ version: 1, type: "room_state", phase: "lobby", hostPlayerId: "h", players: [host, { ...guest, ready: true }] });
  inbox.enqueue({ version: 1, type: "player_left", playerId: "h", reason: "disconnected" });
  inbox.enqueue({ version: 1, type: "room_state", phase: "lobby", hostPlayerId: "g", players: [{ ...guest, ready: true }] });
  assert.equal(boundary.world.hostPlayerId, "h");
  assert.equal(boundary.world.players.get("g").ready, false);
  boundary.beginFrame();
  assert.equal(boundary.world.hostPlayerId, "g");
  assert.equal(boundary.world.players.get("g").seat, 1);
  assert.equal(boundary.world.players.get("g").ready, true);
  inbox.enqueue({ version: 1, type: "room_state", phase: "playing", hostPlayerId: "g", players: [{ ...guest, ready: true, seat: null, x: 640, y: 360 }] });
  boundary.beginFrame();
  assert.equal(boundary.world.phase, "playing");
  assert.equal(boundary.world.selfPlayerId, "g");
  assert.equal(boundary.world.players.get("g").x, 640);
  assert.equal(views.length, 3);
});

test('correction followed by structural state in the same frame cannot hide a prediction reset', () => {
  const inbox = new NetworkInbox();
  const boundary = new NetworkFrameBoundary(inbox, emptyWorld(), { reconcile() {} });
  const player = { playerId: 'p', displayName: 'A', colour: '#4F8CFF', avatarPreset: 'townsperson-1', seat: null, ready: false, x: 640, y: 360, facing: 'down', sequence: 0, epoch: 0 };
  inbox.enqueue({ version: 1, type: 'room_snapshot', selfPlayerId: 'p', roomId: 'ABC234', phase: 'playing', hostPlayerId: 'p', players: [player] });
  boundary.beginFrame();
  boundary.localMovement.advance(1, 0, 50);
  boundary.localMovement.submission();
  inbox.enqueue({ version: 1, type: 'movement_correction', playerId: 'p', x: 640, y: 360, facing: 'down', sequence: 1, epoch: 1 });
  inbox.enqueue({ version: 1, type: 'room_state', phase: 'playing', hostPlayerId: 'p', players: [{ ...player, sequence: 1, epoch: 1 }] });
  boundary.beginFrame();
  assert.equal(boundary.localMovement.x, 640);
  assert.equal(boundary.localMovement.facing, 'right');
});

test("disconnected presence stays in the world and recovery discards stale local prediction", () => {
  const inbox = new NetworkInbox();
  const boundary = new NetworkFrameBoundary(inbox, emptyWorld(), { reconcile() {} });
  const player = { playerId: "p", displayName: "Alex", colour: "#4F8CFF", avatarPreset: "townsperson-1", connected: true, seat: null, ready: false, facing: "down", sequence: 7, epoch: 2, x: 640, y: 360 };
  const snapshot = { version: 1, type: "room_snapshot", recoveryToken: "a".repeat(64), roomId: "ABC234", selfPlayerId: "p", phase: "playing", hostPlayerId: "p", players: [player] };
  inbox.enqueue(snapshot); boundary.beginFrame();
  boundary.localMovement.advance(1, 0, 50);
  assert.equal(boundary.localMovement.x, 652);
  inbox.enqueue({ version: 1, type: "room_state", phase: "playing", hostPlayerId: "p", players: [{ ...player, connected: false }] });
  assert.equal(boundary.world.players.get("p").connected, true);
  boundary.beginFrame();
  assert.equal(boundary.world.players.size, 1);
  assert.equal(boundary.world.players.get("p").connected, false);
  inbox.enqueue(snapshot); boundary.beginFrame();
  assert.equal(boundary.localMovement.x, 640);
  assert.equal(boundary.localMovement.submission().sequence, 8);
  assert.equal(boundary.localMovement.submission().epoch, 2);
});
