const KEY = "pu-town.voice-room";
type IntentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function voiceIntentStorage(): IntentStorage | undefined { try { return globalThis.sessionStorage; } catch { return undefined; } }

/** Remember consent to listen on recovery, never credentials or an enabled microphone. */
export class VoiceIntent {
  readonly wanted: boolean;
  constructor(private readonly storage: IntentStorage | undefined, roomId: string | null, recovering: boolean) {
    try { this.wanted = recovering && roomId !== null && storage?.getItem(KEY) === roomId; }
    catch { this.wanted = false; }
  }
  remember(roomId: string | null, wanted: boolean): void {
    try { if (roomId && wanted) this.storage?.setItem(KEY, roomId); else this.storage?.removeItem(KEY); }
    catch { /* Recovery consent still works in memory. */ }
  }
}
