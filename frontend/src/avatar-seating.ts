/** Client-only sit timing. Seat ownership and position remain server-authoritative. */
export const SIT_DURATION_MS = 420;

export class AvatarSeating {
  #seat: number | null = null;
  #startedAt: number | null = null;

  reconcile(seat: number | null, arriving: boolean, time: number): void {
    if (seat === null) this.#startedAt = null;
    else if (seat !== this.#seat) this.#startedAt = arriving ? time : null;
    this.#seat = seat;
  }

  /** null means standing; 0..1 lowers into the chair; 1 is the seated idle pose. */
  progress(time: number): number | null {
    if (this.#seat === null) return null;
    if (this.#startedAt === null) return 1;
    const progress = Math.max(0, Math.min(1, (time - this.#startedAt) / SIT_DURATION_MS));
    if (progress === 1) this.#startedAt = null;
    return progress;
  }
}
