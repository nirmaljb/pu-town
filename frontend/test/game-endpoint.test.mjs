import test from "node:test";
import assert from "node:assert/strict";

import { gameEndpoint } from "../dist/game-endpoint.js";
import { avatarCollectionUrl } from "../dist/avatar-presets.js";

const page = (patch = {}) => ({ protocol: "http:", host: "localhost:5173", search: "", ...patch });

test("a page on this computer reaches the Game at its own address", () => {
  assert.equal(gameEndpoint(page()), "ws://localhost:5173/ws/game");
});

test("a page opened from another computer on the network reaches the computer that served it", () => {
  assert.equal(gameEndpoint(page({ host: "192.168.1.5:5173" })), "ws://192.168.1.5:5173/ws/game");
  assert.equal(gameEndpoint(page({ host: "[fe80::1]:5173" })), "ws://[fe80::1]:5173/ws/game");
});

test("a shared https link uses a secure WebSocket on the same link", () => {
  assert.equal(gameEndpoint(page({ protocol: "https:", host: "quiet-town.trycloudflare.com" })),
    "wss://quiet-town.trycloudflare.com/ws/game");
});

test("the ws query parameter overrides the default", () => {
  assert.equal(gameEndpoint(page({ host: "192.168.1.5:5173", search: "?ws=ws%3A%2F%2F10.0.0.7%3A8080%2Fws%2Fgame" })),
    "ws://10.0.0.7:8080/ws/game");
  assert.equal(gameEndpoint(page({ host: "192.168.1.5:5173", search: "?ws=" })), "ws://192.168.1.5:5173/ws/game");
});

test("the Room's collection is fetched from the same address as the WebSocket", () => {
  assert.equal(avatarCollectionUrl(gameEndpoint(page({ host: "192.168.1.5:5173" })), "ABC234"),
    "http://192.168.1.5:5173/rooms/ABC234/avatars");
  assert.equal(avatarCollectionUrl(gameEndpoint(page({ protocol: "https:", host: "quiet-town.trycloudflare.com" })), "ABC234"),
    "https://quiet-town.trycloudflare.com/rooms/ABC234/avatars");
});
