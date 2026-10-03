import type { AudioMixer } from "./audio-mixer.js";
import type { WorldState } from "./world-state.js";
export type SoundCue = "select" | "click" | "success" | "confirm" | "phase" | "footstep" | "enter" | "exit";

/** Local cues use the saved effects bus. Recovery establishes a new baseline silently. */
export class SoundEffects {
  #previous: WorldState | null = null;
  constructor(private readonly audio: AudioMixer) {}
  readonly #unlock = () => {
    try { void this.audio.context.resume().catch(() => {}); } catch { /* Play remains available without audio. */ }
  };
  start(): void {
    document.addEventListener("pointerdown", this.#unlock);
    document.addEventListener("keydown", this.#unlock);
  }
  destroy(): void {
    document.removeEventListener("pointerdown", this.#unlock);
    document.removeEventListener("keydown", this.#unlock);
  }
  play(cue: SoundCue, volume = 1): void {
    try {
      const context = this.audio.context;
      if (context.state !== "running" || volume <= 0) return;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const frequencies: Record<SoundCue, number> = { select: 440, click: 540, success: 880, confirm: 720, phase: 330, footstep: 90, enter: 280, exit: 220 };
      const start = context.currentTime;
      const duration = cue === "footstep" ? .055 : cue === "phase" ? .3 : .12;
      oscillator.type = cue === "footstep" ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequencies[cue], start);
      oscillator.frequency.exponentialRampToValueAtTime(frequencies[cue] * (cue === "success" ? 1.5 : .8), start + duration);
      envelope.gain.setValueAtTime(.08 * Math.min(1, volume), start);
      envelope.gain.exponentialRampToValueAtTime(.001, start + duration);
      oscillator.connect(envelope).connect(this.audio.channel("effects"));
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
      oscillator.start(start); oscillator.stop(start + duration);
    } catch { /* Unsupported output never blocks Game controls. */ }
  }
  update(world: WorldState | undefined, playing: boolean): void {
    if (!world || !playing || !world.game) { this.#previous = null; return; }
    const previous = this.#previous;
    this.#previous = world;
    if (!previous || previous.roomId !== world.roomId || previous.snapshotSerial !== world.snapshotSerial) return;
    if (world.game.phase === "day") {
      const last = previous.sounds.at(-1)?.eventId ?? 0;
      for (const sound of world.sounds) if (sound.eventId > last) this.play(sound.kind, sound.gain);
    }
    if (previous.game?.phase !== world.game.phase) this.play("phase");
    if (!previous.game?.self.meetingVoted && world.game.self.meetingVoted) this.play("confirm");
    for (const task of world.tasks?.tasks ?? []) {
      const before = previous.tasks?.tasks.find(candidate => candidate.taskId === task.taskId);
      if (before && before.step < task.steps && task.step === task.steps) this.play("success");
    }
  }
}
