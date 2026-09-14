import type { MovementState } from "./protocol.js";
import { GameTransport } from "./game-transport.js";
import { NetworkInbox } from "./network-inbox.js";
import { createRoom, decodeServerMessage, joinRoom, recoverRoom, type ClientMessage, type RoomPhase, type ServerMessage } from "./protocol.js";

const RECOVERY_KEY = "pu-town.recovery";
type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type ConnectionState = Readonly<{
  status: "join" | "connecting" | "playing" | "reconnecting" | "failed" | "leaving";
  roomId: string | null;
  error: string | null;
  canJoinAgain?: boolean;
}>;

export class ReconnectingGameClient {
  #phase: RoomPhase | null = null;
  #socket: WebSocket | null = null;
  #transport: GameTransport | null = null;
  #intent: ClientMessage | null = null;
  #displayName = "";
  #displaced = false;
  #release: { socket: WebSocket; deadline: number } | null = null;
  #generation = 0;
  #deadline = 0;
  #lastResponse = 0;
  #nextPing = 0;
  #healthFailed = false;
  #lastHealthCheck = 0;
  #suspensionGraceUsed = false;
  #retryAt = 0;
  #retryDelay = 500;
  #foregroundRetry = false;
  #attemptDeadline = 0;
  #messages: ServerMessage[] = [];
  #state: ConnectionState = { status: "join", roomId: null, error: null };

  constructor(
    private readonly createSocket: () => WebSocket,
    private readonly inbox: NetworkInbox,
    private readonly now: () => number = Date.now,
    private readonly storage?: RecoveryStorage
  ) {
    try {
      const saved = JSON.parse(storage?.getItem(RECOVERY_KEY) ?? "null");
      if (!saved) return;
      if (typeof saved.displayName !== "string" || !/^[a-f0-9]{64}$/.test(saved.recoveryToken)) throw new Error("Invalid recovery intent");
      this.#intent = recoverRoom(saved.roomId, saved.recoveryToken);
      this.#displayName = saved.displayName;
      this.#state = { status: "reconnecting", roomId: saved.roomId, error: null };
      this.#retryDelay = 500;
      this.openConnection();
    } catch { this.clearStoredRecovery(); }
  }

  private clearStoredRecovery(): void {
    try { this.storage?.removeItem(RECOVERY_KEY); } catch { /* Storage can be unavailable. */ }
  }

