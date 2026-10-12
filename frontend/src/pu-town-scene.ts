import { DeveloperInterface } from "./developer-interface.js";
import { MapInterface } from "./map-interface.js";
import type { MapId } from "./protocol.js";
import { setTownGeometry } from "./room-rules.js";
import { MicrophoneSettings } from "./microphone-settings.js";
import { VoiceController } from "./voice-controller.js";
import Phaser from "phaser";
import { AudioMixer } from "./audio-mixer.js";
import { SettingsInterface } from "./settings-interface.js";
import { loadTownMap, MeetingArea } from "./meeting-area.js";
import { SoundEffects } from "./sound-effects.js";
import { TaskInterface } from "./task-interface.js";
import { GameInterface } from "./game-interface.js";
import { JoinInterface } from "./join-interface.js";
import { AvatarReconciler, loadAvatarCollection } from "./avatar-reconciler.js";
import { fetchAvatarCollection, setActiveAvatarCollection } from "./avatar-presets.js";
import { NetworkFrameBoundary } from "./network-frame-boundary.js";
import { NetworkInbox } from "./network-inbox.js";
import { ReconnectingGameClient } from "./reconnecting-game-client.js";
import { emptyWorld } from "./world-state.js";
import { FieldController } from "./field-controller.js";
import { BUTTON_X, BUTTON_Y, ROOM_HEIGHT, ROOM_WIDTH, WORLD_HEIGHT, WORLD_WIDTH } from "./room-rules.js";

/** Keys that walk; anything typed into a text field is left alone. */
const MOVEMENT_KEYS: Readonly<Record<string, "up" | "down" | "left" | "right">> = {
  KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down",
  KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right"
};

export class PuTownScene extends Phaser.Scene {
  readonly #inbox = new NetworkInbox();
  #meetingArea?: MeetingArea;
  #mapInterface?: MapInterface;
  #mapId: MapId = "village";
  #client?: ReconnectingGameClient;
  #interface?: JoinInterface;
  #developerInterface?: DeveloperInterface;
  #gameInterface?: GameInterface;
  #taskInterface?: TaskInterface;
  #effects?: SoundEffects;
  #audio?: AudioMixer;
  #voice?: VoiceController;
  #settings?: SettingsInterface;
  #frameBoundary?: NetworkFrameBoundary;
  #avatarReconciler?: AvatarReconciler;
  #field?: FieldController;
  readonly #held = { up: false, down: false, left: false, right: false };
  #websocketUrl = "";
  // The Room whose pinned collection is loaded and active, and the one being fetched.
  #collectionRoomId: string | null = null;
  #pendingCollectionRoomId: string | null = null;

  constructor() {
    super("pu-town");
  }

