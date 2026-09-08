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
    type: "room_snapshot",
    selfPlayerId: "player-1",
    roomId: "plaza",
    players: [{ playerId: "player-1", displayName: "Alex", colour: "#4F8CFF", avatarPreset: "townsperson-1", x: 640, y: 360 }]
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
    playerId: "player-2", displayName: "Sam", colour: "#FF8066", avatarPreset: "townsperson-2", x: 640, y: 360
  }});
  inbox.enqueue({ version: 1, type: "player_moved", playerId: "player-2", x: 650, y: 360 });
  inbox.enqueue({ version: 1, type: "player_left", playerId: "player-2", reason: "left" });

  boundary.beginFrame();

  assert.equal(boundary.world.players.has("player-2"), false);
  assert.equal(reconciled.length, 1);
});
