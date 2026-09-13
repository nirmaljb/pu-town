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
  const player = { playerId: "p", displayName: "Alex", colour: "#4F8CFF", avatarPreset: "townsperson-1", seat: null, ready: false, x: 640, y: 360 };
  assert.equal(decodeServerMessage(JSON.stringify({ version: 1, type: "player_joined", player })).player.colour, "#4F8CFF");
  assert.throws(() => decodeServerMessage(JSON.stringify({ version: 1, type: "player_joined", player: { ...player, colour: "red" } })));
});

test("snapshots and join announcements require a known Avatar Preset", () => {
  const player = { playerId: "p", displayName: "Alex", colour: "#4F8CFF", avatarPreset: "townsperson-6", seat: null, ready: false, x: 640, y: 360 };
  for (const envelope of [
    p => ({ version: 1, type: "player_joined", player: p }),
    p => ({ version: 1, type: "room_snapshot", phase: "playing", hostPlayerId: "p", selfPlayerId: "p", roomId: "ABC234", players: [p] })
  ]) {
    assert.doesNotThrow(() => decodeServerMessage(JSON.stringify(envelope(player))));
    for (const avatarPreset of [undefined, null, 1, "", "townsperson-7", "../../image"]) {
      assert.throws(() => decodeServerMessage(JSON.stringify(envelope({ ...player, avatarPreset }))));
    }
  }
});

test("Lobby state validates phase, Host, seats and readiness strictly", () => {
  const player = { playerId: "p", displayName: "Alex", colour: "#4F8CFF", avatarPreset: "townsperson-1", seat: 0, ready: false, x: 640, y: 177 };
  const state = { version: 1, type: "room_state", phase: "lobby", hostPlayerId: "p", players: [player] };
  assert.deepEqual(decodeServerMessage(JSON.stringify(state)), state);
  for (const phase of [undefined, null, "morning", 1]) {
    assert.throws(() => decodeServerMessage(JSON.stringify({ ...state, phase })));
  }
  for (const seat of [undefined, -1, 10, 0.5, "0"]) {
    assert.throws(() => decodeServerMessage(JSON.stringify({ ...state, players: [{ ...player, seat }] })));
  }
  for (const ready of [undefined, null, 0, "true"]) {
    assert.throws(() => decodeServerMessage(JSON.stringify({ ...state, players: [{ ...player, ready }] })));
  }
  assert.throws(() => decodeServerMessage(JSON.stringify({ ...state, hostPlayerId: "" })));
  assert.throws(() => decodeServerMessage(JSON.stringify({ ...state, surprise: true })));
});

test("Room state rejects seat assignments inconsistent with its phase", () => {
  const player = { playerId: "p", displayName: "Alex", colour: "#4F8CFF", avatarPreset: "townsperson-1", seat: null, ready: false, x: 640, y: 360 };
  for (const type of ["room_state", "room_snapshot"]) {
    const envelope = { version: 1, type, phase: "lobby", hostPlayerId: "p", players: [player],
      ...(type === "room_snapshot" ? { roomId: "ABC234", selfPlayerId: "p" } : {}) };
    assert.throws(() => decodeServerMessage(JSON.stringify(envelope)), /seat/);
    assert.throws(() => decodeServerMessage(JSON.stringify({ ...envelope, phase: "playing", players: [{ ...player, seat: 0 }] })), /seat/);
  }
});
