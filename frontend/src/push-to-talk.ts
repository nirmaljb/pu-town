/** Key ownership ends on release, focus loss, configuration or a blocking surface. */
export class PushToTalk {
  #key = "KeyV";
  #held = false;
  get held(): boolean { return this.#held; }
  configure(key: string): void { this.#key = key; this.reset(); }
  press(code: string, blocked: boolean, repeat: boolean): boolean {
    if (blocked || repeat || code !== this.#key || this.#held) return false;
    this.#held = true; return true;
  }
  release(code: string): boolean { return code === this.#key && this.reset(); }
  reset(): boolean { const wasHeld = this.#held; this.#held = false; return wasHeld; }
}
