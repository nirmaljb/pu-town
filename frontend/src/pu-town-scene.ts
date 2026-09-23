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
import { FieldController } from "./field-controller.js";
import { HALL_X, HALL_Y, VISION, WORLD_HEIGHT, WORLD_WIDTH } from "./room-rules.js";

/** Keys that walk; anything typed into a text field is left alone. */
const MOVEMENT_KEYS: Readonly<Record<string, "up" | "down" | "left" | "right">> = {
  KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down",
  KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right"
};

export class PuTownScene extends Phaser.Scene {
  readonly #inbox = new NetworkInbox();
  #meetingArea?: MeetingArea;
  #client?: ReconnectingGameClient;
  #interface?: JoinInterface;
  #gameInterface?: GameInterface;
  #frameBoundary?: NetworkFrameBoundary;
  #avatarReconciler?: AvatarReconciler;
  #field?: FieldController;
  #fog?: Phaser.GameObjects.Graphics;
  readonly #held = { up: false, down: false, left: false, right: false };
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
    const client = this.#client;
    this.#field = new FieldController((x, y, facing) => client.move(x, y, facing));
    this.#fog = this.add.graphics().setDepth(6_000);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.centerOn(HALL_X + 640, HALL_Y + 360);
    if (this.input.keyboard) this.input.keyboard.enabled = false;
    const typing = (event: KeyboardEvent) => event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    const keyChanged = (held: boolean) => (event: KeyboardEvent) => {
      const direction = MOVEMENT_KEYS[event.code];
      if (!direction || (held && typing(event))) return;
      this.#held[direction] = held;
      if (held && this.#field?.position) event.preventDefault();
    };
    const keyDown = keyChanged(true);
    const keyUp = keyChanged(false);
    const release = () => { this.#held.up = this.#held.down = this.#held.left = this.#held.right = false; };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", release);
    const resumed = () => this.#client?.checkHealth(true);
    const visibilityChanged = () => { if (!document.hidden) resumed(); };
    window.addEventListener("focus", resumed);
    document.addEventListener("visibilitychange", visibilityChanged);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("focus", resumed);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", release);
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

  update(time: number, delta: number): void {
    // Network state is always applied before this frame renders controls or Avatars.
    this.#client?.update();
    if (!this.readyForRoomArtwork()) return;
    this.#frameBoundary?.beginFrame();
    const world = this.#frameBoundary?.world;
    this.#field?.update(world, this.#held, delta, time);
    const self = this.#field?.position ?? null;
    this.#interface?.render(world);
    this.#gameInterface?.render(world, self);
    this.#meetingArea?.setVisible(world?.phase !== null && world?.phase !== undefined);
    if (this.#client?.state.status === "join") this.#frameBoundary?.reset();
    this.#avatarReconciler?.updateAnimations(time, delta, self);
    // During a Roam the camera follows this Player; otherwise it frames the Town Hall.
    const camera = this.cameras.main;
    const focusX = self?.x ?? HALL_X + 640;
    const focusY = self?.y ?? HALL_Y + 360;
    const follow = Math.min(1, delta / 1_000 * (self ? 10 : 6));
    camera.centerOn(camera.midPoint.x + (focusX - camera.midPoint.x) * follow,
      camera.midPoint.y + (focusY - camera.midPoint.y) * follow);
    // The living see only a circle around themselves; the server sends nothing beyond it.
    this.#fog?.clear();
    const living = world?.game?.self.status === "living";
    if (self && living) {
      this.#fog?.lineStyle(3_000, 0x05070d, 0.86).strokeCircle(self.x, self.y, VISION + 1_500);
      this.#fog?.lineStyle(60, 0x05070d, 0.45).strokeCircle(self.x, self.y, VISION - 30);
    }
  }
}
