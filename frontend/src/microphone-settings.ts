import { isSupportedTalkKey } from "./push-to-talk.js";
const KEY = "pu-town.microphone";
type Devices = Pick<MediaDevices, "enumerateDevices" | "getUserMedia">;
function localPreferences(): Storage | undefined { try { return globalThis.localStorage; } catch { return undefined; } }
type Preferences = Pick<Storage, "getItem" | "setItem">;

/** Capture preferences and an isolated input test; this module never publishes media. */
export class MicrophoneSettings {
  deviceId = "";
  mode: "open" | "push-to-talk" = "open";
  key = "KeyV";
  status = "";
  #stream: MediaStream | null = null;
  #testing = false;
  #generation = 0;
  readonly #listeners = new Set<() => void | Promise<void>>();
  constructor(private readonly devices: Devices | undefined = navigator.mediaDevices,
              private readonly storage: Preferences | undefined = localPreferences()) {
    try {
      const saved: unknown = JSON.parse(storage?.getItem(KEY) ?? "null");
      if (saved && typeof saved === "object" && typeof (saved as Record<string, unknown>).deviceId === "string")
        this.deviceId = (saved as {deviceId: string}).deviceId;
      if (saved && typeof saved === "object") {
        const values = saved as Record<string, unknown>;
        if (values.mode === "push-to-talk") this.mode = values.mode;
        if (typeof values.key === "string" && isSupportedTalkKey(values.key)) this.key = values.key;
      }
    } catch { /* Capture remains usable without storage. */ }
  }
  get testing(): boolean { return this.#testing; }
  subscribe(listener: () => void | Promise<void>): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  private async changed(): Promise<void> { await Promise.all([...this.#listeners].map(listener => listener())); }
  async microphones(): Promise<MediaDeviceInfo[]> {
    if (!this.devices) { this.status = "Microphone capture is unavailable in this browser."; return []; }
    try { return (await this.devices.enumerateDevices()).filter(device => device.kind === "audioinput"); }
    catch { this.status = "Microphone devices could not be listed. You can keep playing."; return []; }
  }
  async select(deviceId: string): Promise<void> {
    this.stopTest(); this.deviceId = deviceId;
    this.remember();
    await this.changed();
  }
  private remember(): void {
    try { this.storage?.setItem(KEY, JSON.stringify({deviceId: this.deviceId, mode: this.mode, key: this.key})); } catch { /* Keep in memory. */ }
  }
  async speakingMode(mode: "open" | "push-to-talk", key: string): Promise<void> {
    if (!isSupportedTalkKey(key)) return;
    this.mode = mode; this.key = key; this.remember(); await this.changed();
  }
  async captureOptions(): Promise<MediaTrackConstraints> {
    if (!this.deviceId) return {};
    if ((await this.microphones()).some(device => device.deviceId === this.deviceId)) return {deviceId: {exact: this.deviceId}};
    this.status = "Selected microphone unavailable; using the system default.";
    return {};
  }
  async startTest(): Promise<MediaStream | null> {
    this.stopTest();
    const generation = ++this.#generation;
    this.#testing = true;
    // Listeners suspend any existing publication before private test capture starts.
    try {
      await this.changed();
      if (!this.devices) throw new Error("Capture unavailable");
      const options = await this.captureOptions();
      if (generation !== this.#generation) return null;
      const stream = await this.devices.getUserMedia({audio: options, video: false});
      if (generation !== this.#generation) { for (const track of stream.getTracks()) track.stop(); return null; }
      this.#stream = stream; this.status = "Local input test; your microphone is not published.";
      return stream;
    } catch {
      if (generation === this.#generation) { this.status = "Microphone unavailable or permission denied. You can keep playing."; this.stopTest(); }
      return null;
    }
  }
  stopTest(): void {
    ++this.#generation;
    for (const track of this.#stream?.getTracks() ?? []) track.stop();
    this.#stream = null;
    if (this.#testing) { this.#testing = false; void this.changed().catch(() => {}); }
  }
}
