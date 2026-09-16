import test from "node:test";
import assert from "node:assert/strict";

import { decodeServerMessage } from "../dist/protocol.js";
import { decodeAvatarCollection, setActiveAvatarCollection } from "../dist/avatar-presets.js";

const ARTWORK = "data:image/png;base64,iVBORw0KGgo=";
const collectionOf = (...ids) => ({
  version: 1,
  collectionId: "collection-" + ids.join("-"),
  presets: ids.map(id => ({ id, name: "Name " + id, sprite: ARTWORK, seatedSprite: ARTWORK }))
});

test("the client accepts an explicit version 1 server message", () => {
  assert.deepEqual(decodeServerMessage(JSON.stringify({
    version: 1, type: "player_moved", playerId: "player-1", facing: "down", sequence: 1, epoch: 0, x: 12, y: 24
  })), {
    version: 1, type: "player_moved", playerId: "player-1", facing: "down", sequence: 1, epoch: 0, x: 12, y: 24
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
  const player = { playerId: "p", displayName: "Alex", colour: "#4F8CFF", avatarPreset: "townsperson-1", connected: true, seat: null, ready: false, facing: "down", sequence: 0, epoch: 0, x: 640, y: 360 };
  assert.equal(decodeServerMessage(JSON.stringify({ version: 1, type: "player_joined", player })).player.colour, "#4F8CFF");
  assert.throws(() => decodeServerMessage(JSON.stringify({ version: 1, type: "player_joined", player: { ...player, colour: "red" } })));
});

test("snapshots and join announcements require a well-formed Avatar Preset identifier", () => {
  const player = { playerId: "p", displayName: "Alex", colour: "#4F8CFF", avatarPreset: "townsperson-6", connected: true, seat: null, ready: false, facing: "down", sequence: 0, epoch: 0, x: 640, y: 360 };
  for (const envelope of [
    p => ({ version: 1, type: "player_joined", player: p }),
    p => ({ version: 1, type: "room_snapshot", recoveryToken: "a".repeat(64), phase: "playing", hostPlayerId: "p", selfPlayerId: "p", roomId: "ABC234", players: [p] })
  ]) {
    assert.doesNotThrow(() => decodeServerMessage(JSON.stringify(envelope(player))));
    // A snapshot can arrive before the Room's collection does, so membership is the
    // server's to enforce; the wire still refuses anything that is not an identifier.
    for (const avatarPreset of [undefined, null, 1, "", "../../image", "Townsperson-1", "-leading", "a".repeat(65)]) {
      assert.throws(() => decodeServerMessage(JSON.stringify(envelope({ ...player, avatarPreset }))));
    }
    assert.doesNotThrow(() => decodeServerMessage(JSON.stringify(envelope({ ...player, avatarPreset: "unpublished-draft" }))));
  }
});

test("Lobby state validates phase, Host, seats and readiness strictly", () => {
  const player = { playerId: "p", displayName: "Alex", colour: "#4F8CFF", avatarPreset: "townsperson-1", connected: true, seat: 0, ready: false, facing: "down", sequence: 0, epoch: 0, x: 640, y: 177 };
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
  const player = { playerId: "p", displayName: "Alex", colour: "#4F8CFF", avatarPreset: "townsperson-1", connected: true, seat: null, ready: false, facing: "down", sequence: 0, epoch: 0, x: 640, y: 360 };
  for (const type of ["room_state", "room_snapshot"]) {
    const envelope = { version: 1, type, phase: "lobby", hostPlayerId: "p", players: [player],
      ...(type === "room_snapshot" ? { roomId: "ABC234", selfPlayerId: "p", recoveryToken: "a".repeat(64) } : {}) };
    assert.throws(() => decodeServerMessage(JSON.stringify(envelope)), /seat/);
    assert.throws(() => decodeServerMessage(JSON.stringify({ ...envelope, phase: "playing", players: [{ ...player, seat: 0 }] })), /seat/);
  }
});


test("movement carries strict retained Facing and acknowledgment coordinates", () => {
  const event = { version: 1, type: "player_moved", playerId: "p", x: 640, y: 360, facing: "left", sequence: 3, epoch: 0 };
  assert.deepEqual(decodeServerMessage(JSON.stringify(event)), event);
  for (const patch of [{ facing: "north" }, { sequence: -1 }, { sequence: 1.5 }, { epoch: null }]) {
    assert.throws(() => decodeServerMessage(JSON.stringify({ ...event, ...patch })));
  }
});

test("recovery snapshots require a private credential and explicit connected presence", async () => {
  const { recoverRoom } = await import("../dist/protocol.js");
  assert.deepEqual(recoverRoom("ABC234", "a".repeat(64)), {
    version: 1, type: "recover_room", roomId: "ABC234", recoveryToken: "a".repeat(64)
  });
  assert.throws(() => recoverRoom("ABC234", "player-1"));
  const player = { playerId: "p", displayName: "Alex", colour: "#4F8CFF", avatarPreset: "townsperson-1", connected: false, seat: null, ready: false, facing: "down", sequence: 0, epoch: 0, x: 640, y: 360 };
  const snapshot = { version: 1, type: "room_snapshot", recoveryToken: "a".repeat(64), selfPlayerId: "p", roomId: "ABC234", phase: "playing", hostPlayerId: "p", players: [player] };
  assert.deepEqual(decodeServerMessage(JSON.stringify(snapshot)), snapshot);
  for (const recoveryToken of [undefined, "player-1", "", 1]) {
    assert.throws(() => decodeServerMessage(JSON.stringify({ ...snapshot, recoveryToken })));
  }
  for (const connected of [undefined, "false", 0, null]) {
    assert.throws(() => decodeServerMessage(JSON.stringify({ ...snapshot, players: [{ ...player, connected }] })));
  }
  assert.throws(() => decodeServerMessage(JSON.stringify({ version: 1, type: "player_joined", player: { ...player, recoveryToken: "a".repeat(64) } })));
});


test("selection addresses only the sending Player and only the Room's own collection", async () => {
  const { selectAvatar } = await import('../dist/protocol.js');
  const collection = decodeAvatarCollection(collectionOf('townsperson-1', 'townsperson-2'));
  setActiveAvatarCollection(collection);
  for (const preset of collection.presets) {
    assert.deepEqual(selectAvatar(preset.id), { version: 1, type: 'select_avatar', avatarPreset: preset.id });
    const player = { playerId: 'p', displayName: 'Alex', colour: '#4F8CFF', avatarPreset: preset.id,
      connected: true, seat: 0, ready: true, facing: 'down', sequence: 0, epoch: 0, x: 640, y: 177 };
    assert.equal(decodeServerMessage(JSON.stringify({version: 1, type: 'player_joined', player})).player.avatarPreset, preset.id);
  }
  // A preset another Room published is as unaskable as one that was never published.
  assert.throws(() => selectAvatar('townsperson-3'), /Avatar Preset/);
  assert.throws(() => selectAvatar('unpublished-draft'), /Avatar Preset/);
  setActiveAvatarCollection(null);
  assert.throws(() => selectAvatar('townsperson-1'), /Avatar Preset/);
});

test("a Room's collection is decoded strictly and its artwork must be inline", () => {
  const collection = decodeAvatarCollection(collectionOf('townsperson-1', 'townsperson-2'));
  assert.equal(collection.collectionId, 'collection-townsperson-1-townsperson-2');
  assert.deepEqual(collection.presets.map(preset => preset.id), ['townsperson-1', 'townsperson-2']);
  assert.equal(collection.presets[0].name, 'Name townsperson-1');
  const single = decodeAvatarCollection(collectionOf('townsperson-1'));
  assert.equal(single.presets.length, 1);
  const many = decodeAvatarCollection(collectionOf(...Array.from({ length: 24 }, (_, index) => 'townsperson-' + (index + 1))));
  assert.equal(many.presets.length, 24);
  // Names are bounded in code points, as Display Names are, so the editor and the client agree.
  const emoji = '\u{1F600}'.repeat(24);
  const named = collectionOf('townsperson-1');
  named.presets[0].name = emoji;
  assert.equal(decodeAvatarCollection(named).presets[0].name, emoji);
  const valid = collectionOf('townsperson-1');
  for (const refused of [
    null, {}, { ...valid, version: 2 }, { ...valid, collectionId: '' }, { ...valid, presets: [] },
    { ...valid, presets: [...valid.presets, ...valid.presets] },
    { ...valid, presets: [{ ...valid.presets[0], name: '' }] },
    { ...valid, presets: [{ ...valid.presets[0], name: 'N'.repeat(25) }] },
    { ...valid, presets: [{ ...valid.presets[0], name: '\u{1F600}'.repeat(25) }] },
    { ...valid, presets: [{ ...valid.presets[0], id: 'Townsperson 1' }] },
    { ...valid, presets: [{ ...valid.presets[0], sprite: '/assets/townsperson-1.png' }] },
    { ...valid, presets: [{ ...valid.presets[0], seatedSprite: 'https://example.invalid/legs.png' }] }
  ]) {
    assert.throws(() => decodeAvatarCollection(refused), undefined, JSON.stringify(refused));
  }
});

test("the collection endpoint sits beside the game WebSocket", async () => {
  const { avatarCollectionUrl, fetchAvatarCollection } = await import('../dist/avatar-presets.js');
  assert.equal(avatarCollectionUrl('ws://localhost:8080/ws/game', 'ABC234'), 'http://localhost:8080/rooms/ABC234/avatars');
  assert.equal(avatarCollectionUrl('wss://town.example/ws/game?x=1', 'ABC234'), 'https://town.example/rooms/ABC234/avatars');
  const requested = [];
  const fetched = await fetchAvatarCollection('ws://localhost:8080/ws/game', 'ABC234', async (url, init) => {
    requested.push([url, init]);
    return { ok: true, status: 200, json: async () => collectionOf('townsperson-1') };
  });
  assert.deepEqual(requested.map(([url]) => url), ['http://localhost:8080/rooms/ABC234/avatars']);
  // Entry must not stall behind a Room whose collection never arrives.
  assert.ok(requested[0][1].signal instanceof AbortSignal, 'the fetch carries a deadline');
  assert.deepEqual(fetched.presets.map(preset => preset.id), ['townsperson-1']);
  await assert.rejects(
    fetchAvatarCollection('ws://localhost:8080/ws/game', 'ZZZZZZ', async () => ({ ok: false, status: 404 })),
    /unavailable \(404\)/);
});
