export const AUDIO_CHANNELS = ["effects", "ambience", "voice"] as const;
export type AudioChannel = typeof AUDIO_CHANNELS[number];
export type VolumeControl = "master" | AudioChannel;
const VOLUME_KEY = "pu-town.volumes";

/** Local output only. Sources connect to a category bus, then the master bus. */
export class AudioMixer {
  readonly #volumes: Record<VolumeControl, number> = { master: 100, effects: 100, ambience: 100, voice: 100 };
  #context: AudioContext | null = null;
  #master: GainNode | null = null;
  readonly #channels = new Map<AudioChannel, GainNode>();
  #preview: OscillatorNode | null = null;

  constructor() {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(VOLUME_KEY) ?? "null");
      if (saved && typeof saved === "object") {
        for (const key of ["master", ...AUDIO_CHANNELS] as const) {
          const value: unknown = (saved as Record<string, unknown>)[key];
          if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100) this.#volumes[key] = value;
        }
      }
    } catch { /* Audio remains available when storage is unavailable or malformed. */ }
  }

  volume(control: VolumeControl): number { return this.#volumes[control]; }

  setVolume(control: VolumeControl, value: number): void {
    if (!Number.isFinite(value) || value < 0 || value > 100) return;
    this.#volumes[control] = value;
    const gain = control === "master" ? this.#master : this.#channels.get(control);
    if (gain && this.#context) gain.gain.setValueAtTime(value / 100, this.#context.currentTime);
    try { localStorage.setItem(VOLUME_KEY, JSON.stringify(this.#volumes)); } catch { /* In-memory preferences still work. */ }
  }

  /** Creation is lazy; call resume from a Player gesture before playing a source. */
  get context(): AudioContext {
    if (!this.#context) {
      const context = new AudioContext();
      const master = context.createGain();
      master.gain.value = this.#volumes.master / 100;
      master.connect(context.destination);
      this.#context = context;
      this.#master = master;
    }
    return this.#context;
  }

  channel(category: AudioChannel): GainNode {
    let gain = this.#channels.get(category);
    if (!gain) {
      gain = this.context.createGain();
      gain.gain.value = this.#volumes[category] / 100;
      gain.connect(this.#master!);
      this.#channels.set(category, gain);
    }
    return gain;
  }

  async preview(category: AudioChannel): Promise<void> {
    const context = this.context;
    await context.resume();
    if (context.state !== "running") throw new Error("Audio is unavailable.");
    this.stopPreview();
    const tone = context.createOscillator();
    const envelope = context.createGain();
    tone.frequency.value = { effects: 660, ambience: 220, voice: 440 }[category];
    const start = context.currentTime;
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(0.15, start + 0.02);
    envelope.gain.setValueAtTime(0.15, start + 0.5);
    envelope.gain.linearRampToValueAtTime(0, start + 0.6);
    tone.connect(envelope).connect(this.channel(category));
    tone.onended = () => {
      tone.disconnect();
      envelope.disconnect();
      if (this.#preview === tone) this.#preview = null;
    };
    this.#preview = tone;
    tone.start(start);
    tone.stop(start + 0.6);
  }

  stopPreview(): void {
    this.#preview?.stop();
    this.#preview = null;
  }

  destroy(): void {
    this.stopPreview();
    if (this.#context) void this.#context.close().catch(() => {});
  }
}
