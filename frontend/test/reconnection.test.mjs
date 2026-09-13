import test from "node:test";
import assert from "node:assert/strict";
import { NetworkInbox } from "../dist/network-inbox.js";
import { ReconnectingGameClient } from "../dist/reconnecting-game-client.js";

function setup() {
  let now = 0;
  const sockets = [];
  const inbox = new NetworkInbox();
  const client = new ReconnectingGameClient(() => {
    const socket = new FakeSocket(); sockets.push(socket); return socket;
  }, inbox, () => now);
  return { client, sockets, inbox, advance(ms) { now += ms; client.update(); } };
}
const snapshot = { version: 1, type: "room_snapshot", phase: "playing", hostPlayerId: "p", roomId: "ABC234", selfPlayerId: "p",
  players: [{ playerId: "p", displayName: "Alex", colour: "#4F8CFF", avatarPreset: "townsperson-1", seat: null, ready: false, x: 640, y: 360 }] };

test("initial create prevents duplicates and waits for membership confirmation", () => {
  const { client, sockets } = setup();
  assert.equal(sockets.length, 0);
  client.create(" Alex ");
  client.create("Alex");
  assert.equal(sockets.length, 1);
  sockets[0].open();
  assert.deepEqual(JSON.parse(sockets[0].sent[0]), { version: 1, type: "create_room", displayName: "Alex" });
  assert.equal(client.state.status, "connecting");
  client.move(650, 360);
  assert.equal(sockets[0].sent.length, 1);
  sockets[0].message(snapshot);
  assert.equal(client.state.status, "connecting");
  client.update();
  assert.equal(client.state.status, "playing");
  assert.equal(client.state.roomId, "ABC234");
});

class FakeSocket {
  readyState = 0; sent = []; listeners = { open: [], close: [], message: [], error: [] };
  addEventListener(type, listener) { this.listeners[type].push(listener); }
  send(payload) { this.sent.push(payload); }
  open() { this.readyState = 1; this.listeners.open.forEach(fn => fn()); }
  message(value) { this.listeners.message.forEach(fn => fn({ data: JSON.stringify(value) })); }
  disconnect() { this.readyState = 3; this.listeners.close.forEach(fn => fn()); }
  close() { this.disconnect(); }
}

test("initial timeout permits retry and ignores late messages from the abandoned socket", () => {
  const { client, sockets, advance, inbox } = setup();
  client.join("ABC234", "Alex");
  advance(9_999);
  assert.equal(client.state.status, "connecting");
  advance(1);
  assert.equal(client.state.status, "join");
  assert.match(client.state.error, /timed out/);
  client.join("ABC234", "Alex");
  sockets[0].message(snapshot);
  client.update();
  assert.equal(client.state.status, "connecting");
  assert.equal(inbox.drain().length, 0);
});

test("silent loss freezes after ten seconds and rejoin alone resumes play", () => {
  const { client, sockets, advance } = setup();
  client.create("Alex"); sockets[0].open(); sockets[0].message(snapshot); client.update();
  advance(5_000);
  assert.equal(JSON.parse(sockets[0].sent.at(-1)).type, "ping");
  advance(4_999);
  assert.equal(client.state.status, "playing");
  advance(1);
  assert.equal(client.state.status, "reconnecting");
  const count = sockets[0].sent.length;
  client.move(650, 360);
  assert.equal(sockets[0].sent.length, count);
  advance(500);
  sockets[1].open();
  assert.deepEqual(JSON.parse(sockets[1].sent[0]), { version: 1, type: "join_room", roomId: "ABC234", displayName: "Alex" });
  assert.equal(client.state.status, "reconnecting");
  sockets[1].message({ ...snapshot, selfPlayerId: "new" }); client.update();
  assert.equal(client.state.status, "playing");
});

test("reconnect stops after thirty seconds, supports retry, and cancellation is final", () => {
  const { client, sockets, advance, inbox } = setup();
  client.create("Alex"); sockets[0].open(); sockets[0].message(snapshot); client.update();
  sockets[0].disconnect();
  assert.equal(client.state.status, "reconnecting");
  advance(29_999);
  assert.equal(client.state.status, "reconnecting");
  advance(1);
  assert.equal(client.state.status, "failed");
  client.retry();
  assert.equal(client.state.status, "reconnecting");
  const socket = sockets.at(-1);
  client.cancel();
  socket.open(); socket.message(snapshot); advance(40_000);
  assert.equal(client.state.status, "join");
  assert.equal(inbox.drain().length, 0);
  assert.equal(socket.sent.length, 0);
});

