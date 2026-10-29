import test from "node:test";
import assert from "node:assert/strict";

import { decodeServerMessage, setVoice, voiceSignal } from "../dist/protocol.js";
import { GameTransport } from "../dist/game-transport.js";
import { NetworkInbox } from "../dist/network-inbox.js";
import { HEARING_RANGE, VISION } from "../dist/room-rules.js";
import { isOfferer, proximityMix, tuneOpus, VOICE_BITRATE } from "../dist/voice-chat.js";

test("voice messages use strict schemas in both directions", () => {
  assert.deepEqual(setVoice(true), { version: 1, type: "set_voice", enabled: true });
  assert.deepEqual(voiceSignal("player-2", "offer", "{}"),
    { version: 1, type: "voice_signal", targetPlayerId: "player-2", kind: "offer", data: "{}" });
  assert.throws(() => voiceSignal("player-2", "hangup", "{}"), /voice signal kind/);
  assert.throws(() => voiceSignal("player-2", "candidate", "x".repeat(16_001)), /16000/);

  const routes = { version: 1, type: "voice_routes", peers: [{ playerId: "player-2", send: true, receive: false }] };
  assert.deepEqual(decodeServerMessage(JSON.stringify(routes)), routes);
  assert.throws(() => decodeServerMessage(JSON.stringify({ ...routes, peers: [{ playerId: "player-2", send: true }] })), /fields/);
  assert.throws(() => decodeServerMessage(JSON.stringify({ ...routes, peers: [{ playerId: "p", send: "yes", receive: true }] })));
  const signal = { version: 1, type: "voice_signal", fromPlayerId: "player-1", kind: "answer", data: "{\"cid\":\"a\"}" };
  assert.deepEqual(decodeServerMessage(JSON.stringify(signal)), signal);
  assert.throws(() => decodeServerMessage(JSON.stringify({ ...signal, kind: "bye" })), /voice signal kind/);
});

test("relayed voice frames carry one base64 packet to 1–9 named peers", async () => {
  const { voiceFrame } = await import("../dist/protocol.js");
  const { toBase64, fromBase64 } = await import("../dist/voice-relay.js");
  const packet = new Uint8Array([0, 1, 127, 128, 254, 255, 42]);
  assert.deepEqual([...fromBase64(toBase64(packet))], [...packet]);
  assert.deepEqual(voiceFrame(["player-2"], toBase64(packet)),
    { version: 1, type: "voice_frame", targetPlayerIds: ["player-2"], data: toBase64(packet) });
  assert.throws(() => voiceFrame([], "AAAA"), /targets/);
  assert.throws(() => voiceFrame(["player-2"], "not base64!"), /base64/);
  const relayed = { version: 1, type: "voice_frame", fromPlayerId: "player-1", data: "T3B1cw==" };
  assert.deepEqual(decodeServerMessage(JSON.stringify(relayed)), relayed);
  assert.throws(() => decodeServerMessage(JSON.stringify({ ...relayed, data: "%%" })), /base64/);
});

test("voice reaches its listener at once and never waits in the frame inbox", () => {
  const listeners = [];
  const socket = { send() {}, addEventListener: (type, listener) => listeners.push(listener) };
  const inbox = new NetworkInbox();
  const voice = [];
  new GameTransport(socket, inbox, undefined, undefined, undefined, message => voice.push(message));
  const deliver = message => listeners.forEach(listener => listener({ data: JSON.stringify(message) }));
  deliver({ version: 1, type: "voice_routes", peers: [] });
  deliver({ version: 1, type: "pong" });
  assert.deepEqual(voice.map(message => message.type), ["voice_routes"]);
  assert.deepEqual(inbox.drain().map(entry => entry.event.type), ["pong"]);
});

test("hearing reaches no further than the shortest Vision", () => {
  assert.ok(HEARING_RANGE < Math.min(...Object.values(VISION)), "a voice must never reveal a Player out of sight");
});

test("a voice fades smoothly with distance and pans toward the speaker's side", () => {
  const me = { x: 1_000, y: 1_000 };
  assert.deepEqual(proximityMix(me, { x: 1_040, y: 1_000 }).gain, 1);
  const half = proximityMix(me, { x: 1_000 + HEARING_RANGE * 0.675, y: 1_000 });
  assert.ok(Math.abs(half.gain - 0.5) < 0.01, `halfway through the fade is half volume, got ${half.gain}`);
  assert.equal(proximityMix(me, { x: 1_000, y: 1_000 + HEARING_RANGE }).gain, 0);
  assert.ok(proximityMix(me, { x: 1_200, y: 1_000 }).pan > 0, "a speaker to the right plays on the right");
  assert.ok(proximityMix(me, { x: 800, y: 1_000 }).pan < 0);
  let previous = 1;
  for (let distance = 0; distance <= HEARING_RANGE; distance += 5) {
    const { gain } = proximityMix(me, { x: 1_000 + distance, y: 1_000 });
    assert.ok(gain <= previous + 1e-9, "the fade never gets louder further away");
    previous = gain;
  }
  // A speaker this client cannot see is silent; Ghosts hear Ghosts at full volume anywhere.
  assert.equal(proximityMix(me, null).gain, 0);
  assert.equal(proximityMix(me, { x: 2_400, y: 100 }, true).gain, 1);
});

test("exactly one of two peers makes the offer", () => {
  assert.equal(isOfferer("player-1", "player-2"), true);
  assert.equal(isOfferer("player-2", "player-1"), false);
});

const OFFER = [
  "v=0", "o=- 1 2 IN IP4 127.0.0.1", "s=-", "t=0 0", "m=audio 9 UDP/TLS/RTP/SAVPF 111 63", "c=IN IP4 0.0.0.0",
  "a=rtpmap:111 opus/48000/2", "a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1", "a=rtpmap:63 red/48000/2", ""
].join("\r\n");

test("Opus is asked for crisp, low-latency mono speech without clipped onsets", () => {
  const tuned = tuneOpus(OFFER);
  const fmtp = tuned.split("\r\n").find(line => line.startsWith("a=fmtp:111 "));
  const params = Object.fromEntries(fmtp.slice("a=fmtp:111 ".length).split(";").map(part => part.split("=")));
  assert.equal(params.useinbandfec, "1");
  assert.equal(params.usedtx, "0", "discontinuous transmission clips the first syllable");
  assert.equal(params.stereo, "0");
  assert.equal(params.maxaveragebitrate, String(VOICE_BITRATE));
  assert.equal(params.maxplaybackrate, "48000");
  assert.equal(tuned.split("a=fmtp:111").length, 2, "one fmtp line, not two");
  assert.ok(tuned.endsWith("\r\n") && !tuned.includes("\n\n") && !/[^\r]\n/.test(tuned), "line endings stay CRLF");
  assert.equal(tuneOpus(tuned), tuned, "tuning twice changes nothing");

  const bare = OFFER.replace("a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1\r\n", "");
  const added = tuneOpus(bare).split("\r\n");
  assert.equal(added[added.indexOf("a=rtpmap:111 opus/48000/2") + 1].startsWith("a=fmtp:111 "), true);
  assert.equal(tuneOpus("v=0\r\nm=video 9 RTP 96\r\n"), "v=0\r\nm=video 9 RTP 96\r\n", "no Opus, nothing to tune");
});
