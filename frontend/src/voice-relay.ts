/**
 * The fallback path for proximity voice. When two browsers cannot reach each other directly
 * (both behind strict NATs, as is common across the internet), voice travels as 20 ms Opus
 * packets over the game socket instead, and the server relays each one only to the peers who
 * may hear the sender (ADR 0016). It costs a little latency, never the route.
 */

/** Every voice context runs at Opus's own rate, so packets need no resampling. */
export const VOICE_SAMPLE_RATE = 48_000;
const FRAME = 960;
/** Relayed voice is narrower than a direct link: speech stays clear and the host's upload light. */
const RELAY_BITRATE = 32_000;

/**
 * Plays queued packets as soon as 60 ms are buffered, and drops the oldest audio when more than
 * 160 ms pile up, so a burst after a stall never turns into lasting delay.
 */
const WORKLET = `
const FRAME = ${FRAME};
// Silence is not sent: after 300 ms below the gate a frame is dropped until speech resumes.
// The first loud frame always goes, so no syllable is clipped.
class Capture extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = new Float32Array(FRAME); this.filled = 0; this.on = false; this.quiet = 0;
    this.port.onmessage = event => { this.on = event.data; }; }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (this.on && channel) for (let i = 0; i < channel.length; i++) {
      this.buffer[this.filled++] = channel[i];
      if (this.filled === FRAME) {
        let sum = 0;
        for (let j = 0; j < FRAME; j++) sum += this.buffer[j] * this.buffer[j];
        this.quiet = Math.sqrt(sum / FRAME) > 0.003 ? 0 : this.quiet + 1;
        if (this.quiet < 15) { this.port.postMessage(this.buffer, [this.buffer.buffer]); this.buffer = new Float32Array(FRAME); }
        this.filled = 0;
      }
    }
    return true;
  }
}
class Playback extends AudioWorkletProcessor {
  constructor() { super(); this.queue = []; this.offset = 0; this.size = 0; this.playing = false;
    this.port.onmessage = event => {
      this.queue.push(event.data); this.size += event.data.length;
      while (this.size > FRAME * 8 && this.queue.length > 1) { const old = this.queue.shift(); this.size -= old.length - this.offset; this.offset = 0; }
    }; }
  process(inputs, outputs) {
    const out = outputs[0][0];
    if (!this.playing && this.size >= FRAME * 3) this.playing = true;
    if (!this.playing) { out.fill(0); return true; }
    for (let i = 0; i < out.length; i++) {
      if (this.queue.length === 0) { out.fill(0, i); this.playing = false; break; }
      const head = this.queue[0];
      out[i] = head[this.offset++]; this.size--;
      if (this.offset === head.length) { this.queue.shift(); this.offset = 0; }
    }
    return true;
  }
}
registerProcessor("pu-voice-capture", Capture);
registerProcessor("pu-voice-playback", Playback);
`;

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

const ENCODER: AudioEncoderConfig = {
  codec: "opus", sampleRate: VOICE_SAMPLE_RATE, numberOfChannels: 1, bitrate: RELAY_BITRATE,
  opus: { frameDuration: 20_000, complexity: 9, useinbandfec: false, usedtx: false, signal: "voice", application: "voip" }
} as unknown as AudioEncoderConfig;
const DECODER: AudioDecoderConfig = { codec: "opus", sampleRate: VOICE_SAMPLE_RATE, numberOfChannels: 1 };

/** One peer's incoming relayed voice: an Opus decoder feeding a jitter buffer. */
type Incoming = { decoder: AudioDecoder; node: AudioWorkletNode; timestamp: number; heardAt: number };

export class VoiceRelay {
  readonly #incoming = new Map<string, Incoming>();
  #capture: AudioWorkletNode | null = null;
  #captureSource: MediaStreamAudioSourceNode | null = null;
  #encoder: AudioEncoder | null = null;
  #timestamp = 0;
  #sending = false;

  private constructor(private readonly context: AudioContext) {}

