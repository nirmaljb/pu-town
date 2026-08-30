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
