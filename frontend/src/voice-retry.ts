/** Independent media timers never drive Game transport, movement or its clock. */
export class VoiceRetry {
  #active = false;
  #generation = 0;
  #delay = 500;
  #cancel: (() => void) | null = null;
  constructor(private readonly attempt: () => void,
              private readonly later: (callback: () => void, delay: number) => () => void = (callback, delay) => {
                const timer = setTimeout(callback, delay); return () => clearTimeout(timer);
              }) {}
  start(): void { if (this.#active) return; this.#active = true; ++this.#generation; this.queue(); }
  stop(): void { this.#active = false; ++this.#generation; this.#cancel?.(); this.#cancel = null; this.#delay = 500; }
  private queue(): void {
    const generation = this.#generation;
    this.#cancel = this.later(() => {
      if (!this.#active || generation !== this.#generation) return;
      this.#cancel = null; this.attempt();
      if (!this.#active || generation !== this.#generation) return;
      this.#delay = Math.min(5000, this.#delay * 2); this.queue();
    }, this.#delay);
  }
}
