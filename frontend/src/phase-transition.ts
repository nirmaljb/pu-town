import type { WorldState } from "./world-state.js";
import type { GamePhase, Role } from "./protocol.js";
export type PhaseCard = Readonly<{ blocked: boolean; opacity: number; titleVisible: boolean; phase: GamePhase | null; role: Role | null }>;
const EMPTY: PhaseCard = { blocked: false, opacity: 0, titleVisible: false, phase: null, role: null };
/** Presentation only: never changes a deadline or replays intermediate phases. */
export class PhaseTransition {
  #skipNext = false;
  foregrounded(): void { this.#skipNext = true; this.#started = -Infinity; }
  #key = "";
  #serial = -1;
  #visible = true;
  #started = -Infinity;
  #phase: GamePhase | null = null;
  #role: Role | null = null;
  update(world: WorldState | undefined, now: number, visible: boolean, reducedMotion: boolean): PhaseCard {
    const game = world?.game;
    const key = game ? `${game.round}:${game.phase}:${world?.developer?.revision ?? 0}` : "";
    const recovery = this.#serial !== -1 && this.#serial !== world?.snapshotSerial;
    const foreground = this.#skipNext || !this.#visible && visible;
    this.#skipNext = false;
    const first = this.#key === "";
    if (key !== this.#key) {
      this.#started = game && visible && !recovery && !foreground && (!first || game.phase === "role_reveal" || game.mode === "practice")
        && now - (world?.phaseReceivedAt ?? 0) < 1500 ? now : -Infinity;
      this.#phase = game?.phase ?? null;
      this.#role = game && first ? game.self.role : game?.phase === "role_reveal" ? game.self.role : null;
      this.#key = key;
    }
    if (recovery || foreground || !visible || !game) this.#started = -Infinity;
    this.#serial = world?.snapshotSerial ?? -1; this.#visible = visible;
    const elapsed = now - this.#started;
    if (elapsed >= (reducedMotion ? 300 : 1500)) return EMPTY;
    return { blocked: true, opacity: reducedMotion ? 1 : elapsed < 350 ? elapsed / 350 : elapsed < 1150 ? 1 : (1500 - elapsed) / 350,
      titleVisible: reducedMotion || elapsed >= 350, phase: this.#phase, role: this.#role };
  }
}