  get state(): ConnectionState { return this.#state; }

  create(displayName: string): void { this.start(createRoom(displayName)); }
  join(roomId: string, displayName: string): void { this.start(joinRoom(roomId, displayName)); }

  private start(intent: ClientMessage): void {
    if (this.#state.status !== "join") return;
    this.#intent = intent;
    if ("displayName" in intent) this.#displayName = intent.displayName;
    this.#state = { status: "connecting", roomId: null, error: null };
    this.#deadline = this.now() + 10_000;
    this.openConnection();
  }

  /** Process decoded lifecycle messages at the start of the game frame. */
  update(): void {
    if (this.#displaced) {
      this.#displaced = false;
      this.failRecovery("Your connection was replaced by another tab.");
      return;
    }
    if (this.#state.status === "connecting" && this.now() >= this.#deadline) {
      this.cancel();
      this.#state = { ...this.#state, error: "Connection timed out. Please try again." };
      return;
    }
    if (this.#state.status === "leaving" && this.now() >= this.#deadline) { this.cancel(); return; }
    for (const message of this.#messages.splice(0)) {
      if (message.type === "room_left" && this.#state.status === "leaving") { this.cancel(); return; }
      if (message.type === "error") {
        if (message.code === "recovery_in_use" && this.#state.status === "reconnecting") {
          this.disconnected();
          return;
        }
        if (this.#state.status === "reconnecting") {
          this.failRecovery(message.code === "room_not_found"
            ? "The Room is unavailable. Recovery cannot continue; the server may have restarted."
            : message.message, message.code === "recovery_expired");
          return;
        }
        if (this.#state.status !== "playing") {
          this.cancel();
          this.#state = { ...this.#state, error: message.message };
          return;
        }
        this.#state = { ...this.#state, error: message.message };
      }
      if (message.type === "room_snapshot" || message.type === "room_state") this.#phase = message.phase;
      if (message.type === "room_snapshot" && this.#intent && this.#state.status !== "leaving") {
        this.#intent = recoverRoom(message.roomId, message.recoveryToken);
        try { this.storage?.setItem(RECOVERY_KEY, JSON.stringify({ roomId: message.roomId, recoveryToken: message.recoveryToken, displayName: this.#displayName })); }
        catch { /* In-memory recovery still works when storage is unavailable. */ }
        this.#retryDelay = 500;
        this.#state = { status: "playing", roomId: message.roomId, error: null };
        this.#lastResponse = this.now();
        this.#lastHealthCheck = this.now();
        this.#suspensionGraceUsed = false;
        this.#nextPing = this.now() + 5_000;
      }
    }
    if (this.#healthFailed) this.disconnected();
    if (this.#state.status === "reconnecting") {
      if (this.#socket && this.now() >= this.#attemptDeadline) this.disconnected();
      if (this.#foregroundRetry) {
        this.#foregroundRetry = false;
        if (!this.#socket) this.#retryAt = this.now();
      }
      if (!this.#socket && this.now() >= this.#retryAt) this.openConnection();
    }
  }

  /** Transport timer: records health without applying lifecycle or world events. */
  checkHealth(resuming = false): void {
    if (this.#release && this.now() >= this.#release.deadline) {
      const socket = this.#release.socket;
      this.#release = null;
      socket.close();
    }
    if (resuming && this.#state.status === "reconnecting") this.#foregroundRetry = true;
    const now = this.now();
    const delayed = now - this.#lastHealthCheck > 2_000;
    this.#lastHealthCheck = now;
    if (this.#state.status === "playing" && !this.#healthFailed) {
      // A paused timer must give the socket a chance to answer. Only a pong
      // renews this allowance, so repeated focus changes cannot hide failure.
      if ((resuming || delayed) && !this.#suspensionGraceUsed) {
        this.#suspensionGraceUsed = true;
        this.#lastResponse = now;
        this.#nextPing = now;
      }
      if (this.now() - this.#lastResponse >= 10_000) this.#healthFailed = true;
      else if (this.now() >= this.#nextPing) {
        this.#socket?.send(JSON.stringify({ version: 1, type: "ping" }));
        this.#nextPing = this.now() + 5_000;
      }
    }
  }

  private failRecovery(error: string, canJoinAgain = false): void {
    this.closeConnection();
    this.clearStoredRecovery();
    this.#intent = null;
    this.#state = { ...this.#state, status: "failed", error, canJoinAgain };
  }

  private disconnected(): void {
    this.closeConnection();
    if (this.#state.status === "leaving") { this.cancel(); return; }
    if (this.#state.status === "connecting") {
      this.cancel();
      this.#state = { ...this.#state, error: "Could not connect. Please try again." };
      return;
    }
    if (this.#state.status === "playing") {
      this.#state = { ...this.#state, status: "reconnecting", error: null };
      this.#retryDelay = 500;
    }
    this.#retryAt = this.now() + this.#retryDelay;
    this.#retryDelay = Math.min(this.#retryDelay * 2, 5_000);
  }

  private closeConnection(): void {
    this.#phase = null;
    this.#healthFailed = false;
    ++this.#generation;
    this.#socket?.close();
    this.#socket = null;
    this.#transport = null;
    this.#messages = [];
    this.inbox.drain();
  }

  move(movement: MovementState): void {
    if (this.#phase === "playing" && this.#state.status === "playing" && this.#socket?.readyState === 1) this.#transport?.move(movement);
  }

  setReady(ready: boolean): void { this.sendLobbyControl({ version: 1, type: "set_ready", ready }); }

  startGame(): void { this.sendLobbyControl({ version: 1, type: "start_game" }); }

  private sendLobbyControl(message: ClientMessage): void {
    if (this.#phase === "lobby" && this.#state.status === "playing" && this.#socket?.readyState === 1) {
      this.#socket.send(JSON.stringify(message));
    }
  }

  leave(): void {
    if (this.#state.status === "reconnecting" || this.#state.status === "failed") {
      const intent = this.#intent;
      this.cancel();
      if (intent?.type === "recover_room") this.releaseReservation(intent);
      return;
    }
    if (this.#state.status !== "playing") return;
    this.clearStoredRecovery();
    this.#state = { ...this.#state, status: "leaving", error: null };
    this.#deadline = this.now() + 10_000;
    this.#transport?.leave();
  }

  /** A bounded, isolated release attempt cannot feed events back into the game. */
  private releaseReservation(intent: ClientMessage): void {
    const previous = this.#release;
    this.#release = null;
    previous?.socket.close();
    let socket: WebSocket;
    try { socket = this.createSocket(); } catch { return; }
    this.#release = { socket, deadline: this.now() + 10_000 };
    const finish = () => {
      if (this.#release?.socket !== socket) return;
      this.#release = null;
      socket.close();
    };
    socket.addEventListener("open", () => {
      if (this.#release?.socket !== socket) return;
      try {
        socket.send(JSON.stringify(intent));
        socket.send(JSON.stringify({ version: 1, type: "leave_room" }));
      } catch { finish(); }
    });
    socket.addEventListener("message", event => {
      try {
        const message = decodeServerMessage(String(event.data));
        if (message.type === "room_left" || message.type === "error") finish();
      } catch { finish(); }
    });
    socket.addEventListener("close", finish);
    socket.addEventListener("error", finish);
  }

  joinAgain(): void {
    if (!this.#state.canJoinAgain || !this.#state.roomId) return;
    const roomId = this.#state.roomId;
    const displayName = this.#displayName;
    this.cancel();
    this.join(roomId, displayName);
  }

  stop(): void {
    const release = this.#release;
    this.#release = null;
    release?.socket.close();
    this.cancel();
  }

  cancel(): void {
    this.#displaced = false;
    this.#foregroundRetry = false;
    this.clearStoredRecovery();
    this.closeConnection();
    this.#intent = null;
    this.#state = { status: "join", roomId: null, error: null };
  }

  private openConnection(): void {
    const generation = ++this.#generation;
    let socket: WebSocket;
    try { socket = this.createSocket(); }
    catch {
      this.disconnected();
      return;
    }
    this.#socket = socket;
    this.#attemptDeadline = this.now() + 10_000;
    this.#transport = new GameTransport(socket, this.inbox, error => {
      this.#messages.push({ version: 1, type: "error", code: "invalid_server_message", message: error.message });
    }, message => {
      if (message.type === "pong") {
        this.#lastResponse = this.now();
        this.#suspensionGraceUsed = false;
        return;
      }
      this.#messages.push(message);
    }, () => generation === this.#generation);
    socket.addEventListener("close", event => {
      if (generation !== this.#generation) return;
      if (event.code === 4001) {
        this.closeConnection();
        this.clearStoredRecovery();
        this.#displaced = true;
      } else {
        const terminal = this.#state.status === "reconnecting"
          ? this.#messages.find(message => message.type === "error" && message.code !== "recovery_in_use")
          : undefined;
        this.disconnected();
        // Socket closure must not erase a terminal result awaiting its frame.
        if (terminal) this.#messages.push(terminal);
      }
    });
    socket.addEventListener("open", () => {
      if (generation === this.#generation && this.#intent) socket.send(JSON.stringify(this.#intent));
    });
  }
}
