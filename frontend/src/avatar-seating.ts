/** Client-only sit timing. Seat ownership and position remain server-authoritative. */
export const SIT_DURATION_MS = 420;

export class AvatarSeating {
  #seat: number | null = null;
  #startedAt: number | null = null;

  /**
   * A Player holds one Seat from the Lobby through the whole Game, so only taking a
   * Seat for the first time lowers an Avatar into it; nothing later stands them up.
   */
  reconcile(seat: number, arriving: boolean, time: number): void {
    if (seat !== this.#seat) this.#startedAt = arriving ? time : null;
    this.#seat = seat;
  }

  /** 0..1 lowers into the chair; 1 is the seated idle pose. */
  progress(time: number): number {
    if (this.#startedAt === null) return 1;
    const progress = Math.max(0, Math.min(1, (time - this.#startedAt) / SIT_DURATION_MS));
    if (progress === 1) this.#startedAt = null;
    return progress;
  }
}