  /** Null where this browser lacks WebCodecs Opus or audio worklets (or the page is not secure). */
  static async create(context: AudioContext): Promise<VoiceRelay | null> {
    try {
      if (typeof AudioEncoder === "undefined" || typeof AudioDecoder === "undefined" || !context.audioWorklet) return null;
      if (!(await AudioEncoder.isConfigSupported(ENCODER)).supported) return null;
      if (!(await AudioDecoder.isConfigSupported(DECODER)).supported) return null;
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
      try { await context.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
      return new VoiceRelay(context);
    } catch {
      return null;
    }
  }

  /**
   * Encodes the microphone while `targets()` names anyone; each packet goes to exactly the
   * peers named at that moment.
   */
  startCapture(stream: MediaStream, targets: () => readonly string[], send: (targets: readonly string[], data: string) => void): void {
    this.stopCapture();
    const encoder = new AudioEncoder({
      output: chunk => {
        const to = targets();
        if (to.length === 0) return;
        const bytes = new Uint8Array(chunk.byteLength);
        chunk.copyTo(bytes);
        send(to, toBase64(bytes));
      },
      error: () => this.stopCapture()
    });
    encoder.configure(ENCODER);
    const capture = new AudioWorkletNode(this.context, "pu-voice-capture", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    capture.port.onmessage = (event: MessageEvent<Float32Array<ArrayBuffer>>) => {
      if (encoder.state !== "configured" || encoder.encodeQueueSize > 4) return;
      const data = new AudioData({
        format: "f32-planar", sampleRate: this.context.sampleRate, numberOfFrames: event.data.length,
        numberOfChannels: 1, timestamp: this.#timestamp, data: event.data
      });
      this.#timestamp += Math.round(event.data.length / this.context.sampleRate * 1_000_000);
      encoder.encode(data);
      data.close();
    };
    const source = this.context.createMediaStreamSource(stream);
    // A worklet runs only while the graph pulls it, so it feeds a silent path to the speakers.
    const silent = this.context.createGain();
    silent.gain.value = 0;
    source.connect(capture).connect(silent).connect(this.context.destination);
    this.#encoder = encoder;
    this.#capture = capture;
    this.#captureSource = source;
    this.setSending(this.#sending);
  }

  /** Captures only while someone needs relayed audio and the microphone is not muted. */
  setSending(sending: boolean): void {
    this.#sending = sending;
    this.#capture?.port.postMessage(sending);
  }

  stopCapture(): void {
    this.#captureSource?.disconnect();
    this.#capture?.disconnect();
    if (this.#encoder && this.#encoder.state !== "closed") this.#encoder.close();
    this.#captureSource = null;
    this.#capture = null;
    this.#encoder = null;
  }

  /** Plays one relayed packet from a peer into `output`, that peer's volume and panning. */
  receive(peerId: string, data: string, output: AudioNode): void {
    let incoming = this.#incoming.get(peerId);
    if (!incoming) {
      const node = new AudioWorkletNode(this.context, "pu-voice-playback", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
      node.connect(output);
      const decoder = new AudioDecoder({
        output: audio => {
          const samples = new Float32Array(audio.numberOfFrames);
          audio.copyTo(samples, { planeIndex: 0, format: "f32-planar" });
          audio.close();
          node.port.postMessage(samples, [samples.buffer]);
        },
        error: () => this.forget(peerId)
      });
      decoder.configure(DECODER);
      incoming = { decoder, node, timestamp: 0, heardAt: 0 };
      this.#incoming.set(peerId, incoming);
    }
    if (incoming.decoder.state !== "configured") return;
    incoming.decoder.decode(new EncodedAudioChunk({ type: "key", timestamp: incoming.timestamp, data: fromBase64(data) }));
    incoming.timestamp += 20_000;
    incoming.heardAt = performance.now();
  }

  /** Whether relayed voice from this peer arrived lately; a silent speaker sends nothing. */
  heardRecently(peerId: string): boolean {
    const incoming = this.#incoming.get(peerId);
    return incoming !== undefined && performance.now() - incoming.heardAt < 30_000;
  }

  forget(peerId: string): void {
    const incoming = this.#incoming.get(peerId);
    if (!incoming) return;
    this.#incoming.delete(peerId);
    incoming.node.disconnect();
    if (incoming.decoder.state !== "closed") incoming.decoder.close();
  }

  destroy(): void {
    this.stopCapture();
    for (const peerId of [...this.#incoming.keys()]) this.forget(peerId);
  }
}
