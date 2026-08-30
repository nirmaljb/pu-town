import Phaser from "phaser";
import { AvatarReconciler } from "./avatar-reconciler.js";
import { NetworkFrameBoundary } from "./network-frame-boundary.js";
import { NetworkInbox } from "./network-inbox.js";
import { ReconnectingGameClient } from "./reconnecting-game-client.js";
import { MOVEMENT_SEND_INTERVAL_MS, MOVEMENT_SPEED, ROOM_HEIGHT, ROOM_WIDTH } from "./room-rules.js";
import { emptyWorld } from "./world-state.js";

export class PuTownScene extends Phaser.Scene {
  readonly #inbox = new NetworkInbox();
  #client?: ReconnectingGameClient;
  #frameBoundary?: NetworkFrameBoundary;
  #avatarReconciler?: AvatarReconciler;
  #cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  #localPlayerId: string | null = null;
  #localX = 0;
  #localY = 0;
  #authoritativeX = 0;
  #authoritativeY = 0;
  #lastMovementSentAt = 0;
  #movementDirty = false;

  constructor() {
    super("pu-town");
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x182132);
    this.#avatarReconciler = new AvatarReconciler(this);
    this.#frameBoundary = new NetworkFrameBoundary(this.#inbox, emptyWorld(), this.#avatarReconciler);
    this.#cursors = this.input.keyboard?.createCursorKeys();

    const parameters = new URLSearchParams(window.location.search);
    const roomId = parameters.get("room") || "plaza";
    const displayName = parameters.get("name") || "Player";
    const websocketUrl = parameters.get("ws") || "ws://localhost:8080/ws/game";
    this.#client = new ReconnectingGameClient(() => new WebSocket(websocketUrl), this.#inbox);
    this.#client.join(roomId, displayName);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.#client?.stop());
  }

  update(time: number, delta: number): void {
    // Network state is always applied before this frame reads controls or mutates Phaser objects.
    this.#frameBoundary?.beginFrame();
    const world = this.#frameBoundary?.world;
    const selfPlayerId = world?.selfPlayerId ?? null;
    const authoritativePlayer = selfPlayerId === null ? undefined : world?.players.get(selfPlayerId);
    if (selfPlayerId === null || authoritativePlayer === undefined || this.#cursors === undefined) return;

    if (this.#localPlayerId !== selfPlayerId) {
      this.#localPlayerId = selfPlayerId;
      this.#localX = authoritativePlayer.x;
      this.#localY = authoritativePlayer.y;
    } else if (authoritativePlayer.x !== this.#authoritativeX || authoritativePlayer.y !== this.#authoritativeY) {
      this.#localX = authoritativePlayer.x;
      this.#localY = authoritativePlayer.y;
    }
    this.#authoritativeX = authoritativePlayer.x;
    this.#authoritativeY = authoritativePlayer.y;

    const horizontal = Number(this.#cursors.right.isDown) - Number(this.#cursors.left.isDown);
    const vertical = Number(this.#cursors.down.isDown) - Number(this.#cursors.up.isDown);
    if (horizontal === 0 && vertical === 0) {
      if (this.#movementDirty) {
        this.#client?.move(this.#localX, this.#localY);
        this.#lastMovementSentAt = time;
        this.#movementDirty = false;
      }
      return;
    }
    const magnitude = Math.hypot(horizontal, vertical);
    const distance = MOVEMENT_SPEED * delta / 1_000;
    this.#localX = Phaser.Math.Clamp(this.#localX + horizontal / magnitude * distance, 0, ROOM_WIDTH);
    this.#localY = Phaser.Math.Clamp(this.#localY + vertical / magnitude * distance, 0, ROOM_HEIGHT);
    this.#avatarReconciler?.moveLocally(selfPlayerId, this.#localX, this.#localY);
    this.#movementDirty = true;

    if (time - this.#lastMovementSentAt >= MOVEMENT_SEND_INTERVAL_MS) {
      this.#client?.move(this.#localX, this.#localY);
      this.#lastMovementSentAt = time;
      this.#movementDirty = false;
    }
  }
}
