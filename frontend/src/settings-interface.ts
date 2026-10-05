import { MicrophoneSettings } from "./microphone-settings.js";
import { AUDIO_CHANNELS, AudioMixer, type VolumeControl } from "./audio-mixer.js";

const MOTION_KEY = "pu-town.reduced-motion";
const FULLSCREEN_KEY = "pu-town.prefer-fullscreen";

function rememberedBoolean(key: string): boolean | null {
  try {
    const value = localStorage.getItem(key);
    return value === "true" ? true : value === "false" ? false : null;
  } catch { return null; }
}

function rememberBoolean(key: string, value: boolean): void {
  try { localStorage.setItem(key, String(value)); } catch { /* Preferences remain available in memory. */ }
}

/** Local preferences never send Game requests or suspend the server clock. */
export class SettingsInterface {
  readonly #dialog = document.createElement("dialog");
  readonly #launchers: HTMLButtonElement[] = [];
  #opener: HTMLButtonElement | null = null;
  readonly #systemMotion = matchMedia("(prefers-reduced-motion: reduce)");
  #explicitMotion = rememberedBoolean(MOTION_KEY);
  #reducedMotion = this.#explicitMotion ?? this.#systemMotion.matches;
  #preferFullscreen = rememberedBoolean(FULLSCREEN_KEY) ?? false;
  #fullscreenPending = false;
  readonly #motionChanged = () => {
    if (this.#explicitMotion === null) {
      this.#reducedMotion = this.#systemMotion.matches;
      this.applyMotion();
    }
  };
  readonly #fullscreenChanged = () => this.renderFullscreen();

  #testSource: MediaStreamAudioSourceNode | null = null;
  #testAnalyser: AnalyserNode | null = null;
  #testFrame = 0;

  constructor(private readonly audio: AudioMixer, private readonly microphone: MicrophoneSettings) {
    this.#dialog.className = "settings-dialog";
    this.#dialog.setAttribute("aria-labelledby", "settings-title");
    this.#dialog.innerHTML = `
      <header><h2 id="settings-title">Settings</h2><button type="button" class="close-settings">Close Settings</button></header>
      <p class="hint">The Game keeps running while Settings is open.</p>
      <fieldset><legend>Sound</legend>
        ${(["master", ...AUDIO_CHANNELS] as const).map(category => `
          <div class="volume-label"><label for="volume-${category}">${category[0]!.toUpperCase() + category.slice(1)} volume</label><output for="volume-${category}" aria-hidden="true"></output></div>
          <input id="volume-${category}" type="range" min="0" max="100" step="1" data-volume="${category}">`).join("")}
        <div class="sound-previews">${AUDIO_CHANNELS.map(category => `<button type="button" data-preview="${category}">Preview ${category}</button>`).join("")}</div>
        <p class="hint">Previews play only on this device.</p>
      </fieldset>
      <fieldset><legend>Microphone</legend>
        <label for="microphone-device">Input device</label><select id="microphone-device"><option value="">System default</option></select>
        <button type="button" class="refresh-microphones">Refresh devices</button>
        <button type="button" class="test-microphone">Test microphone locally</button>
        <meter class="microphone-level" min="0" max="1" value="0" aria-label="Local microphone input level"></meter>
        <p class="microphone-status" role="status"></p>
      </fieldset>
      <fieldset><legend>Display</legend>
        <label class="settings-choice"><span>Reduced motion</span><input type="checkbox" class="reduced-motion-control"></label>
        <label class="settings-choice"><span>Prefer fullscreen</span><input type="checkbox" class="prefer-fullscreen"></label>
        <button type="button" class="fullscreen-toggle">Enter fullscreen</button>
        <p class="hint fullscreen-status" aria-live="polite"></p>
      </fieldset>
      <p class="settings-status" role="status" aria-label="Settings feedback" aria-live="polite"></p>`;
    document.body.append(this.#dialog);
    this.#dialog.querySelector(".refresh-microphones")!.addEventListener("click", () => { void this.refreshMicrophones(); });
    this.#dialog.querySelector<HTMLSelectElement>("#microphone-device")!.addEventListener("change", event => {
      this.stopMicrophoneTest();
      void microphone.select((event.target as HTMLSelectElement).value).then(() => { this.microphoneStatus.textContent = microphone.status || "Microphone selected."; });
    });
    this.#dialog.querySelector(".test-microphone")!.addEventListener("click", () => { void this.testMicrophone(); });

    this.applyMotion();
    this.#dialog.querySelector<HTMLInputElement>(".reduced-motion-control")!.addEventListener("change", event => {
      this.#reducedMotion = (event.target as HTMLInputElement).checked;
      this.#explicitMotion = this.#reducedMotion;
      rememberBoolean(MOTION_KEY, this.#reducedMotion);
      this.applyMotion();
    });
    const fullscreenPreference = this.#dialog.querySelector<HTMLInputElement>(".prefer-fullscreen")!;
    fullscreenPreference.checked = this.#preferFullscreen;
    fullscreenPreference.addEventListener("change", () => {
      this.#preferFullscreen = fullscreenPreference.checked;
      rememberBoolean(FULLSCREEN_KEY, this.#preferFullscreen);
      this.renderFullscreen();
    });
    this.#dialog.querySelector(".fullscreen-toggle")!.addEventListener("click", () => {
      this.#fullscreenPending = true;
      this.renderFullscreen();
      // Request directly inside the click: browsers require transient activation.
      try {
        const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
        void request.catch(() => {
          this.status.textContent = "Fullscreen could not be changed. Try again using the fullscreen button.";
        }).finally(() => { this.#fullscreenPending = false; this.renderFullscreen(); });
      } catch {
        this.#fullscreenPending = false;
        this.status.textContent = "Fullscreen is unavailable. You can keep playing in this window.";
        this.renderFullscreen();
      }
    });
    document.addEventListener("fullscreenchange", this.#fullscreenChanged);
    this.#systemMotion.addEventListener("change", this.#motionChanged);
    this.renderFullscreen();
    for (const input of Array.from(this.#dialog.querySelectorAll<HTMLInputElement>("[data-volume]"))) {
      const category = input.dataset.volume as VolumeControl;
      input.value = String(audio.volume(category));
      const output = this.#dialog.querySelector<HTMLOutputElement>(`output[for="${input.id}"]`)!;
      const update = () => { output.value = `${input.value}%`; };
      update();
      input.addEventListener("input", () => { audio.setVolume(category, Number(input.value)); update(); });
    }
    for (const button of Array.from(this.#dialog.querySelectorAll<HTMLButtonElement>("[data-preview]"))) {
      button.addEventListener("click", () => {
        const category = button.dataset.preview as typeof AUDIO_CHANNELS[number];
        void audio.preview(category).then(
          () => { this.status.textContent = `Playing ${category} preview locally.`; },
          () => { this.status.textContent = "Sound is unavailable. You can keep playing and try again."; }
        );
      });
    }
    this.#dialog.querySelector(".close-settings")!.addEventListener("click", () => this.#dialog.close());
    this.#dialog.addEventListener("close", () => { this.stopMicrophoneTest(); audio.stopPreview(); this.#opener?.focus(); });
    for (const [selector, className] of [[".entry-panel", "entry-settings"], [".room-bar", "room-settings"]]) {
      const parent = document.querySelector(selector!);
      if (!parent) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = className!;
      button.textContent = "Settings";
      button.addEventListener("click", () => {
        this.#opener = button;
        this.status.textContent = "";
        this.#dialog.showModal();
        void this.refreshMicrophones();
      });
      if (className === "room-settings") parent.insertBefore(button, parent.querySelector(".leave-room"));
      else parent.append(button);
      this.#launchers.push(button);
    }
  }

  private get microphoneStatus(): HTMLElement { return this.#dialog.querySelector(".microphone-status")!; }
  private async refreshMicrophones(): Promise<void> {
    const select = this.#dialog.querySelector<HTMLSelectElement>("#microphone-device")!;
    const devices = await this.microphone.microphones();
    select.replaceChildren(new Option("System default", ""));
    for (const [i, device] of devices.entries()) select.add(new Option(device.label || `Microphone ${i + 1}`, device.deviceId));
    if (this.microphone.deviceId && !devices.some(d => d.deviceId === this.microphone.deviceId))
      select.add(new Option("Saved microphone unavailable (system default used)", this.microphone.deviceId));
    select.value = this.microphone.deviceId;
    this.microphoneStatus.textContent = this.microphone.status;
  }
  private async testMicrophone(): Promise<void> {
    if (this.microphone.testing) { this.stopMicrophoneTest(); return; }
    try { await this.audio.context.resume(); } catch { this.microphoneStatus.textContent = "Local audio test unavailable. You can keep playing."; return; }
    const stream = await this.microphone.startTest();
    this.microphoneStatus.textContent = this.microphone.status;
    if (!stream || !this.#dialog.open) { this.stopMicrophoneTest(); return; }
    this.#testSource = this.audio.context.createMediaStreamSource(stream);
    this.#testAnalyser = this.audio.context.createAnalyser(); this.#testAnalyser.fftSize = 256;
    this.#testSource.connect(this.#testAnalyser); // No output or media publication.
    const samples = new Float32Array(256);
    const meter = this.#dialog.querySelector<HTMLMeterElement>(".microphone-level")!;
    const sample = () => {
      if (!this.#testAnalyser) return;
      this.#testAnalyser.getFloatTimeDomainData(samples);
      meter.value = Math.min(1, Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length) * 4);
      this.#testFrame = requestAnimationFrame(sample);
    };
    sample();
    this.#dialog.querySelector(".test-microphone")!.textContent = "Stop local test";
    await this.refreshMicrophones();
  }
  private stopMicrophoneTest(): void {
    cancelAnimationFrame(this.#testFrame); this.#testSource?.disconnect(); this.#testAnalyser?.disconnect();
    this.#testSource = null; this.#testAnalyser = null; this.microphone.stopTest();
    this.#dialog.querySelector<HTMLMeterElement>(".microphone-level")!.value = 0;
    this.#dialog.querySelector(".test-microphone")!.textContent = "Test microphone locally";
  }

  get reducedMotion(): boolean { return this.#reducedMotion; }

  private applyMotion(): void {
    document.documentElement.classList.toggle("reduced-motion", this.#reducedMotion);
    this.#dialog.querySelector<HTMLInputElement>(".reduced-motion-control")!.checked = this.#reducedMotion;
  }

  private renderFullscreen(): void {
    const supported = document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === "function";
    const active = document.fullscreenElement !== null;
    const button = this.#dialog.querySelector<HTMLButtonElement>(".fullscreen-toggle")!;
    button.disabled = !supported || this.#fullscreenPending;
    button.textContent = active ? "Exit fullscreen" : "Enter fullscreen";
    this.#dialog.querySelector(".fullscreen-status")!.textContent = !supported ? "Fullscreen unavailable in this browser."
      : active ? "Fullscreen active."
      : this.#preferFullscreen ? "Windowed. Fullscreen preferred; use Enter fullscreen to activate it." : "Windowed.";
  }

  private get status(): HTMLElement { return this.#dialog.querySelector(".settings-status")!; }

  destroy(): void {
    this.stopMicrophoneTest();
    document.removeEventListener("fullscreenchange", this.#fullscreenChanged);
    this.#systemMotion.removeEventListener("change", this.#motionChanged);
    document.documentElement.classList.remove("reduced-motion");
    this.#dialog.close();
    this.#dialog.remove();
    for (const button of this.#launchers) button.remove();
  }
}
