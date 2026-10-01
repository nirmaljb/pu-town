import test from "node:test";
import assert from "node:assert/strict";

import { NetworkInbox } from "../dist/network-inbox.js";
import { NetworkFrameBoundary } from "../dist/network-frame-boundary.js";
import { emptyWorld } from "../dist/world-state.js";

const seated = (playerId, seat, patch = {}) => ({
  playerId, displayName: "Alex", colour: "#4F8CFF", avatarPreset: "townsperson-1",
  connected: true, seat, ready: false, facing: "up", x: 640, y: 177, ...patch
});

const rosterOf = (...players) => players.map(player => ({
  playerId: player.playerId, displayName: player.displayName, colour: player.colour,
  avatarPreset: player.avatarPreset, seat: player.seat, status: "living"
}));

const selfView = (patch = {}) => ({
  role: "villager", faction: "village", status: "living", killedByMafia: false,
  mafiaTeam: null, mafiaVotes: null, mafiaVote: null, protect: null, protectBlockedPlayerId: null,
  investigate: null, investigations: null, meetingVoted: false, meetingVote: null, ...patch
});

const gameState = (patch = {}) => ({
  version: 1, type: "game_state", phase: "night", round: 1, remainingMs: 90_000,
  players: [], outcome: null, ballots: null, winner: null, roles: null, self: selfView(), ...patch
});