  preload(): void {
    loadTownMap(this);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x182132);
    setTownGeometry(this.cache.json.get("rules-village"));
    this.#meetingArea = new MeetingArea(this);
    this.#avatarReconciler = new AvatarReconciler(this);
    this.#frameBoundary = new NetworkFrameBoundary(this.#inbox, emptyWorld(), {
      reconcile: (world, arrivals) => {
        // Select geometry before chairs and Avatars reconcile, at this same frame boundary.
        this.selectTownMap(world.mapId);
        this.#avatarReconciler?.reconcile(world, arrivals);
      }
    });

    const parameters = new URLSearchParams(window.location.search);
    this.#websocketUrl = parameters.get("ws") || "ws://localhost:8080/ws/game";
    let recoveryStorage: Storage | undefined;
    try { recoveryStorage = window.sessionStorage; } catch { /* In-memory recovery remains available. */ }
    this.#client = new ReconnectingGameClient(() => new WebSocket(this.#websocketUrl), this.#inbox, Date.now, recoveryStorage);
    const healthTimer = window.setInterval(() => this.#client?.checkHealth(), 1_000);
    this.#interface = new JoinInterface(this.#client);
    this.#gameInterface = new GameInterface(this.#client);
    this.#developerInterface = new DeveloperInterface(this.#client);
    const backend = new URL(this.#websocketUrl);
    if (["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) && ["localhost", "127.0.0.1", "[::1]"].includes(backend.hostname)) {
      backend.protocol = backend.protocol === "wss:" ? "https:" : "http:"; backend.pathname = "/developer/capabilities"; backend.search = "";
      void fetch(backend).then(response => response.ok ? response.json() : null).then(data => this.#interface?.setDeveloperAvailable(data?.enabled === true)).catch(() => {});
      if (parameters.has("devRoom") && parameters.has("devPlayer") && this.#client.state.status === "join") this.#client.takeDeveloper(parameters.get("devRoom")!, parameters.get("devPlayer")!);
    }

    this.#audio = new AudioMixer();
    const microphone = new MicrophoneSettings();
    this.#voice = new VoiceController(this.#client, this.#audio, this.#websocketUrl, microphone);
    this.#effects = new SoundEffects(this.#audio);
    this.#effects.start();
    this.#taskInterface = new TaskInterface(this.#client, this.#effects);
    this.#settings = new SettingsInterface(this.#audio, microphone);
    this.#mapInterface = new MapInterface();
    const client = this.#client;
    this.#field = new FieldController((x, y, facing) => client.move(x, y, facing));
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.centerOn(BUTTON_X, BUTTON_Y);
    if (this.input.keyboard) this.input.keyboard.enabled = false;
    const typing = (event: KeyboardEvent) => event.target instanceof HTMLElement && Boolean(event.target.closest("input, textarea, select, [contenteditable]"));
    const keyChanged = (held: boolean) => (event: KeyboardEvent) => {
      const direction = MOVEMENT_KEYS[event.code];
      if (!direction || (held && (typing(event) || document.querySelector("dialog:modal")))) return;
      this.#held[direction] = held;
      if (held && this.#field?.position) event.preventDefault();
    };
    const keyDown = keyChanged(true);
    const keyUp = keyChanged(false);
    const release = () => { this.#held.up = this.#held.down = this.#held.left = this.#held.right = false; };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", release);
    const resumed = () => { this.#client?.checkHealth(true); this.#gameInterface?.foregrounded(); };
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
      this.#developerInterface?.destroy();
      this.#taskInterface?.destroy();
      this.#settings?.destroy();
      this.#mapInterface?.destroy();
      this.#meetingArea?.destroy();
      this.#effects?.destroy();
      this.#voice?.destroy();
      this.#audio?.destroy();
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

  private selectTownMap(mapId: MapId): void {
    if (mapId === this.#mapId) return;
    setTownGeometry(this.cache.json.get(`rules-${mapId}`));
    this.#meetingArea?.destroy();
    this.#meetingArea = new MeetingArea(this, mapId);
    this.#mapId = mapId;
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.centerOn(BUTTON_X, BUTTON_Y);
  }

  update(time: number, delta: number): void {
    // Network state is always applied before this frame renders controls or Avatars.
    this.#client?.update();
    if (!this.readyForRoomArtwork()) return;
    this.#frameBoundary?.beginFrame();
    const world = this.#frameBoundary?.world;
    this.#mapInterface?.render(world, this.#client?.state.status === "playing", this.#field?.position ?? null);
    const phaseBlocked = this.#gameInterface?.prepareFrame(world, this.#settings?.reducedMotion ?? false);
    if (phaseBlocked || document.querySelector("dialog:modal") || this.#mapInterface?.open || (document.activeElement?.matches("input, textarea, select") && document.activeElement.closest(".developer-panel"))) this.#held.up = this.#held.down = this.#held.left = this.#held.right = false;
    this.#field?.update(world, this.#held, delta, time);
    const self = this.#field?.position ?? null;
    this.#interface?.render(world);
    this.#gameInterface?.render(world, self);
    this.#developerInterface?.render(world);
    this.#avatarReconciler?.setSpeaking(this.#voice?.render(world) ?? new Set());
    this.#taskInterface?.render(world);
    this.#effects?.update(world, this.#client?.state.status === "playing");
    const atTitle = this.#client?.state.status === "join" || this.#client?.state.status === "connecting";
    this.#meetingArea?.setVisible(atTitle || (world?.phase !== null && world?.phase !== undefined), !atTitle && !world?.field);
    if (this.#client?.state.status === "join") this.#frameBoundary?.reset();
    const reducedMotion = this.#settings?.reducedMotion ?? false;
    this.#avatarReconciler?.updateAnimations(time, delta, self, reducedMotion);
    this.#meetingArea?.setReducedMotion(reducedMotion);
    // During Day and sleeping Night the camera follows this Player; otherwise it frames the Town Square.
    const camera = this.cameras.main;
    // Seated phases must keep the whole Town Square visible, including on portrait displays.
    // Exploration/title cover the viewport; a seated view expands the camera instead of cropping Seats.
    const seated = !atTitle && !world?.field;
    const left = BUTTON_X - 330;
    const right = BUTTON_X + 330;
    const top = BUTTON_Y - 205;
    const bottom = BUTTON_Y + 205;
    const seatedWidth = Math.max(420, right - left + 190);
    const seatedHeight = Math.max(320, bottom - top + 190);
    const lobbyHeight = world?.phase === "lobby" ? document.querySelector(".lobby-sidebar")?.getBoundingClientRect().height ?? 220 : 0;
    const horizontalZoom = (this.scale.width - (seated ? 32 : 0)) / (seated ? seatedWidth : ROOM_WIDTH);
    const verticalZoom = (this.scale.height - (seated ? Math.max(150, lobbyHeight + 90) : 0)) / (seated ? seatedHeight : ROOM_HEIGHT);
    const zoom = seated ? Math.max(0.1, Math.min(horizontalZoom, verticalZoom)) : Math.max(horizontalZoom, verticalZoom);
    if (camera.zoom !== zoom) camera.setZoom(zoom);
    const focusX = self?.x ?? (left + right) / 2;
    const focusY = self?.y ?? (top + bottom) / 2 + (world?.phase === "lobby" ? lobbyHeight / (2 * zoom) : -20);
    const follow = reducedMotion ? 1 : Math.min(1, delta / 1_000 * (self ? 10 : 6));
    camera.centerOn(camera.midPoint.x + (focusX - camera.midPoint.x) * follow,
      camera.midPoint.y + (focusY - camera.midPoint.y) * follow);
    this.#meetingArea?.update(camera);
  }
}
