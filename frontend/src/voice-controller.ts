import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";
import { AudioMixer } from "./audio-mixer.js";
import type { VoiceState } from "./protocol.js";
import type { WorldState } from "./world-state.js";
import { ReconnectingGameClient } from "./reconnecting-game-client.js";

/** Transport callbacks only change local media/status; render publishes status at a frame. */
export class VoiceController {
  readonly #root = document.createElement("div");
  readonly #join = document.createElement("button");
  readonly #mute = document.createElement("button");
  readonly #leave = document.createElement("button");
  readonly #status = document.createElement("span");
  readonly #sources = new Map<RemoteTrack, MediaStreamAudioSourceNode>();
  readonly #decoders = new Map<RemoteTrack, HTMLMediaElement>();
  #room: Room | null = null;
  #generation = 0;
  #round: number | null = null;
  #text = "Voice opens during Townhall";
  #muted = true;
  #busy = false;
  #canPublish = false;

  constructor(private readonly client: ReconnectingGameClient, private readonly mixer: AudioMixer,
              private readonly gameUrl: string) {
    this.#root.className = "voice-controls";
    this.#root.setAttribute("aria-label", "Voice controls");
    this.#join.type = this.#mute.type = this.#leave.type = "button";
    this.#join.textContent = "Join voice";
    this.#leave.textContent = "Leave voice";
    this.#status.setAttribute("role", "status");
    this.#root.append(this.#join, this.#mute, this.#leave, this.#status);
    document.body.append(this.#root);
    this.#join.addEventListener("click", () => {
      if (this.#round === null) return;
      void this.mixer.context.resume().catch(() => {});
      this.#busy = true; this.#text = "Joining voice…";
      this.client.joinVoice(this.#round);
    });
    this.#mute.addEventListener("click", () => { void this.toggleMicrophone(); });
    this.#leave.addEventListener("click", () => {
      this.client.leaveVoice(); this.disconnect(); this.#text = "Voice left";
    });
    this.client.onVoiceState = state => { void this.applyGrant(state); };
  }

  private async applyGrant(state: VoiceState): Promise<void> {
    this.disconnect();
    if (state.token === null || state.url === null) { this.#text = "Voice access ended"; return; }
    this.#canPublish = state.canPublish;
    const generation = this.#generation;
    const room = new Room(); this.#room = room;
    this.#busy = true; this.#text = "Joining voice…";
    room.on(RoomEvent.TrackSubscribed, track => {
      if (generation !== this.#generation || track.kind !== Track.Kind.Audio) return;
      // Chromium needs a playing media element to pull decoded remote WebRTC
      // audio. Its output stays muted; audible output uses our saved volume bus.
      const decoder = document.createElement("audio"); decoder.muted = true; decoder.hidden = true;
      track.attach(decoder); this.#root.append(decoder); this.#decoders.set(track, decoder);
      const source = this.mixer.context.createMediaStreamSource(decoder.srcObject as MediaStream);
      source.connect(this.mixer.channel("voice")); this.#sources.set(track, source);
    });
    room.on(RoomEvent.TrackUnsubscribed, track => {
      this.#sources.get(track)?.disconnect(); this.#sources.delete(track);
      const decoder = this.#decoders.get(track);
      if (decoder) { track.detach(decoder); decoder.remove(); this.#decoders.delete(track); }
    });
    room.on(RoomEvent.Disconnected, () => {
      if (generation !== this.#generation) return;
      this.disconnect(); this.#text = "Voice disconnected; text is still available";
    });
    try {
      const url = new URL(state.url, this.gameUrl);
      await room.connect(url.toString(), state.token);
      if (generation !== this.#generation) { await room.disconnect(); return; }
      this.#busy = false; this.#text = this.#canPublish ? "Listening · microphone muted" : "Listening only · eliminated";
    } catch {
      if (generation !== this.#generation) return;
      this.disconnect(); this.#text = "Voice unavailable; continue with text";
    }
  }

  private async toggleMicrophone(): Promise<void> {
    const room = this.#room;
    if (!room || this.#busy || !this.#canPublish) return;
    const generation = this.#generation;
    this.#busy = true;
    try {
      await room.localParticipant.setMicrophoneEnabled(this.#muted);
      if (generation !== this.#generation) return;
      this.#muted = !this.#muted;
      this.#text = this.#muted ? "Listening · microphone muted" : "Microphone on";
    } catch {
      if (generation === this.#generation) this.#text = "Microphone unavailable; you can still listen and use text";
    } finally { if (generation === this.#generation) this.#busy = false; }
  }

  private disconnect(): void {
    ++this.#generation;
    const room = this.#room; this.#room = null;
    room?.removeAllListeners(); if (room) void room.disconnect().catch(() => {});
    for (const source of this.#sources.values()) source.disconnect();
    for (const [track, decoder] of this.#decoders) { track.detach(decoder); decoder.remove(); }
    this.#decoders.clear();
    this.#sources.clear(); this.#busy = false; this.#muted = true; this.#canPublish = false;
  }

  render(world: WorldState | undefined): void {
    this.#root.hidden = !world?.game;
    const game = world?.game;
    this.#round = game && game.self.status !== "left" && (game.phase === "discussion" || game.phase === "voting") ? game.round : null;
    if (world?.lastError && ["voice_unavailable", "invalid_phase"].includes(world.lastError.code) && this.#busy && !this.#room) {
      this.#busy = false; this.#text = world.lastError.message;
    }
    this.#join.hidden = this.#room !== null;
    this.#join.disabled = this.#round === null || this.#busy;
    this.#mute.hidden = this.#leave.hidden = this.#room === null;
    this.#mute.disabled = this.#busy || !this.#canPublish;
    this.#mute.textContent = this.#muted ? "Unmute microphone" : "Mute microphone";
    this.#status.textContent = this.#text;
  }

  destroy(): void { this.client.onVoiceState = () => {}; this.disconnect(); this.#root.remove(); }
}
