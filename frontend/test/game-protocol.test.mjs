import test from "node:test";
import assert from "node:assert/strict";

import { MAX_CHAT_CHARACTERS, decodeServerMessage, meetingVote, nightChoice, move, sendChat } from "../dist/protocol.js";

const seat = (index, status = "living") => ({
  playerId: "p" + index, displayName: "Player " + index, colour: "#4F8CFF",
  avatarPreset: "townsperson-1", seat: index, status
});

const SELF = {
  role: "sheriff", faction: "village", status: "living", killedByMafia: false,
  mafiaTeam: null, investigations: [{ round: 1, targetPlayerId: "p2", mafia: true }],
  meetingVoted: false, meetingVote: null, nightChoice: null
};

const GAME = {
  version: 1, type: "game_state", phase: "day", round: 2, remainingMs: 61_500,
  players: [seat(0), seat(1, "eliminated"), seat(2, "left")],
  outcome: null, ballots: null, winner: null, roles: null, self: SELF
};

const OWN = { x: 900, y: 600.5, facing: "left", correction: 3 };
const FIELD = {
  version: 1, type: "field_state", round: 2,
  players: [{ playerId: "p0", x: 900, y: 600.5, facing: "left", ghost: false }],
  self: OWN
};

const decode = value => decodeServerMessage(JSON.stringify(value));

test("Night choices carry the current round and decode only in the recipient's private view", () => {
  assert.deepEqual(nightChoice(2, "p3"), { version: 1, type: "night_choice", round: 2, targetPlayerId: "p3" });
  assert.deepEqual(nightChoice(2, null), { version: 1, type: "night_choice", round: 2, targetPlayerId: null });
  for (const round of [0, -1, 1.5]) assert.throws(() => nightChoice(round, "p3"));
  assert.throws(() => nightChoice(2, ""));
  assert.equal(decode({ ...GAME, phase: "night", self: { ...SELF, nightChoice: "p3" } }).self.nightChoice, "p3");
  assert.throws(() => decode({ ...GAME, self: { ...SELF, nightChoice: 3 } }));
});

test("Game state carries the Roster, the countdown and this recipient's own private view", () => {
  assert.deepEqual(decode(GAME), GAME);
  const view = decode(GAME);
  assert.equal(view.phase, "day");
  assert.equal(view.remainingMs, 61_500);
  assert.deepEqual(view.players.map(entry => entry.status), ["living", "eliminated", "left"]);
  assert.equal(view.self.investigations[0].mafia, true);
});

test("Night and Townhall are strict phases; retired Roam and Meeting Call are refused", () => {
  assert.equal(decode({ ...GAME, phase: "night", remainingMs: 20_000 }).phase, "night");
  const discussion = {
    ...GAME, phase: "discussion",
    outcome: { kind: "night", callerPlayerId: null, bodyPlayerId: null, deaths: [], eliminatedPlayerId: null, eliminatedRole: null }
  };
  assert.deepEqual(decode(discussion), discussion);
  for (const phase of ["roam", "meeting_call"]) assert.throws(() => decode({ ...GAME, phase }));
  for (const kind of ["report", "emergency", "timeout"]) assert.throws(() => decode({ ...discussion, outcome: { ...discussion.outcome, kind } }));
});

test("a finished Game reveals every Role, the winning Faction and no countdown", () => {
  const finished = {
    ...GAME, phase: "finished", remainingMs: null, winner: "village",
    roles: [{ playerId: "p0", role: "mafia" }, { playerId: "p1", role: "doctor" }],
    outcome: { kind: "meeting", callerPlayerId: null, bodyPlayerId: null, deaths: [], eliminatedPlayerId: "p0", eliminatedRole: "mafia" },
    ballots: [{ voterPlayerId: "p1", targetPlayerId: "p0" }, { voterPlayerId: "p2", targetPlayerId: null }]
  };
  assert.deepEqual(decode(finished), finished);
  // An explicit Skip is a disclosed ballot, not a missing one.
  assert.equal(decode(finished).ballots[1].targetPlayerId, null);
});

test("Game state is decoded strictly, field by field", () => {
  for (const patch of [
    { phase: "roam" }, { phase: null }, { round: -1 }, { round: 1.5 },
    { remainingMs: -1 }, { remainingMs: "soon" }, { winner: "villagers" },
    { surprise: true }, { self: null }, { players: null },
    { roles: [{ playerId: "p0", role: "mayor" }] },
    { outcome: { kind: "report", callerPlayerId: null, bodyPlayerId: null, deaths: [], eliminatedPlayerId: null, eliminatedRole: null } },
    { ballots: [{ voterPlayerId: "p1" }] }
  ]) {
    assert.throws(() => decode({ ...GAME, ...patch }), undefined, JSON.stringify(patch));
  }
  for (const patch of [
    { role: "mayor" }, { faction: "town" }, { status: "dead" }, { killedByMafia: null },
    { mafiaTeam: "p0" }, { investigations: [{ round: 1, targetPlayerId: "p2" }] },
    { meetingVoted: "no" }, { mafiaVotes: null }
  ]) {
    assert.throws(() => decode({ ...GAME, self: { ...SELF, ...patch } }), undefined, JSON.stringify(patch));
  }
  // Role Reveal precedes the first Roam, so it is the one phase whose round is zero.
  assert.equal(decode({ ...GAME, phase: "role_reveal", round: 0 }).round, 0);
  const { mafiaTeam, ...incomplete } = SELF;
  assert.throws(() => decode({ ...GAME, self: incomplete }), /fields/);
});

