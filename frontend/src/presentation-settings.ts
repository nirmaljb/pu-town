const STORAGE_KEY = "pu-town.presentation";
type MotionPreference = "system" | "reduce" | "full";

/** Local presentation only; these controls never change the Game or its clock. */
export class PresentationSettings {
  readonly #root = document.createElement("div");
  readonly #systemMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  readonly #toggle: HTMLButtonElement;
  readonly #panel: HTMLElement;
  readonly #motion: HTMLSelectElement;
  #motionPreference: MotionPreference = "system";
  #preferFullscreen = false;
  #fullscreenPending = false;
  #fullscreenError = false;
  readonly #fullscreenPreference: HTMLInputElement;
  readonly #fullscreenButton: HTMLButtonElement;
  readonly #fullscreenStatus: HTMLElement;
  readonly #onFullscreen = () => {
    this.#fullscreenError = false;
    this.renderFullscreen();
  };
  readonly #onSystemMotion = () => this.applyMotion();

  constructor() {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved && typeof saved === "object") {
        if ("fullscreen" in saved && typeof saved.fullscreen === "boolean") this.#preferFullscreen = saved.fullscreen;
      }
      if (saved && typeof saved === "object" && "motion" in saved) {
        if (saved.motion === "system" || saved.motion === "reduce" || saved.motion === "full") {
          this.#motionPreference = saved.motion;
        }
      }
    } catch { /* Corrupt or unavailable storage falls back to the system preference. */ }
    this.#root.className = "presentation-settings";
    this.#root.innerHTML = `
      <button type="button" class="display-settings-toggle" aria-expanded="false" aria-controls="display-settings-panel">Display settings</button>
      <section id="display-settings-panel" class="display-settings-panel" role="dialog" aria-modal="false" aria-labelledby="display-settings-title" hidden>
        <header><h2 id="display-settings-title">Display settings</h2><button type="button" class="close-display-settings" aria-label="Close display settings">Close</button></header>
        <label for="motion-preference">Motion</label>
        <select id="motion-preference">
          <option value="system">Follow system</option>
          <option value="reduce">Reduce motion</option>
          <option value="full">Full motion</option>
        </select>
        <p>Reduce fades, pulses and camera motion. The Game keeps running.</p>
        <label class="fullscreen-preference"><input type="checkbox" id="fullscreen-preference"> Prefer fullscreen</label>
        <button type="button" class="toggle-fullscreen">Enter fullscreen</button>
        <p class="fullscreen-status" role="status" aria-live="polite"></p>
      </section>`;
    this.#toggle = this.element(".display-settings-toggle");
    this.#panel = this.element(".display-settings-panel");
    this.#motion = this.element("#motion-preference");
    this.#motion.value = this.#motionPreference;
    this.#fullscreenPreference = this.element("#fullscreen-preference");
    this.#fullscreenButton = this.element(".toggle-fullscreen");
    this.#fullscreenStatus = this.element(".fullscreen-status");
    this.#fullscreenPreference.checked = this.#preferFullscreen;
    this.#fullscreenPreference.addEventListener("change", () => {
      this.#preferFullscreen = this.#fullscreenPreference.checked;
      this.save();
      this.renderFullscreen();
    });
    this.#fullscreenButton.addEventListener("click", () => void this.toggleFullscreen());
    document.addEventListener("fullscreenchange", this.#onFullscreen);
    this.renderFullscreen();
    this.#motion.addEventListener("change", () => {
      this.#motionPreference = this.#motion.value as MotionPreference;
      this.save();
      this.applyMotion();
    });
    this.#toggle.addEventListener("click", () => this.open(this.#panel.hidden));
    this.element(".close-display-settings").addEventListener("click", () => this.open(false));
    this.#panel.addEventListener("keydown", event => {
      // Settings keys must not also walk or trigger an ability.
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        this.open(false);
      }
    });
    this.#systemMotion.addEventListener("change", this.#onSystemMotion);
    this.applyMotion();
    document.body.append(this.#root);
  }

  get reducedMotion(): boolean {
    return this.#motionPreference === "reduce" || (this.#motionPreference === "system" && this.#systemMotion.matches);
  }

  destroy(): void {
    this.#systemMotion.removeEventListener("change", this.#onSystemMotion);
    document.removeEventListener("fullscreenchange", this.#onFullscreen);
    this.#root.remove();
    delete document.documentElement.dataset.reducedMotion;
  }

  private open(open: boolean): void {
    this.#panel.hidden = !open;
    this.#toggle.setAttribute("aria-expanded", String(open));
    if (open) this.#motion.focus();
    else this.#toggle.focus();
  }

  private applyMotion(): void {
    document.documentElement.dataset.reducedMotion = String(this.reducedMotion);
  }

  private save(): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ motion: this.#motionPreference, fullscreen: this.#preferFullscreen })); }
    catch { /* Preferences still work for this page without storage. */ }
  }

  private renderFullscreen(): void {
    const active = document.fullscreenElement !== null;
    const supported = document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === "function";
    this.#fullscreenButton.textContent = active ? "Exit fullscreen" : "Enter fullscreen";
    this.#fullscreenButton.disabled = !supported || this.#fullscreenPending;
    this.#fullscreenStatus.textContent = !supported ? "Fullscreen is unavailable in this browser."
      : this.#fullscreenPending ? "Changing fullscreen…"
        : this.#fullscreenError ? "Fullscreen could not be changed. Try the fullscreen button again."
          : active ? "Fullscreen is active."
            : this.#preferFullscreen ? "Fullscreen is preferred. Click Enter fullscreen to activate it."
              : "Fullscreen is off.";
  }

  /** Called only by the activation button: remembered intent never fabricates a gesture. */
  private async toggleFullscreen(): Promise<void> {
    if (this.#fullscreenPending || this.#fullscreenButton.disabled) return;
    this.#fullscreenPending = true;
    this.#fullscreenError = false;
    const exiting = document.fullscreenElement !== null;
    this.renderFullscreen();
    try {
      if (exiting) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      this.#preferFullscreen = !exiting;
      this.#fullscreenPreference.checked = this.#preferFullscreen;
      this.save();
    } catch {
      this.#fullscreenError = true;
    } finally {
      this.#fullscreenPending = false;
      this.renderFullscreen();
    }
  }

  private element<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.#root.querySelector<T>(selector)!;
  }
}
