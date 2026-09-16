import type { AvatarCollection } from "./avatar-presets.js";
import type { PlayerView } from "./protocol.js";

/**
 * The Lobby chooser for the Room's pinned collection. Clicking a character requests it from
 * the Room; appearance changes when the Room accepts, never optimistically.
 */
export class AvatarChooser {
  readonly element = document.createElement("section");
  readonly #grid = document.createElement("div");
  readonly #status = document.createElement("p");
  readonly #buttons = new Map<string, HTMLButtonElement>();
  #collection: AvatarCollection | null = null;
  #memberId: string | null = null;
  #requestedId: string | null = null;
  #acceptedId: string | null = null;

  constructor(private readonly onSelect: (id: string) => void) {
    this.element.className = "avatar-chooser";
    this.element.setAttribute("aria-label", "Choose your character");
    this.element.hidden = true;
    const heading = document.createElement("h2"); heading.textContent = "Your character";
    const hint = document.createElement("p"); hint.textContent = "Pick a look. The Room shows it to everyone.";
    this.#grid.className = "avatar-options";
    this.#status.className = "avatar-selection-status";
    this.#status.setAttribute("role", "status");
    this.element.append(heading, hint, this.#grid, this.#status);
  }

  /** Called once the Room's collection has arrived, before the Room is rendered. */
  setCollection(collection: AvatarCollection): void {
    if (this.#collection?.collectionId === collection.collectionId) return;
    this.#collection = collection;
    this.#buttons.clear();
    this.#grid.replaceChildren();
    for (const preset of collection.presets) {
      const button = document.createElement("button"); button.type = "button";
      const thumbnail = document.createElement("span"); thumbnail.className = "avatar-thumbnail";
      thumbnail.style.backgroundImage = `url("${preset.sprite}")`; thumbnail.setAttribute("aria-hidden", "true");
      const label = document.createElement("span"); label.textContent = preset.name;
      button.append(thumbnail, label);
      button.addEventListener("click", () => this.request(preset.id));
      this.#buttons.set(preset.id, button); this.#grid.append(button);
    }
    this.renderSelection();
  }

  render(self: PlayerView | undefined, available: boolean): void {
    this.element.hidden = !available || !self || !this.#collection;
    if (!available || !self) {
      this.#memberId = null; this.#requestedId = null; this.#acceptedId = null;
      return;
    }
    if (self.playerId !== this.#memberId) {
      this.#memberId = self.playerId; this.#requestedId = null;
    }
    if (self.avatarPreset === this.#requestedId) this.#requestedId = null;
    this.#acceptedId = self.avatarPreset;
    this.renderSelection();
  }

  private request(id: string): void {
    if (id === this.#acceptedId) return;
    this.#requestedId = id;
    this.onSelect(id);
    this.renderSelection();
  }

  private renderSelection(): void {
    const accepted = this.#collection?.presets.find(preset => preset.id === this.#acceptedId);
    this.#status.textContent = this.#requestedId
      ? "Requested. Waiting for the Room…"
      : accepted ? `Your character: ${accepted.name}` : "";
    for (const [id, button] of this.#buttons) {
      button.setAttribute("aria-pressed", String(id === this.#acceptedId));
      button.classList.toggle("requested", id === this.#requestedId);
    }
  }
}