test("network events affect the world only when a game frame begins", () => {
  const inbox = new NetworkInbox();
  const reconciled = [];
  const boundary = new NetworkFrameBoundary(inbox, emptyWorld(), {
    reconcile(world) { reconciled.push(world); }
  });

  inbox.enqueue({
    version: 1,
    type: "room_snapshot", recoveryToken: "a".repeat(64), phase: "playing", hostPlayerId: "p", roleSetup: { mafia: 1, doctors: 1, sheriffs: 1 },
    selfPlayerId: "player-1",
    roomId: "plaza",
    players: [seated("player-1", 0)]
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

  inbox.enqueue({ version: 1, type: "player_joined", player: seated("player-2", 1, { colour: "#FF8066" }) });
  inbox.enqueue({ version: 1, type: "player_left", playerId: "player-2", reason: "left" });

  boundary.beginFrame();

  assert.equal(boundary.world.players.has("player-2"), false);
  assert.equal(reconciled.length, 1);
});

test("Lobby seats, readiness, Host succession and Start apply in order at frame boundaries", () => {
  const inbox = new NetworkInbox();
  const views = [];
  const boundary = new NetworkFrameBoundary(inbox, emptyWorld(), { reconcile(world) { views.push(world); } });
  const host = seated("h", 0);
  const guest = seated("g", 1, { colour: "#FF8066", x: 869, y: 216 });
  inbox.enqueue({ version: 1, type: "room_snapshot", recoveryToken: "a".repeat(64), roomId: "ABC234", selfPlayerId: "g", phase: "lobby", hostPlayerId: "h", roleSetup: { mafia: 1, doctors: 1, sheriffs: 1 }, players: [host, guest] });
  boundary.beginFrame();
  assert.equal(boundary.world.phase, "lobby");
  inbox.enqueue({ version: 1, type: "room_state", phase: "lobby", hostPlayerId: "h", roleSetup: { mafia: 1, doctors: 1, sheriffs: 1 }, players: [host, { ...guest, ready: true }] });
  inbox.enqueue({ version: 1, type: "player_left", playerId: "h", reason: "disconnected" });
  inbox.enqueue({ version: 1, type: "room_state", phase: "lobby", hostPlayerId: "g", roleSetup: { mafia: 1, doctors: 1, sheriffs: 1 }, players: [{ ...guest, ready: true }] });
  assert.equal(boundary.world.hostPlayerId, "h");
  assert.equal(boundary.world.players.get("g").ready, false);
  boundary.beginFrame();
  assert.equal(boundary.world.hostPlayerId, "g");
  assert.equal(boundary.world.players.get("g").seat, 1);
  assert.equal(boundary.world.players.get("g").ready, true);
  // Starting the Game leaves every Player exactly where the Lobby seated them.
  inbox.enqueue({ version: 1, type: "room_state", phase: "playing", hostPlayerId: "g", roleSetup: { mafia: 1, doctors: 1, sheriffs: 1 }, players: [{ ...guest, ready: true }] });
  boundary.beginFrame();
  assert.equal(boundary.world.phase, "playing");
  assert.equal(boundary.world.selfPlayerId, "g");
  assert.equal(boundary.world.players.get("g").seat, 1);
  assert.equal(boundary.world.players.get("g").x, 869);
  assert.equal(views.length, 3);
});

test("Game state, chat and Room state applied in one frame reconcile once, in transport order", () => {
  const inbox = new NetworkInbox();
  const views = [];
  const boundary = new NetworkFrameBoundary(inbox, emptyWorld(), { reconcile(world) { views.push(world); } });
  const player = seated("p", 0);
  inbox.enqueue({ version: 1, type: "room_snapshot", recoveryToken: "a".repeat(64), roomId: "ABC234", selfPlayerId: "p", phase: "playing", hostPlayerId: "p", roleSetup: { mafia: 1, doctors: 1, sheriffs: 1 }, players: [player] });
  inbox.enqueue(gameState({ phase: "role_reveal", round: 0, remainingMs: 8_000, players: rosterOf(player), self: selfView({ role: "mafia", faction: "mafia", mafiaTeam: ["p"], mafiaVotes: [] }) }));
  inbox.enqueue({ version: 1, type: "chat_history", messages: [] });
  assert.equal(boundary.world.game, null);
  boundary.beginFrame();
  assert.equal(views.length, 1);
  assert.equal(boundary.world.game.phase, "role_reveal");
  assert.equal(boundary.world.game.self.role, "mafia");
  // The envelope is transport, not world state.
  assert.equal("version" in boundary.world.game, false);
  assert.equal("type" in boundary.world.game, false);

  inbox.enqueue(gameState({ players: rosterOf(player), self: selfView({ role: "mafia", faction: "mafia", mafiaTeam: ["p"], mafiaVotes: [] }) }));
  inbox.enqueue({ version: 1, type: "chat_message", channel: "mafia", round: 1, senderPlayerId: "p", senderName: "Alex", text: "Seat one." });
  inbox.enqueue(gameState({ players: rosterOf(player), remainingMs: 60_000, self: selfView({ role: "mafia", faction: "mafia", mafiaTeam: ["p"], mafiaVotes: [{ voterPlayerId: "p", targetPlayerId: "q" }], mafiaVote: "q" }) }));
  assert.equal(boundary.world.game.phase, "role_reveal");
  boundary.beginFrame();
  assert.equal(views.length, 2);
  assert.equal(boundary.world.game.phase, "night");
  assert.equal(boundary.world.game.remainingMs, 60_000, "the last Game state of the frame wins");
  assert.equal(boundary.world.game.self.mafiaVote, "q");
  assert.deepEqual(boundary.world.chat.map(entry => entry.text), ["Seat one."]);
});

test("the phase countdown runs from when its Game state arrived, not when a frame applied it", () => {
  let now = 10_000;
  const inbox = new NetworkInbox(() => now);
  const boundary = new NetworkFrameBoundary(inbox, emptyWorld(), { reconcile() {} });
  const player = seated("p", 0);
  inbox.enqueue({ version: 1, type: "room_snapshot", recoveryToken: "a".repeat(64), roomId: "ABC234", selfPlayerId: "p", phase: "playing", hostPlayerId: "p", roleSetup: { mafia: 1, doctors: 1, sheriffs: 1 }, players: [player] });
  inbox.enqueue(gameState({ phase: "roam", remainingMs: 150_000, players: rosterOf(player) }));
  // A hidden tab runs no frames for 30 seconds.
  now += 30_000;
  boundary.beginFrame();
  assert.equal(boundary.world.phaseEndsAt, 160_000);
  inbox.enqueue({ version: 1, type: "room_snapshot", recoveryToken: "a".repeat(64), roomId: "ABC234", selfPlayerId: "p", phase: "playing", hostPlayerId: "p", roleSetup: { mafia: 1, doctors: 1, sheriffs: 1 }, players: [player] });
  boundary.beginFrame();
  assert.equal(boundary.world.phaseEndsAt, 160_000, "a snapshot of the same Room keeps the deadline");
  inbox.enqueue(gameState({ phase: "finished", remainingMs: null, players: rosterOf(player) }));
  boundary.beginFrame();
  assert.equal(boundary.world.phaseEndsAt, null);
});

test("chat history replaces the readable log and later messages append to it", () => {
  const inbox = new NetworkInbox();
  const boundary = new NetworkFrameBoundary(inbox, emptyWorld(), { reconcile() {} });
  const spoken = (text, channel = "public") => ({ version: 1, type: "chat_message", channel, round: 1, senderPlayerId: "p", senderName: "Alex", text });
  inbox.enqueue({ version: 1, type: "room_snapshot", recoveryToken: "a".repeat(64), roomId: "ABC234", selfPlayerId: "p", phase: "playing", hostPlayerId: "p", roleSetup: { mafia: 1, doctors: 1, sheriffs: 1 }, players: [seated("p", 0)] });
  inbox.enqueue(spoken("first"));
  inbox.enqueue(spoken("second"));
  boundary.beginFrame();
  assert.deepEqual(boundary.world.chat.map(entry => entry.text), ["first", "second"]);
  // Recovery replays only what this recipient may read, and it replaces the log rather than doubling it.
  const { version, type, ...entry } = spoken("second");
  inbox.enqueue({ version: 1, type: "chat_history", messages: [entry] });
  boundary.beginFrame();
  assert.deepEqual(boundary.world.chat.map(entry => entry.text), ["second"]);
});

test("a snapshot for the same Room keeps private Game state until its replacement arrives", () => {
  const inbox = new NetworkInbox();
  const boundary = new NetworkFrameBoundary(inbox, emptyWorld(), { reconcile() {} });
  const player = seated("p", 0);
  const snapshot = roomId => ({ version: 1, type: "room_snapshot", recoveryToken: "a".repeat(64), roomId, selfPlayerId: "p", phase: "playing", hostPlayerId: "p", roleSetup: { mafia: 1, doctors: 1, sheriffs: 1 }, players: [player] });
  inbox.enqueue(snapshot("ABC234"));
  inbox.enqueue(gameState({ players: rosterOf(player), self: selfView({ role: "doctor", protect: "p" }) }));
  inbox.enqueue({ version: 1, type: "chat_message", channel: "public", round: 1, senderPlayerId: "p", senderName: "Alex", text: "Seated." });
  boundary.beginFrame();
  inbox.enqueue(snapshot("ABC234"));
  boundary.beginFrame();
  assert.equal(boundary.world.game.self.protect, "p", "recovery must not blank the Game between frames");
  assert.equal(boundary.world.chat.length, 1);
  // A different Room is a different Game, so nothing carries over.
  inbox.enqueue(snapshot("ZZZ999"));
  boundary.beginFrame();
  assert.equal(boundary.world.game, null);
  assert.equal(boundary.world.chat.length, 0);
});

test("disconnected presence stays in the world while the Game Roster keeps the Participant", () => {
  const inbox = new NetworkInbox();
  const boundary = new NetworkFrameBoundary(inbox, emptyWorld(), { reconcile() {} });
  const player = seated("p", 0);
  const roster = rosterOf(player);
  inbox.enqueue({ version: 1, type: "room_snapshot", recoveryToken: "a".repeat(64), roomId: "ABC234", selfPlayerId: "p", phase: "playing", hostPlayerId: "p", roleSetup: { mafia: 1, doctors: 1, sheriffs: 1 }, players: [player] });
  inbox.enqueue(gameState({ players: roster }));
  boundary.beginFrame();
  inbox.enqueue({ version: 1, type: "room_state", phase: "playing", hostPlayerId: "p", roleSetup: { mafia: 1, doctors: 1, sheriffs: 1 }, players: [{ ...player, connected: false }] });
  assert.equal(boundary.world.players.get("p").connected, true);
  boundary.beginFrame();
  assert.equal(boundary.world.players.get("p").connected, false);
  assert.equal(boundary.world.game.players[0].status, "living", "a Disconnect is not a departure from the Game");
  // Only the end of the Membership forfeits the Participant, and the Roster still holds their Seat.
  inbox.enqueue({ version: 1, type: "player_left", playerId: "p", reason: "expired" });
  inbox.enqueue(gameState({ players: [{ ...roster[0], status: "left" }] }));
  boundary.beginFrame();
  assert.equal(boundary.world.players.size, 0);
  assert.deepEqual(boundary.world.game.players.map(entry => [entry.seat, entry.status]), [[0, "left"]]);
});

test("Leaving the Room clears the Game and a reset discards everything queued behind it", () => {
  const inbox = new NetworkInbox();
  const boundary = new NetworkFrameBoundary(inbox, emptyWorld(), { reconcile() {} });
  const player = seated("p", 0);
  inbox.enqueue({ version: 1, type: "room_snapshot", recoveryToken: "a".repeat(64), roomId: "ABC234", selfPlayerId: "p", phase: "playing", hostPlayerId: "p", roleSetup: { mafia: 1, doctors: 1, sheriffs: 1 }, players: [player] });
  inbox.enqueue(gameState({ players: rosterOf(player) }));
  boundary.beginFrame();
  inbox.enqueue({ version: 1, type: "room_left", roomId: "ABC234" });
  boundary.beginFrame();
  assert.equal(boundary.world.game, null);
  assert.equal(boundary.world.roomId, null);
  inbox.enqueue(gameState({ players: rosterOf(player) }));
  boundary.reset();
  assert.equal(boundary.world.game, null);
  boundary.beginFrame();
  assert.equal(boundary.world.game, null, "a reset drains the inbox as well as the world");
});

test('accepted appearance replaces existing Player only at the frame boundary and precedes Start', () => {
  const inbox = new NetworkInbox();
  const frames = [];
  const boundary = new NetworkFrameBoundary(inbox, emptyWorld(), { reconcile(world, arrivals) { frames.push({world, arrivals}); } });
  const player = seated('p', 0, { ready: true, facing: 'left' });
  inbox.enqueue({ version: 1, type: 'room_snapshot', recoveryToken: 'a'.repeat(64), roomId: 'ABC234', selfPlayerId: 'p', phase: 'lobby', hostPlayerId: 'p', roleSetup: { mafia: 1, doctors: 1, sheriffs: 1 }, players: [player] });
  boundary.beginFrame();
  const chosen = { ...player, avatarPreset: 'townsperson-10' };
  inbox.enqueue({ version: 1, type: 'room_state', phase: 'lobby', hostPlayerId: 'p', roleSetup: { mafia: 1, doctors: 1, sheriffs: 1 }, players: [chosen] });
  assert.equal(boundary.world.players.get('p').avatarPreset, 'townsperson-1');
  boundary.beginFrame();
  assert.deepEqual(boundary.world.players.get('p'), chosen);
  assert.equal(frames.at(-1).arrivals.size, 0, 'appearance is not a membership arrival');
  inbox.enqueue({ version: 1, type: 'room_state', phase: 'playing', hostPlayerId: 'p', roleSetup: { mafia: 1, doctors: 1, sheriffs: 1 }, players: [chosen] });
  boundary.beginFrame();
  assert.equal(boundary.world.players.get('p').avatarPreset, 'townsperson-10');
  assert.equal(boundary.world.phase, 'playing');
});
