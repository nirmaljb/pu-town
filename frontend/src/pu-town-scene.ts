import Phaser from "phaser";
import { MeetingArea } from "./meeting-area.js";
import { GameInterface } from "./game-interface.js";
import { JoinInterface } from "./join-interface.js";
import { AvatarReconciler, loadAvatarCollection } from "./avatar-reconciler.js";
import { fetchAvatarCollection, setActiveAvatarCollection } from "./avatar-presets.js";
import { NetworkFrameBoundary } from "./network-frame-boundary.js";
import { NetworkInbox } from "./network-inbox.js";
import { ReconnectingGameClient } from "./reconnecting-game-client.js";
import { emptyWorld } from "./world-state.js";

export class PuTownScene extends Phaser.Scene {
  readonly #inbox = new NetworkInbox();
  #meetingArea?: MeetingArea;
  #client?: ReconnectingGameClient;
  #interface?: JoinInterface;
  #gameInterface?: GameInterface;
  #frameBoundary?: NetworkFrameBoundary;
  #avatarReconciler?: AvatarReconciler;
  #websocketUrl = "";
  // The Room whose pinned collection is loaded and active, and the one being fetched.
  #collectionRoomId: string | null = null;
  #pendingCollectionRoomId: string | null = null;

  constructor() {
    super("pu-town");
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x182132);
    this.#meetingArea = new MeetingArea(this);
    this.#avatarReconciler = new AvatarReconciler(this);
    this.#frameBoundary = new NetworkFrameBoundary(this.#inbox, emptyWorld(), this.#avatarReconciler);

    const parameters = new URLSearchParams(window.location.search);
    this.#websocketUrl = parameters.get("ws") || "ws://localhost:8080/ws/game";
    let recoveryStorage: Storage | undefined;
    try { recoveryStorage = window.sessionStorage; } catch { /* In-memory recovery remains available. */ }
    this.#client = new ReconnectingGameClient(() => new WebSocket(this.#websocketUrl), this.#inbox, Date.now, recoveryStorage);
    const healthTimer = window.setInterval(() => this.#client?.checkHealth(), 1_000);
    this.#interface = new JoinInterface(this.#client);
    this.#gameInterface = new GameInterface(this.#client);
    if (this.input.keyboard) this.input.keyboard.enabled = false;
    const resumed = () => this.#client?.checkHealth(true);
    const visibilityChanged = () => { if (!document.hidden) resumed(); };
    window.addEventListener("focus", resumed);
    document.addEventListener("visibilitychange", visibilityChanged);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("focus", resumed);
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.clearInterval(healthTimer);
      this.#client?.stop();
      this.#interface?.destroy();
      this.#gameInterface?.destroy();
    });
  }

  /**
   * A Room's artwork arrives on join, so the entry screen stays up until every texture and
   * walk animation exists. Room events wait in the inbox until then.
   */
  private readyForRoomArtwork(): boolean {
    const state = this.#client?.state;
    // A Room Code can be reused by a later Room pinning a later collection, so entry
    // resolves it afresh; Reconnect keeps the collection its membership already has.
    if (state?.status === "join") {
      this.#collectionRoomId = null;
      this.#pendingCollectionRoomId = null;
    }
    const entering = state?.status === "playing" ? state.roomId : null;
    if (entering === null || entering === this.#collectionRoomId) return true;
    if (entering !== this.#pendingCollectionRoomId) {
      this.#pendingCollectionRoomId = entering;
      void this.prepareAvatarCollection(entering);
    }
    return false;
  }

  private async prepareAvatarCollection(roomId: string): Promise<void> {
    try {
      const collection = await fetchAvatarCollection(this.#websocketUrl, roomId);
      await loadAvatarCollection(this, collection);
      if (this.#pendingCollectionRoomId !== roomId) return;
      setActiveAvatarCollection(collection);
      this.#interface?.setAvatarCollection(collection);
      this.#collectionRoomId = roomId;
    } catch {
      if (this.#pendingCollectionRoomId !== roomId) return;
      this.#pendingCollectionRoomId = null;
      this.#client?.abandon("Could not load this Room's characters. Please try again.");
    }
  }

  update(time: number): void {
    // Network state is always applied before this frame renders controls or Avatars.
    this.#client?.update();
    if (!this.readyForRoomArtwork()) return;
    this.#frameBoundary?.beginFrame();
    const world = this.#frameBoundary?.world;
    this.#interface?.render(world);
    this.#gameInterface?.render(world);
    // Players stay seated in the Meeting Area for the whole Room, Lobby and Game alike.
    this.#meetingArea?.setVisible(world?.phase !== null && world?.phase !== undefined);
    if (this.#client?.state.status === "join") this.#frameBoundary?.reset();
    this.#avatarReconciler?.updateAnimations(time);
  }
}