test("a field state holds only visible Avatars and the accepted position", () => {
  assert.deepEqual(decode(FIELD), FIELD);
  for (const patch of [
    { round: 0 }, { players: null }, { bodies: [] },
    { players: [{ ...FIELD.players[0], facing: "north" }] },
    { players: [{ ...FIELD.players[0], role: "mafia" }] }, { extra: 1 }
  ]) {
    assert.throws(() => decode({ ...FIELD, ...patch }), undefined, JSON.stringify(patch));
  }
  for (const patch of [{ correction: -1 }, { primaryCooldownMs: 0 }, { emergencyAvailable: true }, { crowding: 0 }]) {
    assert.throws(() => decode({ ...FIELD, self: { ...OWN, ...patch } }), undefined, JSON.stringify(patch));
  }
});

test("a Roster entry keeps its Seat and its participation status after the Membership ends", () => {
  const departed = { ...GAME, players: [{ ...seat(0), status: "left" }] };
  assert.equal(decode(departed).players[0].seat, 0);
  for (const patch of [{ seat: null }, { seat: 10 }, { status: "gone" }, { colour: "red" }, { ready: false }]) {
    assert.throws(() => decode({ ...GAME, players: [{ ...seat(0), ...patch }] }), undefined, JSON.stringify(patch));
  }
});

test("chat arrives one entry at a time or as the recipient's whole readable history", () => {
  const entry = { channel: "proximity", round: 3, senderPlayerId: "p0", senderName: "Alex", text: "Meet at the store." };
  assert.deepEqual(decode({ version: 1, type: "chat_history", messages: [entry] }),
    { version: 1, type: "chat_history", messages: [entry] });
  assert.deepEqual(decode({ version: 1, type: "chat_history", messages: [] }),
    { version: 1, type: "chat_history", messages: [] });
  for (const patch of [{ channel: "whisper" }, { round: 0 }, { text: "" }, { senderName: "" }]) {
    assert.throws(() => decode({ version: 1, type: "chat_message", ...entry, ...patch }), undefined, JSON.stringify(patch));
  }
  assert.throws(() => decode({ version: 1, type: "chat_message", ...entry, recipients: ["p1"] }), /fields/);
  assert.throws(() => decode({ version: 1, type: "chat_history", messages: [{ ...entry, extra: 1 }] }), /fields/);
});

test("steps, Meeting ballots and chat are built exactly", () => {
  assert.deepEqual(move(900.04, 600.06, "up"), { version: 1, type: "move", x: 900, y: 600.1, facing: "up" });
  assert.throws(() => move(Number.NaN, 1, "up"), /x/);
  assert.throws(() => move(1, 1, "north"), /Facing/);
  assert.deepEqual(meetingVote(3, null), { version: 1, type: "meeting_vote", round: 3, targetPlayerId: null });
  assert.deepEqual(meetingVote(3, "p4"), { version: 1, type: "meeting_vote", round: 3, targetPlayerId: "p4" });
  assert.deepEqual(sendChat("public", "  I was with p2  "), { version: 1, type: "send_chat", channel: "public", text: "I was with p2" });
  assert.equal(sendChat("proximity", "x".repeat(MAX_CHAT_CHARACTERS)).text.length, MAX_CHAT_CHARACTERS);
  assert.throws(() => sendChat("mafia", "Retired private channel"));
  assert.throws(() => decode({ version: 1, type: "chat_message", channel: "mafia", round: 1, senderPlayerId: "p0", senderName: "Alex", text: "Retired" }));
  assert.throws(() => sendChat("public", "   "), new RegExp(String(MAX_CHAT_CHARACTERS)));
  assert.throws(() => sendChat("public", "x".repeat(MAX_CHAT_CHARACTERS + 1)), new RegExp(String(MAX_CHAT_CHARACTERS)));
  // Chat length is counted in code points, as Display Names are.
  assert.throws(() => sendChat("public", "\u{1F600}".repeat(MAX_CHAT_CHARACTERS + 1)), new RegExp(String(MAX_CHAT_CHARACTERS)));
});

test("Townhall results decode exact Roles and reject missing, unknown and retired reveal fields", () => {
  const outcome = { kind: "meeting", callerPlayerId: null, bodyPlayerId: null, deaths: [], eliminatedPlayerId: "p1", eliminatedRole: "doctor" };
  for (const role of ["mafia", "doctor", "sheriff", "villager"]) {
    assert.equal(decode({ ...GAME, phase: "voting_result", outcome: { ...outcome, eliminatedRole: role } }).outcome.eliminatedRole, role);
  }
  assert.equal(decode({ ...GAME, outcome: { ...outcome, eliminatedPlayerId: null, eliminatedRole: null } }).outcome.eliminatedRole, null);
  for (const role of [true, false, "village", "mayor", undefined]) {
    assert.throws(() => decode({ ...GAME, outcome: { ...outcome, eliminatedRole: role } }));
  }
  assert.throws(() => decode({ ...GAME, outcome: { ...outcome, eliminatedMafia: false } }), /fields/);
});
