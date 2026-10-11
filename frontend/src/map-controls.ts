/** Public keyboard controls shared by the overview button and M shortcut. */
export class MapControls {
  #available = false;
  #open = false;
  get open(): boolean { return this.#open; }
  setAvailable(available: boolean): void {
    this.#available = available;
    if (!available) this.close();
  }
  toggle(): void { if (this.#available) this.#open = !this.#open; }
  close(): void { this.#open = false; }
  handleKey(code: string, blocked: boolean, repeat: boolean): boolean {
    if (!this.#available || blocked || repeat) return false;
    if (code === "KeyM") { this.toggle(); return true; }
    if (code === "Escape" && this.#open) { this.close(); return true; }
    return false;
  }
}
