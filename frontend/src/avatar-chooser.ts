import { PUBLISHED_AVATARS } from "./avatar-presets.js";
import type { PlayerView } from "./protocol.js";

/** A private draft selection; only Room State determines the accepted appearance. */
export class AvatarChooser {
  readonly element = document.createElement("section");
  readonly #grid = document.createElement("div");
  readonly #preview = document.createElement("div");
  readonly #name = document.createElement("strong");
  readonly #status = document.createElement("p");
  readonly #use = document.createElement("button");
  readonly #buttons = new Map<string, HTMLButtonElement>();
  #memberId: string | null = null;
  #previewId: string | null = null;
  #acceptedId: string | null = null;

  constructor(onSelect: (id: string) => void) {
    this.element.className = "avatar-chooser";
    this.element.setAttribute("aria-label", "Choose your character");
    const heading = document.createElement("h2"); heading.textContent = "Your character";
    const hint = document.createElement("p"); hint.textContent = "Try a look. Use character shares it with the Room.";
    this.#grid.className = "avatar-options";
    for (const preset of PUBLISHED_AVATARS) {
      const button = document.createElement("button"); button.type = "button";
      const thumbnail = document.createElement("span"); thumbnail.className = "avatar-thumbnail";
      thumbnail.style.backgroundImage = `url("${preset.sprite}")`; thumbnail.setAttribute("aria-hidden", "true");
      const label = document.createElement("span"); label.textContent = preset.name;
      button.append(thumbnail, label);
      button.addEventListener("click", () => { this.#previewId = preset.id; this.renderPreview(); });
      this.#buttons.set(preset.id, button); this.#grid.append(button);
    }
    this.#preview.className = "avatar-private-preview avatar-thumbnail";
    this.#preview.setAttribute("aria-hidden", "true");
    this.#status.setAttribute("role", "status");
    this.#use.type = "button"; this.#use.className = "primary"; this.#use.textContent = "Use character";
    this.#use.addEventListener("click", () => {
      if (!this.#previewId) return;
      onSelect(this.#previewId);
      this.#status.textContent = "Requested. Waiting for the Room…";
    });
    const preview = document.createElement("div"); preview.className = "avatar-preview-panel";
    preview.append(this.#preview, this.#name, this.#status, this.#use);
    this.element.append(heading, hint, this.#grid, preview);
  }

  render(self: PlayerView | undefined, available: boolean): void {
    this.element.hidden = !available || !self;
    if (!available || !self) {
      this.#memberId = null; this.#previewId = null; this.#acceptedId = null;
      return;
    }
    if (self.playerId !== this.#memberId) {
      this.#memberId = self.playerId; this.#previewId = self.avatarPreset;
    }
    this.#acceptedId = self.avatarPreset;
    this.renderPreview();
  }

  private renderPreview(): void {
    const preset = PUBLISHED_AVATARS.find(preset => preset.id === this.#previewId);
    if (!preset) return;
    this.#preview.style.backgroundImage = `url("${preset.sprite}")`;
    this.#name.textContent = preset.name;
    const accepted = preset.id === this.#acceptedId;
    this.#status.textContent = accepted ? "Your current character" : "Private preview";
    this.#use.disabled = accepted;
    for (const [id, button] of this.#buttons) button.setAttribute("aria-pressed", String(id === preset.id));
  }
}
