import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";
import { MicrophoneSettings } from "./microphone-settings.js";
import { visibleSpeakers } from "./voice-activity.js";
import { AudioMixer } from "./audio-mixer.js";
import type { VoicePeer, VoiceState } from "./protocol.js";
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
  readonly #speakers = new Map<Room, ReadonlySet<string>>();
  readonly #roomTracks = new Map<Room, Set<RemoteTrack>>();
  readonly #peers = new Map<string, { token: string; room: Room; gain: GainNode }>();
  #room: Room | null = null;
  #generation = 0;
  #round: number | null = null;
  #text = "Voice opens during Day and Townhall";
  #muted = true;
  #busy = false;
  #canPublish = false;
  #captureChanges: Promise<void> = Promise.resolve();
  readonly #unsubscribeMicrophone: () => void;

  constructor(private readonly client: ReconnectingGameClient, private readonly mixer: AudioMixer,
              private readonly gameUrl: string, private readonly microphone: MicrophoneSettings) {
    this.#unsubscribeMicrophone = microphone.subscribe(() => this.updateMicrophone());
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
    this.client.onVoicePeers = peers => { this.applyPeers(peers); };
  }

  private async applyGrant(state: VoiceState): Promise<void> {
    this.disconnect();
    if (state.token === null || state.url === null) { this.#text = "Voice access ended"; return; }
    this.#canPublish = state.canPublish;
    const generation = this.#generation;
    const room = new Room(); this.#room = room;
    this.#busy = true; this.#text = "Joining voice…";
    this.attachAudio(room, generation, this.mixer.channel("voice"));
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

  private attachAudio(room: Room, generation: number, output: GainNode): void {
    const tracks = new Set<RemoteTrack>(); this.#roomTracks.set(room, tracks);
    room.on(RoomEvent.ActiveSpeakersChanged, participants => {
      this.#speakers.set(room, new Set(participants.filter(p => p === room.localParticipant
        ? this.#canPublish && p.isMicrophoneEnabled
        : [...p.audioTrackPublications.values()].some(t => t.isSubscribed && !t.isMuted))
        .map(p => p.name).filter((id): id is string => Boolean(id))));
    });
    room.on(RoomEvent.TrackSubscribed, track => {
      if (generation !== this.#generation || track.kind !== Track.Kind.Audio) return;
      // Chromium needs a playing media element to pull decoded remote WebRTC
      // audio. Its output stays muted; audible output uses our saved volume bus.
      const decoder = document.createElement("audio"); decoder.muted = true; decoder.hidden = true;
      track.attach(decoder); this.#root.append(decoder); this.#decoders.set(track, decoder);
      const source = this.mixer.context.createMediaStreamSource(decoder.srcObject as MediaStream);
      source.connect(output); this.#sources.set(track, source); tracks.add(track);
    });
    room.on(RoomEvent.TrackMuted, (_publication, participant) => {
      this.#speakers.set(room, new Set([...this.#speakers.get(room) ?? []].filter(id => id !== participant.name)));
    });
    room.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
      this.#speakers.set(room, new Set([...this.#speakers.get(room) ?? []].filter(id => id !== participant.name)));
      this.removeTrack(track); tracks.delete(track);
    });
  }

  private removeTrack(track: RemoteTrack): void {
    this.#sources.get(track)?.disconnect(); this.#sources.delete(track);
    const decoder = this.#decoders.get(track);
    if (decoder) { track.detach(decoder); decoder.remove(); this.#decoders.delete(track); }
  }

  private closeRoom(room: Room): void {
    room.removeAllListeners();
    for (const track of this.#roomTracks.get(room) ?? []) this.removeTrack(track);
    this.#roomTracks.delete(room); this.#speakers.delete(room);
    void room.disconnect().catch(() => {});
  }

  private applyPeers(peers: readonly VoicePeer[]): void {
    if (!this.#room) return;
    const wanted = new Set(peers.map(peer => peer.playerId));
    for (const [id, entry] of this.#peers) if (!wanted.has(id)) {
      this.closeRoom(entry.room); entry.gain.disconnect(); this.#peers.delete(id);
    }
    for (const peer of peers) {
      const old = this.#peers.get(peer.playerId);
      if (old?.token === peer.token) {
        old.gain.gain.setTargetAtTime(peer.gain, this.mixer.context.currentTime, 0.08); continue;
      }
      if (old) { this.closeRoom(old.room); old.gain.disconnect(); }
      const room = new Room();
      const gain = this.mixer.context.createGain(); gain.gain.value = peer.gain;
      gain.connect(this.mixer.channel("voice"));
      const entry = { token: peer.token, room, gain }; this.#peers.set(peer.playerId, entry);
      const generation = this.#generation;
      this.attachAudio(room, generation, gain);
      void room.connect(new URL("/voice", this.gameUrl).toString(), peer.token).then(() => {
        if (generation !== this.#generation || this.#peers.get(peer.playerId) !== entry) this.closeRoom(room);
      }).catch(() => {
        if (generation !== this.#generation || this.#peers.get(peer.playerId) !== entry) return;
        this.closeRoom(room); gain.disconnect(); this.#peers.delete(peer.playerId);
        this.#text = "Nearby voice unavailable; text is still available";
      });
    }
  }

  private async toggleMicrophone(): Promise<void> {
    if (!this.#room || this.#busy || !this.#canPublish) return;
    this.#muted = !this.#muted;
    await this.updateMicrophone();
  }

  private updateMicrophone(): Promise<void> {
    const room = this.#room, generation = this.#generation;
    const update = async () => {
      if (!room || generation !== this.#generation || !this.#canPublish) return;
      this.#busy = true;
      try {
        const enabled = !this.#muted && !this.microphone.testing;
        if (!enabled) {
          await room.localParticipant.setMicrophoneEnabled(false);
          this.#speakers.set(room, new Set([...this.#speakers.get(room) ?? []].filter(id => id !== room.localParticipant.name)));
        } else {
          const options = await this.microphone.captureOptions();
          if (generation !== this.#generation) return;
          await room.localParticipant.setMicrophoneEnabled(true, options);
          const publication = [...room.localParticipant.audioTrackPublications.values()][0];
          await publication?.track?.restartTrack(options);
        }
        if (generation === this.#generation) this.#text = enabled ? "Microphone on" : "Listening · microphone muted";
      } catch (error) {
        if (this.microphone.testing) throw error;
        if (generation === this.#generation) { this.#muted = true; this.#text = "Microphone unavailable; you can still listen and use text"; }
      } finally { if (generation === this.#generation) this.#busy = false; }
    };
    this.#captureChanges = this.#captureChanges.then(update, update);
    return this.#captureChanges;
  }

  private disconnect(): void {
    ++this.#generation;
    const room = this.#room; this.#room = null;
    if (room) this.closeRoom(room);
    for (const peer of this.#peers.values()) { this.closeRoom(peer.room); peer.gain.disconnect(); }
    this.#peers.clear();
    for (const source of this.#sources.values()) source.disconnect();
    for (const [track, decoder] of this.#decoders) { track.detach(decoder); decoder.remove(); }
    this.#decoders.clear();
    this.#sources.clear(); this.#busy = false; this.#muted = true; this.#canPublish = false;
  }

  render(world: WorldState | undefined): ReadonlySet<string> {
    this.#root.hidden = !world?.game;
    const game = world?.game;
    this.#round = game && game.self.status !== "left" && (game.phase === "discussion" || game.phase === "voting" || game.phase === "day" && game.self.status === "living") ? game.round : null;
    if (world?.lastError && ["voice_unavailable", "invalid_phase"].includes(world.lastError.code) && this.#busy && !this.#room) {
      this.#busy = false; this.#text = world.lastError.message;
    }
    this.#join.hidden = this.#room !== null;
    this.#join.disabled = this.#round === null || this.#busy;
    this.#mute.hidden = this.#leave.hidden = this.#room === null;
    this.#mute.disabled = this.#busy || !this.#canPublish;
    this.#mute.textContent = this.#muted ? "Unmute microphone" : "Mute microphone";
    this.#status.textContent = this.#text;
    return visibleSpeakers(world, new Set([...this.#speakers.values()].flatMap(ids => [...ids])));
  }

  destroy(): void { this.#unsubscribeMicrophone(); this.client.onVoiceState = () => {}; this.client.onVoicePeers = () => {}; this.disconnect(); this.#root.remove(); }
}
