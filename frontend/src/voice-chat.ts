import { setVoice, voiceFrame, voiceSignal, type VoicePeer, type VoiceSignalKind } from "./protocol.js";
import type { ReconnectingGameClient, VoiceEvent } from "./reconnecting-game-client.js";
import { HEARING_RANGE } from "./room-rules.js";
import { VOICE_SAMPLE_RATE, VoiceRelay } from "./voice-relay.js";

/**
 * Proximity voice. Audio flows browser to browser over WebRTC; the game socket only carries
 * negotiation. The server decides every route (ADR 0016): this client sends its voice only to
 * the peers its routes allow, and plays only the ones it may hear. A peer it cannot reach
 * directly is served through the server instead (voice-relay.ts) until a direct link connects.
 */

/** Opus at this rate is transparent for speech; it costs about 0.6 Mbit/s with nine peers. */
export const VOICE_BITRATE = 64_000;

const STORAGE_KEY = "pu-town.voice";

/**
 * Asks the other side's encoder for crisp, low-latency mono speech: full-band, in-band
 * forward error correction for lost packets, and no discontinuous transmission, which
 * clips the first syllable after a pause.
 */
export function tuneOpus(sdp: string): string {
  const opus = /^a=rtpmap:(\d+) opus\/48000\/2$/im.exec(sdp);
  if (!opus) return sdp;
  const payload = opus[1];
  const wanted: Readonly<Record<string, string>> = {
    minptime: "10", useinbandfec: "1", usedtx: "0", stereo: "0", "sprop-stereo": "0",
    maxaveragebitrate: String(VOICE_BITRATE), maxplaybackrate: "48000"
  };
  const fmtp = new RegExp(`^a=fmtp:${payload} (.*)$`, "m");
  const existing = fmtp.exec(sdp);
  const params = new Map<string, string>();
  for (const part of existing?.[1]?.split(";") ?? []) {
    const [key, value = ""] = part.trim().split("=");
    if (key) params.set(key, value);
  }
  for (const [key, value] of Object.entries(wanted)) params.set(key, value);
  const line = `a=fmtp:${payload} ${[...params].map(([key, value]) => `${key}=${value}`).join(";")}`;
  if (existing) return sdp.replace(fmtp, line);
  return sdp.replace(opus[0], `${opus[0]}\r\n${line}`);
}

/** How loud a speaker plays, and from which side. */
export type Hearing = Readonly<{ gain: number; pan: number }>;
export const FULL_VOLUME: Hearing = { gain: 1, pan: 0 };
const SILENT: Hearing = { gain: 0, pan: 0 };
/** Within this share of the hearing range a voice is at full volume. */
const NEAR = 0.35;

/**
 * Proximity in the Roam: full volume up close, fading smoothly to nothing at the edge of the
 * hearing range, and panned toward the side the speaker stands on. Ghosts hear each other
 * across the town at full volume. Outside the Roam everyone is at the same table.
 */
export function proximityMix(
  listener: Readonly<{ x: number; y: number }> | null,
  speaker: Readonly<{ x: number; y: number }> | null,
  ghosts = false
): Hearing {
  if (!listener || !speaker) return SILENT;
  const dx = speaker.x - listener.x;
  const pan = Math.max(-1, Math.min(1, dx / HEARING_RANGE)) * 0.7;
  if (ghosts) return { gain: 1, pan };
  const distance = Math.hypot(dx, speaker.y - listener.y);
  if (distance >= HEARING_RANGE) return SILENT;
  const fade = Math.max(0, (distance - NEAR * HEARING_RANGE) / ((1 - NEAR) * HEARING_RANGE));
  return { gain: 0.5 * (1 + Math.cos(Math.PI * fade)), pan };
}

/** Whoever has the smaller Player ID makes the offer, so two peers never both do. */
export function isOfferer(selfPlayerId: string, peerPlayerId: string): boolean {
  return selfPlayerId < peerPlayerId;
}

const ICE: RTCConfiguration = {
  // Same-network play needs no server at all; STUN only helps a shared link across networks.
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require"
};

const MICROPHONE: MediaTrackConstraints = {
  echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 48_000
};

