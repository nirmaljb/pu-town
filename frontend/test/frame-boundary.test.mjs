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
    type: "room_snapshot", phase: "playing", hostPlayerId: "p",
    selfPlayerId: "player-1",
    roomId: "plaza",
    players: [{ playerId: "player-1", displayName: "Alex", colour: "#4F8CFF", avatarPreset: "townsperson-1", seat: null, ready: false, x: 640, y: 360 }]
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
    playerId: "player-2", displayName: "Sam", colour: "#FF8066", avatarPreset: "townsperson-2", seat: null, ready: false, x: 640, y: 360
  }});
  inbox.enqueue({ version: 1, type: "player_moved", playerId: "player-2", x: 650, y: 360 });
  inbox.enqueue({ version: 1, type: "player_left", playerId: "player-2", reason: "left" });

  boundary.beginFrame();

  assert.equal(boundary.world.players.has("player-2"), false);
  assert.equal(reconciled.length, 1);
});

test("Lobby seats, readiness, Host succession and Start apply in order at frame boundaries", () => {
  const inbox = new NetworkInbox();
  const views = [];
  const boundary = new NetworkFrameBoundary(inbox, emptyWorld(), { reconcile(world) { views.push(world); } });
  const host = { playerId: "h", displayName: "Alex", colour: "#4F8CFF", avatarPreset: "townsperson-1", seat: 0, ready: false, x: 640, y: 177 };
  const guest = { ...host, playerId: "g", colour: "#FF8066", seat: 1, x: 869, y: 216 };
  inbox.enqueue({ version: 1, type: "room_snapshot", roomId: "ABC234", selfPlayerId: "g", phase: "lobby", hostPlayerId: "h", players: [host, guest] });
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