test("server entry failures return to join and discard subsequent snapshots", () => {
  for (const code of ["room_not_found", "room_full"]) {
    const { client, sockets, advance } = setup();
    client.join("ABC234", "Alex"); sockets[0].open(); sockets[0].message(snapshot); client.update();
    sockets[0].disconnect(); advance(500); sockets[1].open();
    sockets[1].message({ version: 1, type: "error", code, message: code === "room_full" ? "Room is full" : "Room not found" });
    sockets[1].message(snapshot);
    client.update();
    assert.equal(client.state.status, "join");
    assert.match(client.state.error, /Room/);
    advance(40_000);
    assert.equal(sockets.length, 2);
  }
});

test("leave freezes play, returns on acknowledgment and never reconnects", () => {
  const { client, sockets, advance } = setup();
  client.create("Alex"); sockets[0].open(); sockets[0].message(snapshot); client.update();
  client.leave();
  assert.equal(client.state.status, "leaving");
  assert.equal(JSON.parse(sockets[0].sent.at(-1)).type, "leave_room");
  sockets[0].message({ version: 1, type: "room_left", roomId: "ABC234" }); client.update();
  assert.equal(client.state.status, "join");
  sockets[0].disconnect(); advance(40_000);
  assert.equal(sockets.length, 1);
});

test("room broadcasts do not conceal missing heartbeat responses", () => {
  const { client, sockets, advance } = setup();
  client.create("Alex"); sockets[0].open(); sockets[0].message(snapshot); client.update();
  advance(5_000);
  sockets[0].message({ version: 1, type: "player_moved", playerId: "other", x: 650, y: 360 });
  client.update(); advance(5_000);
  assert.equal(client.state.status, "reconnecting");
});

test("heartbeat responses keep play active and initial server errors permit retry", () => {
  const { client, sockets, advance } = setup();
  client.join("ABC234", "Alex"); sockets[0].open();
  sockets[0].message({ version: 1, type: "error", code: "room_full", message: "Room is full" }); client.update();
  assert.equal(client.state.status, "join");
  assert.equal(client.state.error, "Room is full");
  client.join("ABC234", "Alex"); sockets[1].open(); sockets[1].message(snapshot); client.update();
  for (let i = 0; i < 8; i++) {
    advance(5_000); sockets[1].message({ version: 1, type: "pong" }); client.update();
    assert.equal(client.state.status, "playing");
  }
});

test("unacknowledged Leave and cancellation never resume membership", () => {
  for (const disconnect of [true, false]) {
    const { client, sockets, advance } = setup();
    client.create("Alex"); sockets[0].open(); sockets[0].message(snapshot); client.update();
    client.leave();
    if (disconnect) sockets[0].disconnect();
    advance(10_000);
    assert.equal(client.state.status, "join");
    advance(30_000);
    assert.equal(sockets.length, 1);
  }
});

test("incompatible server messages surface an entry error", () => {
  const { client, sockets } = setup();
  client.create("Alex"); sockets[0].open();
  sockets[0].message({ version: 2, type: "pong" }); client.update();
  assert.equal(client.state.status, "join");
  assert.match(client.state.error, /protocol/);
});

test("Lobby movement freezes and recovery follows the server phase before sending controls", () => {
  for (const phase of ["lobby", "playing"]) {
    const { client, sockets, advance, inbox } = setup();
    client.create("Alex"); sockets[0].open();
    sockets[0].message({ ...snapshot, phase: "lobby", players: [{ ...snapshot.players[0], seat: 0, ready: false }] });
    client.update();
    const count = sockets[0].sent.length;
    client.move(650, 360);
    assert.equal(sockets[0].sent.length, count);
    client.setReady(true);
    assert.deepEqual(JSON.parse(sockets[0].sent.at(-1)), { version: 1, type: "set_ready", ready: true });
    client.startGame();
    assert.equal(JSON.parse(sockets[0].sent.at(-1)).type, "start_game");
    sockets[0].disconnect(); advance(500); sockets[1].open();
    sockets[1].message({ ...snapshot, phase, selfPlayerId: "new", hostPlayerId: "new",
      players: [{ ...snapshot.players[0], playerId: "new", seat: phase === "lobby" ? 0 : null }] });
    const before = sockets[1].sent.length;
    client.move(650, 360);
    assert.equal(sockets[1].sent.length, before);
    client.update();
    client.move(650, 360);
    assert.equal(sockets[1].sent.length, before + (phase === "playing" ? 1 : 0));
    assert.equal(inbox.drain().at(-1).phase, phase);
    if (phase === "playing") {
      const playingCount = sockets[1].sent.length;
      client.setReady(true); client.startGame();
      assert.equal(sockets[1].sent.length, playingCount);
    }
  }
});