type Peer = {
  readonly id: string;
  readonly offerer: boolean;
  route: VoicePeer;
  pc: RTCPeerConnection | null;
  /** The negotiation this pc belongs to; signals for any other one are stale. */
  cid: string;
  transceiver: RTCRtpTransceiver | null;
  sentTrack: MediaStreamTrack | null;
  /** Signals are applied one at a time, in arrival order. */
  chain: Promise<void>;
  element: HTMLAudioElement | null;
  source: MediaStreamAudioSourceNode | null;
  /** Where both the direct and the relayed audio enter: feeds the volume and the level meter. */
  readonly input: GainNode;
  readonly gain: GainNode;
  readonly panner: StereoPannerNode;
  readonly analyser: AnalyserNode;
  restartTimer: number | undefined;
};

/** How this client currently hears a peer. */
export type VoiceLink = "direct" | "relayed" | "connecting";

export type VoiceStatus = Readonly<{
  wanted: boolean;
  /** This connection is in voice and its routes are being followed. */
  joined: boolean;
  microphone: "off" | "live" | "unavailable";
  muted: boolean;
  problem: string | null;
}>;

export class VoiceChat {
  readonly #peers = new Map<string, Peer>();
  #context: AudioContext | null = null;
  #stream: MediaStream | null = null;
  #localAnalyser: AnalyserNode | null = null;
  #self: string | null = null;
  #available = false;
  #wanted = false;
  #joined = false;
  #muted = false;
  #problem: string | null = null;
  #microphone: VoiceStatus["microphone"] = "off";
  #starting: Promise<void> | null = null;
  #relay: VoiceRelay | null = null;
  #relayChecked = false;
  readonly #samples = new Float32Array(512);
  readonly #resume = () => { void this.#context?.resume(); };

