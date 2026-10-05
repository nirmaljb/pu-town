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
  readonly #menuClick = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const control = target.closest<HTMLButtonElement | HTMLElement>("button, summary");
    if (!control || control.matches(":disabled") || control.closest(".task-interface, .sound-previews")) return;
    this.play(control.matches("summary") || control.closest(".avatar-options, .target-list") ? "select" : "click");
  };
  start(): void {
    document.addEventListener("pointerdown", this.#unlock);
    document.addEventListener("keydown", this.#unlock);
    document.addEventListener("click", this.#menuClick);
  }
  destroy(): void {
    document.removeEventListener("pointerdown", this.#unlock);
    document.removeEventListener("keydown", this.#unlock);
    document.removeEventListener("click", this.#menuClick);
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
    if (!world || !playing) { this.#previous = null; return; }
    const previous = this.#previous;
    this.#previous = world;
    if (!previous || previous.roomId !== world.roomId || previous.snapshotSerial !== world.snapshotSerial) return;
    const own = world.players.get(world.selfPlayerId ?? "");
    const before = previous.players.get(previous.selfPlayerId ?? "");
    if (own && before && (own.ready !== before.ready || own.avatarPreset !== before.avatarPreset)) this.play("confirm");
    if (!world.game) return;
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
