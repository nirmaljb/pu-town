import test from "node:test";
import assert from "node:assert/strict";

import { decodeServerMessage } from "../dist/protocol.js";

test("the client accepts an explicit version 1 server message", () => {
  assert.deepEqual(decodeServerMessage(JSON.stringify({
    version: 1, type: "player_moved", playerId: "player-1", x: 12, y: 24
  })), {
    version: 1, type: "player_moved", playerId: "player-1", x: 12, y: 24
  });
});

test("the client rejects incompatible versions and fields from another message type", () => {
  assert.throws(() => decodeServerMessage(JSON.stringify({
    version: 2, type: "room_left", roomId: "plaza"
  })), /protocol version 1/);
  assert.throws(() => decodeServerMessage(JSON.stringify({
    version: 1, type: "room_left", roomId: "plaza", playerId: "smuggled"
  })), /fields/);
});

test("create, heartbeat and colour messages use strict schemas", async () => {
  const { createRoom, joinRoom } = await import("../dist/protocol.js");
  assert.deepEqual(createRoom("  Alex "), { version: 1, type: "create_room", displayName: "Alex" });
  assert.equal(joinRoom(" abc234 ", "Alex").roomId, "ABC234");
  assert.throws(() => createRoom(" "), /1–24/);
  assert.throws(() => createRoom("a".repeat(25)), /1–24/);
  assert.equal(createRoom("a".repeat(24)).displayName.length, 24);
  assert.deepEqual(decodeServerMessage('{"version":1,"type":"pong"}'), { version: 1, type: "pong" });
  assert.throws(() => decodeServerMessage('{"version":1,"type":"pong","x":1}'), /fields/);
  const player = { playerId: "p", displayName: "Alex", colour: "#4F8CFF", x: 640, y: 360 };
  assert.equal(decodeServerMessage(JSON.stringify({ version: 1, type: "player_joined", player })).player.colour, "#4F8CFF");
  assert.throws(() => decodeServerMessage(JSON.stringify({ version: 1, type: "player_joined", player: { ...player, colour: "red" } })));
});