  constructor(private readonly client: ReconnectingGameClient, private readonly storage?: Pick<Storage, "getItem" | "setItem">) {
    try { this.#wanted = storage?.getItem(STORAGE_KEY) === "on"; } catch { /* Not remembered. */ }
    client.onVoice = event => this.handle(event);
    // An AudioContext made without a gesture starts suspended; any later gesture wakes it.
    window.addEventListener("pointerdown", this.#resume);
    window.addEventListener("keydown", this.#resume);
  }

  get status(): VoiceStatus {
    return { wanted: this.#wanted, joined: this.#joined, microphone: this.#microphone, muted: this.#muted, problem: this.#problem };
  }

  /** Called from a click, which lets the browser start audio and ask for the microphone. */
  async enable(): Promise<void> {
    this.#wanted = true;
    this.remember();
    await this.start();
  }

  disable(): void {
    this.#wanted = false;
    this.remember();
    if (this.#joined) this.client.sendVoice(setVoice(false));
    this.#joined = false;
    this.closeAllPeers();
    this.#relay?.stopCapture();
    for (const track of this.#stream?.getTracks() ?? []) track.stop();
    this.#stream = null;
    this.#localAnalyser = null;
    this.#microphone = "off";
    this.#problem = null;
  }

  toggleMute(): void {
    this.#muted = !this.#muted;
    for (const track of this.#stream?.getAudioTracks() ?? []) track.enabled = !this.#muted;
    this.updateRelaySending();
  }

  /** Socket events arrive here directly, never through the frame boundary. */
  handle(event: VoiceEvent): void {
    switch (event.type) {
      case "voice_available":
        // A new connection: the server knows none of our old peer connections.
        this.closeAllPeers();
        this.#joined = false;
        this.#self = event.selfPlayerId;
        this.#available = true;
        if (this.#wanted) void this.start();
        return;
      case "voice_unavailable":
        this.#available = false;
        this.#joined = false;
        this.closeAllPeers();
        return;
      case "voice_routes":
        if (!this.#joined) return;
        this.applyRoutes(event.peers);
        return;
      case "voice_signal": {
        if (!this.#joined) return;
        const peer = this.peerFor(event.fromPlayerId);
        peer.chain = peer.chain.then(() => this.applySignal(peer, event.kind, event.data)).catch(() => undefined);
        return;
      }
      case "voice_frame": {
        // The server relays only what this client may hear; a direct link, once up, wins.
        const peer = this.#peers.get(event.fromPlayerId);
        if (!this.#joined || !peer || !peer.route.receive || this.isDirect(peer)) return;
        try { this.#relay?.receive(peer.id, event.data, peer.input); } catch { /* One lost packet. */ }
      }
    }
  }

  /** Called every frame with how loud each peer should play right now. */
  mix(hearingOf: (playerId: string) => Hearing): void {
    const context = this.#context;
    if (!context) return;
    for (const peer of this.#peers.values()) {
      // Defence in depth: a voice this client may not hear is never played, whatever arrives.
      const target = peer.route.receive ? hearingOf(peer.id) : SILENT;
      peer.gain.gain.setTargetAtTime(target.gain, context.currentTime, peer.route.receive ? 0.04 : 0.005);
      peer.panner.pan.setTargetAtTime(target.pan, context.currentTime, 0.04);
    }
  }

  /** The peers this client can hear right now, how, and how loudly each is speaking (0–1). */
  audible(): readonly Readonly<{ playerId: string; level: number; link: VoiceLink }>[] {
    this.updateRelaySending();
    const audible: { playerId: string; level: number; link: VoiceLink }[] = [];
    for (const peer of this.#peers.values()) {
      if (!peer.route.receive || peer.gain.gain.value < 0.02) continue;
      audible.push({
        playerId: peer.id, level: this.levelOf(peer.analyser) * Math.min(1, peer.gain.gain.value * 1.5), link: this.linkOf(peer)
      });
    }
    return audible;
  }

  private linkOf(peer: Peer): VoiceLink {
    if (this.isDirect(peer) && peer.source) return "direct";
    return this.#relay?.heardRecently(peer.id) ? "relayed" : "connecting";
  }

  private isDirect(peer: Peer): boolean {
    return peer.pc?.connectionState === "connected";
  }

  /** The peers this client may talk to but has no direct link with: they get relayed packets. */
  private relayTargets(): string[] {
    if (this.#muted) return [];
    const targets: string[] = [];
    for (const peer of this.#peers.values()) if (peer.route.send && !this.isDirect(peer)) targets.push(peer.id);
    return targets;
  }

  private updateRelaySending(): void {
    this.#relay?.setSending(this.#stream !== null && this.relayTargets().length > 0);
  }

  /** How loudly this Player is speaking into their own microphone (0–1). */
  ownLevel(): number {
    return this.#localAnalyser && !this.#muted ? this.levelOf(this.#localAnalyser) : 0;
  }

  destroy(): void {
    window.removeEventListener("pointerdown", this.#resume);
    window.removeEventListener("keydown", this.#resume);
    this.closeAllPeers();
    this.#relay?.destroy();
    for (const track of this.#stream?.getTracks() ?? []) track.stop();
    void this.#context?.close();
  }

  private remember(): void {
    try { this.storage?.setItem(STORAGE_KEY, this.#wanted ? "on" : "off"); } catch { /* Not remembered. */ }
  }

  private start(): Promise<void> {
    this.#starting ??= this.startOnce().finally(() => { this.#starting = null; });
    return this.#starting;
  }

  private async startOnce(): Promise<void> {
    this.#context ??= new AudioContext({ latencyHint: "interactive", sampleRate: VOICE_SAMPLE_RATE });
    void this.#context.resume();
    if (!this.#relayChecked) {
      this.#relayChecked = true;
      this.#relay = await VoiceRelay.create(this.#context);
    }
    if (!this.#stream) await this.openMicrophone();
    if (!this.#wanted || !this.#available || this.#joined) return;
    this.#joined = true;
    this.client.sendVoice(setVoice(true));
  }

  private async openMicrophone(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.#microphone = "unavailable";
      this.#problem = window.isSecureContext
        ? "This browser has no microphone access. You can still listen."
        : "Microphones need a secure page (https://). You can still listen.";
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: MICROPHONE });
      if (!this.#wanted) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      this.#stream = stream;
      for (const track of stream.getAudioTracks()) {
        track.enabled = !this.#muted;
        // Tells the browser to favour speech clarity over music fidelity.
        track.contentHint = "speech";
      }
      if (this.#context) {
        this.#localAnalyser = this.#context.createAnalyser();
        this.#localAnalyser.fftSize = this.#samples.length;
        this.#context.createMediaStreamSource(stream).connect(this.#localAnalyser);
      }
      this.#microphone = "live";
      this.#problem = null;
      for (const peer of this.#peers.values()) this.applySending(peer);
      this.#relay?.startCapture(stream, () => this.relayTargets(), (targets, data) => {
        try { this.client.sendVoice(voiceFrame(targets, data)); } catch { /* An oversized packet is dropped. */ }
      });
      this.updateRelaySending();
    } catch (error) {
      this.#microphone = "unavailable";
      this.#problem = error instanceof DOMException && error.name === "NotAllowedError"
        ? "Microphone blocked. Allow it in the address bar to talk; you can still listen."
        : "No microphone found. You can still listen.";
    }
  }

  private applyRoutes(routes: readonly VoicePeer[]): void {
    const listed = new Set(routes.map(route => route.playerId));
    for (const [id, peer] of this.#peers) if (!listed.has(id)) this.closePeer(peer);
    for (const route of routes) {
      const peer = this.peerFor(route.playerId);
      peer.route = route;
      // Stop or start sending at once: a route that closed must not carry another syllable.
      this.applySending(peer);
      if (peer.offerer && !peer.pc) this.negotiate(peer);
    }
    this.updateRelaySending();
  }

  private peerFor(id: string): Peer {
    const existing = this.#peers.get(id);
    if (existing) return existing;
    const context = this.#context ?? new AudioContext({ latencyHint: "interactive", sampleRate: VOICE_SAMPLE_RATE });
    this.#context = context;
    const peer: Peer = {
      id, offerer: isOfferer(this.#self ?? "", id),
      route: { playerId: id, send: false, receive: false },
      pc: null, cid: "", transceiver: null, sentTrack: null, chain: Promise.resolve(),
      element: null, source: null, input: context.createGain(),
      gain: context.createGain(), panner: context.createStereoPanner(), analyser: context.createAnalyser(),
      restartTimer: undefined
    };
    peer.gain.gain.value = 0;
    peer.analyser.fftSize = this.#samples.length;
    this.connectNodes(peer);
    this.#peers.set(id, peer);
    return peer;
  }

  private connectNodes(peer: Peer): void {
    if (!this.#context) return;
    peer.input.connect(peer.gain);
    peer.input.connect(peer.analyser);
    peer.gain.connect(peer.panner).connect(this.#context.destination);
  }

  /** The offerer opens a fresh connection; the answerer follows its offer. */
  private negotiate(peer: Peer): void {
    // crypto.randomUUID exists only on secure pages, and listening works without one.
    const pc = this.openConnection(peer, `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
    peer.transceiver = pc.addTransceiver("audio", { direction: "sendrecv" });
    this.applySending(peer);
    peer.chain = peer.chain.then(async () => {
      const offer = await pc.createOffer();
      await this.setLocal(pc, offer);
      this.signal(peer, "offer", { cid: peer.cid, sdp: pc.localDescription?.sdp });
      this.tuneSender(peer);
    }).catch(() => this.scheduleRestart(peer, 1_000));
  }

  private openConnection(peer: Peer, cid: string): RTCPeerConnection {
    this.closeConnection(peer);
    const pc = new RTCPeerConnection(ICE);
    peer.pc = pc;
    peer.cid = cid;
    pc.addEventListener("icecandidate", event => {
      if (event.candidate && peer.pc === pc) this.signal(peer, "candidate", { cid, candidate: event.candidate.toJSON() });
    });
    pc.addEventListener("track", event => {
      if (peer.pc === pc) this.attach(peer, event.streams[0] ?? new MediaStream([event.track]));
    });
    pc.addEventListener("connectionstatechange", () => {
      if (peer.pc !== pc) return;
      // Whether this peer needs relayed packets changes with the direct link.
      this.updateRelaySending();
      if (pc.connectionState === "failed") this.scheduleRestart(peer, 0);
      else if (pc.connectionState === "disconnected") this.scheduleRestart(peer, 3_000);
      else if (pc.connectionState === "connected") window.clearTimeout(peer.restartTimer);
    });
    return pc;
  }

  /** A connection that drops is renegotiated from scratch by its offerer. */
  private scheduleRestart(peer: Peer, delay: number): void {
    if (!peer.offerer) return;
    window.clearTimeout(peer.restartTimer);
    peer.restartTimer = window.setTimeout(() => {
      const state = peer.pc?.connectionState;
      if (this.#peers.get(peer.id) === peer && this.#joined && state !== "connected" && state !== "connecting") this.negotiate(peer);
    }, delay);
  }

  private async applySignal(peer: Peer, kind: VoiceSignalKind, data: string): Promise<void> {
    const signal = JSON.parse(data) as { cid?: unknown; sdp?: unknown; candidate?: unknown };
    if (typeof signal.cid !== "string") return;
    if (kind === "offer") {
      if (peer.offerer || typeof signal.sdp !== "string") return;
      const pc = this.openConnection(peer, signal.cid);
      await pc.setRemoteDescription({ type: "offer", sdp: tuneOpus(signal.sdp) });
      peer.transceiver = pc.getTransceivers()[0] ?? null;
      if (peer.transceiver) peer.transceiver.direction = "sendrecv";
      this.applySending(peer);
      await this.setLocal(pc, await pc.createAnswer());
      this.signal(peer, "answer", { cid: signal.cid, sdp: pc.localDescription?.sdp });
      this.tuneSender(peer);
      return;
    }
    const pc = peer.pc;
    if (!pc || signal.cid !== peer.cid) return;
    if (kind === "answer") {
      if (peer.offerer && typeof signal.sdp === "string" && pc.signalingState === "have-local-offer") {
        await pc.setRemoteDescription({ type: "answer", sdp: tuneOpus(signal.sdp) });
      }
    } else if (signal.candidate && typeof signal.candidate === "object") {
      await pc.addIceCandidate(signal.candidate as RTCIceCandidateInit).catch(() => undefined);
    }
  }

  private async setLocal(pc: RTCPeerConnection, description: RTCSessionDescriptionInit): Promise<void> {
    try { await pc.setLocalDescription({ type: description.type, sdp: tuneOpus(description.sdp ?? "") }); }
    catch { await pc.setLocalDescription(description); }
  }

  /** The encoder's own ceiling and priority, so voice wins over anything else on the link. */
  private tuneSender(peer: Peer): void {
    const sender = peer.transceiver?.sender;
    if (!sender) return;
    try {
      const parameters = sender.getParameters();
      const encoding = parameters.encodings?.[0] as (RTCRtpEncodingParameters & { priority?: string; networkPriority?: string }) | undefined;
      if (!encoding) return;
      encoding.maxBitrate = VOICE_BITRATE;
      encoding.priority = "high";
      encoding.networkPriority = "high";
      void sender.setParameters(parameters).catch(() => undefined);
    } catch { /* Defaults still work. */ }
  }

  private applySending(peer: Peer): void {
    const track = this.#stream?.getAudioTracks()[0] ?? null;
    const wanted = peer.route.send ? track : null;
    if (!peer.transceiver || peer.sentTrack === wanted) return;
    peer.sentTrack = wanted;
    void peer.transceiver.sender.replaceTrack(wanted).catch(() => undefined);
  }

  private attach(peer: Peer, stream: MediaStream): void {
    const context = this.#context;
    if (!context) return;
    peer.source?.disconnect();
    peer.element?.remove();
    // Chrome plays a remote WebRTC stream through Web Audio only while a media element
    // holds it too; the element itself stays muted.
    const element = new Audio();
    element.muted = true;
    element.srcObject = stream;
    void element.play().catch(() => undefined);
    peer.element = element;
    peer.source = context.createMediaStreamSource(stream);
    peer.source.connect(peer.input);
  }

  private signal(peer: Peer, kind: VoiceSignalKind, payload: unknown): void {
    const data = JSON.stringify(payload);
    try { this.client.sendVoice(voiceSignal(peer.id, kind, data)); } catch { /* An oversized signal is dropped. */ }
  }

  private closeConnection(peer: Peer): void {
    window.clearTimeout(peer.restartTimer);
    peer.pc?.close();
    peer.pc = null;
    peer.transceiver = null;
    peer.sentTrack = null;
    peer.source?.disconnect();
    peer.source = null;
    if (peer.element) peer.element.srcObject = null;
    peer.element = null;
  }

  private closePeer(peer: Peer): void {
    this.closeConnection(peer);
    this.#relay?.forget(peer.id);
    peer.input.disconnect();
    peer.gain.disconnect();
    peer.panner.disconnect();
    this.#peers.delete(peer.id);
  }

  private closeAllPeers(): void {
    for (const peer of [...this.#peers.values()]) this.closePeer(peer);
  }

  private levelOf(analyser: AnalyserNode): number {
    analyser.getFloatTimeDomainData(this.#samples);
    let sum = 0;
    for (const sample of this.#samples) sum += sample * sample;
    return Math.min(1, Math.sqrt(sum / this.#samples.length) * 8);
  }
}
