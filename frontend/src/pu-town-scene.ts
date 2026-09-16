import Phaser from "phaser";
import { MeetingArea } from "./meeting-area.js";
import { JoinInterface } from "./join-interface.js";
import { AvatarReconciler, loadAvatarCollection } from "./avatar-reconciler.js";
import { fetchAvatarCollection, setActiveAvatarCollection } from "./avatar-presets.js";
import { NetworkFrameBoundary } from "./network-frame-boundary.js";
import { NetworkInbox } from "./network-inbox.js";
import { ReconnectingGameClient } from "./reconnecting-game-client.js";
import { MOVEMENT_SEND_INTERVAL_MS } from "./room-rules.js";
import { emptyWorld } from "./world-state.js";

export class PuTownScene extends Phaser.Scene {
  readonly #inbox = new NetworkInbox();
  #meetingArea?: MeetingArea;
  #client?: ReconnectingGameClient;
  #interface?: JoinInterface;
  #frameBoundary?: NetworkFrameBoundary;
  #avatarReconciler?: AvatarReconciler;
  #cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  #lastMovementSentAt = 0;
  #focused = true;
  #restored = false;
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
    this.#cursors = this.input.keyboard?.createCursorKeys();

    const parameters = new URLSearchParams(window.location.search);
    this.#websocketUrl = parameters.get("ws") || "ws://localhost:8080/ws/game";
    let recoveryStorage: Storage | undefined;
    try { recoveryStorage = window.sessionStorage; } catch { /* In-memory recovery remains available. */ }
    this.#client = new ReconnectingGameClient(() => new WebSocket(this.#websocketUrl), this.#inbox, Date.now, recoveryStorage);
    const healthTimer = window.setInterval(() => this.#client?.checkHealth(), 1_000);
    this.#interface = new JoinInterface(this.#client);
    if (this.input.keyboard) this.input.keyboard.enabled = false;
    const loseFocus = () => {
      this.#focused = false;
      if (this.#cursors) for (const key of Object.values(this.#cursors)) key.reset();
    };
    const restoreFocus = () => {
      this.#focused = !document.hidden && document.hasFocus();
      this.#restored = true;
    };
    const visibilityChanged = () => {
      if (document.hidden) loseFocus();
      else {
        this.#client?.checkHealth(true);
        restoreFocus();
      }
    };
    this.#focused = !document.hidden && document.hasFocus();
    window.addEventListener("blur", loseFocus);
    window.addEventListener("focus", restoreFocus);
    document.addEventListener("visibilitychange", visibilityChanged);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("blur", loseFocus);
      window.removeEventListener("focus", restoreFocus);
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.clearInterval(healthTimer);
      this.#client?.stop();
      this.#interface?.destroy();
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

  update(time: number, delta: number): void {
    // Network state is always applied before this frame reads controls or mutates Phaser objects.
    this.#client?.update();
    if (!this.readyForRoomArtwork()) return;
    this.#frameBoundary?.beginFrame();
    const world = this.#frameBoundary?.world;
    this.#interface?.render(world);
    this.#meetingArea?.setVisible(world?.phase === "lobby");
    const playing = this.#client?.state.status === "playing" && world?.phase === "playing";
    const acceptsInput = playing && this.#focused && !this.#restored;
    this.#restored = false;
    if (this.input.keyboard) this.input.keyboard.enabled = acceptsInput;
    if (!acceptsInput && this.#cursors) for (const key of Object.values(this.#cursors)) key.reset();
    if (!playing) {
      this.#avatarReconciler?.updateAnimations(time, null, true);
      if (this.#client?.state.status === "join") this.#frameBoundary?.reset();
      return;
    }
    const selfPlayerId = world?.selfPlayerId;
    const movement = this.#frameBoundary?.localMovement;
    if (!selfPlayerId || !movement || !this.#cursors) return;
    const horizontal = acceptsInput ? Number(this.#cursors.right.isDown) - Number(this.#cursors.left.isDown) : 0;
    const vertical = acceptsInput ? Number(this.#cursors.down.isDown) - Number(this.#cursors.up.isDown) : 0;
    movement.advance(horizontal, vertical, delta);
    this.#avatarReconciler?.moveLocally(selfPlayerId, movement.x, movement.y, movement.facing);
    this.#avatarReconciler?.updateAnimations(time, selfPlayerId, !acceptsInput);
    if (movement.dirty && ((horizontal === 0 && vertical === 0) || time - this.#lastMovementSentAt >= MOVEMENT_SEND_INTERVAL_MS)) {
      const update = movement.submission();
      this.#client?.move(update);
      this.#lastMovementSentAt = time;
    }
  }
}
