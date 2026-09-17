import test from "node:test";
import assert from "node:assert/strict";

import { MAX_CHAT_CHARACTERS, decodeServerMessage, meetingVote, nightAction, sendChat } from "../dist/protocol.js";

const seat = (index, status = "living") => ({
  playerId: "p" + index, displayName: "Player " + index, colour: "#4F8CFF",
  avatarPreset: "townsperson-1", seat: index, status
});

const SELF = {
  role: "sheriff", faction: "village", status: "living", killedByMafia: false,
  mafiaTeam: null, mafiaVotes: null, mafiaVote: null,
  protect: null, protectBlockedPlayerId: null,
  investigate: "p3", investigations: [{ round: 1, targetPlayerId: "p2", mafia: true }],
  meetingVoted: false, meetingVote: null
};

const GAME = {
  version: 1, type: "game_state", phase: "night", round: 2, remainingMs: 61_500,
  players: [seat(0), seat(1, "eliminated"), seat(2, "left")],
  outcome: null, ballots: null, winner: null, roles: null, self: SELF
};

const decode = value => decodeServerMessage(JSON.stringify(value));

test("Game state carries the Roster, the countdown and this recipient's own private view", () => {
  assert.deepEqual(decode(GAME), GAME);
  const view = decode(GAME);
  assert.equal(view.phase, "night");
  assert.equal(view.remainingMs, 61_500);
  assert.deepEqual(view.players.map(entry => entry.status), ["living", "eliminated", "left"]);
  assert.equal(view.self.investigations[0].mafia, true);
});

test("a finished Game reveals every Role, the winning Faction and no countdown", () => {
  const finished = {
    ...GAME, phase: "finished", remainingMs: null, winner: "village",
    roles: [{ playerId: "p0", role: "mafia" }, { playerId: "p1", role: "doctor" }],
    outcome: { kind: "meeting", victimPlayerId: null, eliminatedPlayerId: "p0", eliminatedMafia: true },
    ballots: [{ voterPlayerId: "p1", targetPlayerId: "p0" }, { voterPlayerId: "p2", targetPlayerId: null }]
  };
  assert.deepEqual(decode(finished), finished);
  // An explicit Skip is a disclosed ballot, not a missing one.
  assert.equal(decode(finished).ballots[1].targetPlayerId, null);
});

test("Game state is decoded strictly, field by field", () => {
  for (const patch of [
    { phase: "dawn" }, { phase: null }, { round: -1 }, { round: 1.5 },
    { remainingMs: -1 }, { remainingMs: "soon" }, { winner: "villagers" },
    { surprise: true }, { self: null }, { players: null },
    { roles: [{ playerId: "p0", role: "mayor" }] },
    { outcome: { kind: "dawn", victimPlayerId: null, eliminatedPlayerId: null, eliminatedMafia: null } },
    { ballots: [{ voterPlayerId: "p1" }] }
  ]) {
    assert.throws(() => decode({ ...GAME, ...patch }), undefined, JSON.stringify(patch));
  }
  for (const patch of [
    { role: "mayor" }, { faction: "town" }, { status: "dead" }, { killedByMafia: null },
    { mafiaTeam: "p0" }, { investigations: [{ round: 1, targetPlayerId: "p2" }] },
    { meetingVoted: "no" }
  ]) {
    assert.throws(() => decode({ ...GAME, self: { ...SELF, ...patch } }), undefined, JSON.stringify(patch));
  }
  // A missing private field is not the same as an absent one; the set is exact.
  // Role Reveal precedes the first Night, so it is the one phase whose round is zero.
  assert.equal(decode({ ...GAME, phase: "role_reveal", round: 0 }).round, 0);
  const { mafiaTeam, ...incomplete } = SELF;
  assert.throws(() => decode({ ...GAME, self: incomplete }), /fields/);
});

test("a Roster entry keeps its Seat and its participation status after the Membership ends", () => {
  const departed = { ...GAME, players: [{ ...seat(0), status: "left" }] };
  assert.equal(decode(departed).players[0].seat, 0);
  for (const patch of [{ seat: null }, { seat: 10 }, { status: "gone" }, { colour: "red" }, { ready: false }]) {
    assert.throws(() => decode({ ...GAME, players: [{ ...seat(0), ...patch }] }), undefined, JSON.stringify(patch));
  }
});

test("chat arrives one entry at a time or as the recipient's whole readable history", () => {
  const entry = { channel: "mafia", round: 3, senderPlayerId: "p0", senderName: "Alex", text: "Take the Doctor." };
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

test("Night choices, Meeting ballots and chat are built for the round they belong to", () => {
  assert.deepEqual(nightAction("mafia_vote", 2, "p4"), { version: 1, type: "mafia_vote", round: 2, targetPlayerId: "p4" });
  assert.deepEqual(nightAction("protect", 1, "p4"), { version: 1, type: "protect", round: 1, targetPlayerId: "p4" });
  assert.deepEqual(nightAction("investigate", 1, "p4"), { version: 1, type: "investigate", round: 1, targetPlayerId: "p4" });
  for (const round of [0, -1, 1.5, Number.NaN]) {
    assert.throws(() => nightAction("protect", round, "p4"), /round/);
  }
  assert.throws(() => nightAction("protect", 1, ""), /targetPlayerId/);
  // A Meeting ballot may be an explicit Skip; a Night choice may not.
  assert.deepEqual(meetingVote(3, null), { version: 1, type: "meeting_vote", round: 3, targetPlayerId: null });
  assert.deepEqual(meetingVote(3, "p4"), { version: 1, type: "meeting_vote", round: 3, targetPlayerId: "p4" });
  assert.deepEqual(sendChat("public", "  I was with p2  "), { version: 1, type: "send_chat", channel: "public", text: "I was with p2" });
  assert.equal(sendChat("mafia", "x".repeat(MAX_CHAT_CHARACTERS)).text.length, MAX_CHAT_CHARACTERS);
  assert.throws(() => sendChat("public", "   "), new RegExp(String(MAX_CHAT_CHARACTERS)));
  assert.throws(() => sendChat("public", "x".repeat(MAX_CHAT_CHARACTERS + 1)), new RegExp(String(MAX_CHAT_CHARACTERS)));
  // Chat length is counted in code points, as Display Names are.
  assert.throws(() => sendChat("public", "\u{1F600}".repeat(MAX_CHAT_CHARACTERS + 1)), new RegExp(String(MAX_CHAT_CHARACTERS)));
});
