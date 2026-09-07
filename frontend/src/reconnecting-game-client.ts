import { GameTransport } from "./game-transport.js";
import { NetworkInbox } from "./network-inbox.js";
import { createRoom, joinRoom, type ClientMessage, type ServerMessage } from "./protocol.js";

export type ConnectionState = Readonly<{
  status: "join" | "connecting" | "playing" | "reconnecting" | "failed" | "leaving";
  roomId: string | null;
  error: string | null;
}>;

export class ReconnectingGameClient {
  #socket: WebSocket | null = null;
  #transport: GameTransport | null = null;
  #intent: ClientMessage | null = null;
  #generation = 0;
  #deadline = 0;
  #lastResponse = 0;
  #nextPing = 0;
  #retryAt = 0;
  #attemptDeadline = 0;
  #messages: ServerMessage[] = [];
  #state: ConnectionState = { status: "join", roomId: null, error: null };

  constructor(
    private readonly createSocket: () => WebSocket,
    private readonly inbox: NetworkInbox,
    private readonly now: () => number = Date.now
  ) {}

  get state(): ConnectionState { return this.#state; }

  create(displayName: string): void { this.start(createRoom(displayName)); }
  join(roomId: string, displayName: string): void { this.start(joinRoom(roomId, displayName)); }

  private start(intent: ClientMessage): void {
    if (this.#state.status !== "join") return;
    this.#intent = intent;
    this.#state = { status: "connecting", roomId: null, error: null };
    this.#deadline = this.now() + 10_000;
    this.openConnection();
  }

  /** Process decoded lifecycle messages at the start of the game frame. */
  update(): void {
    if (this.#state.status === "connecting" && this.now() >= this.#deadline) {
      this.cancel();
      this.#state = { ...this.#state, error: "Connection timed out. Please try again." };
      return;
    }
    if (this.#state.status === "reconnecting" && this.now() >= this.#deadline) {
      this.closeConnection();
      this.#state = { ...this.#state, status: "failed", error: "Could not reconnect." };
      return;
    }
    if (this.#state.status === "leaving" && this.now() >= this.#deadline) { this.cancel(); return; }
    for (const message of this.#messages.splice(0)) {
      if (message.type === "room_left" && this.#state.status === "leaving") { this.cancel(); return; }
      if (message.type === "error") {
        if (this.#state.status !== "playing") {
          this.cancel();
          this.#state = { ...this.#state, error: message.message };
          return;
        }
        this.#state = { ...this.#state, error: message.message };
      }
      if (message.type === "room_snapshot" && this.#intent && "displayName" in this.#intent) {
        this.#intent = joinRoom(message.roomId, this.#intent.displayName);
        this.#state = { status: "playing", roomId: message.roomId, error: null };
        this.#lastResponse = this.now();
        this.#nextPing = this.now() + 5_000;
      }
    }
    if (this.#state.status === "playing") {
      if (this.now() - this.#lastResponse >= 10_000) this.disconnected();
      else if (this.now() >= this.#nextPing) {
        this.#socket?.send(JSON.stringify({ version: 1, type: "ping" }));
        this.#nextPing = this.now() + 5_000;
      }
    }
    if (this.#state.status === "reconnecting") {
      if (this.#socket && this.now() >= this.#attemptDeadline) this.disconnected();
      if (!this.#socket && this.now() >= this.#retryAt) this.openConnection();
    }
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
      this.#deadline = this.now() + 30_000;
    }
    this.#retryAt = this.now() + 500;
  }

  private closeConnection(): void {
    ++this.#generation;
    this.#socket?.close();
    this.#socket = null;
    this.#transport = null;
    this.#messages = [];
    this.inbox.drain();
  }

  move(x: number, y: number): void {
    if (this.#state.status === "playing" && this.#socket?.readyState === 1) this.#transport?.move(x, y);
  }

  leave(): void {
    if (this.#state.status !== "playing") return;
    this.#state = { ...this.#state, status: "leaving", error: null };
    this.#deadline = this.now() + 10_000;
    this.#transport?.leave();
  }

  retry(): void {
    if (this.#state.status !== "failed") return;
    this.#state = { ...this.#state, status: "reconnecting", error: null };
    this.#deadline = this.now() + 30_000;
    this.openConnection();
  }

  stop(): void { this.cancel(); }

  cancel(): void {
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
      if (message.type === "pong") this.#lastResponse = this.now();
      this.#messages.push(message);
    }, () => generation === this.#generation);
    socket.addEventListener("close", () => {
      if (generation === this.#generation) this.disconnected();
    });
    socket.addEventListener("open", () => {
      if (generation === this.#generation && this.#intent) socket.send(JSON.stringify(this.#intent));
    });
  }
}
