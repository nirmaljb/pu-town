import test from "node:test";
import assert from "node:assert/strict";

import { NetworkInbox } from "../dist/network-inbox.js";
import { ReconnectingGameClient } from "../dist/reconnecting-game-client.js";

test("disconnect reconnects and rejoins the previous room on a new socket", () => {
  const sockets = [];
  const client = new ReconnectingGameClient(
    () => sockets.push(new FakeSocket()) && sockets.at(-1),
    new NetworkInbox(),
    reconnect => reconnect()
  );
  client.join("plaza", "Alex");
  sockets[0].open();
  assert.deepEqual(JSON.parse(sockets[0].sent[0]), {
    version: 1, type: "join_room", roomId: "plaza", displayName: "Alex"
  });

  sockets[0].disconnect();
  assert.equal(sockets.length, 2);
  sockets[1].open();
  assert.equal(JSON.parse(sockets[1].sent[0]).type, "join_room");
});

test("acknowledged leave disables automatic reconnection", () => {
  const sockets = [];
  const client = new ReconnectingGameClient(
    () => sockets.push(new FakeSocket()) && sockets.at(-1),
    new NetworkInbox(),
    reconnect => reconnect()
  );
  client.join("plaza", "Alex");
  sockets[0].open();
  client.leave();
  sockets[0].disconnect();

  assert.equal(JSON.parse(sockets[0].sent[1]).type, "leave_room");
  assert.equal(sockets.length, 1);
});

class FakeSocket {
  readyState = 0;
  sent = [];
  listeners = { open: [], close: [], message: [] };

  addEventListener(type, listener) { this.listeners[type].push(listener); }
  send(payload) { this.sent.push(payload); }
  open() { this.readyState = 1; this.listeners.open.forEach(listener => listener()); }
  disconnect() { this.readyState = 3; this.listeners.close.forEach(listener => listener()); }
  close() { this.disconnect(); }
}
