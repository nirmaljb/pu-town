import { GameTransport } from "./game-transport.js";
import { NetworkInbox } from "./network-inbox.js";

export type GameSocketFactory = () => WebSocket;
export type ReconnectScheduler = (reconnect: () => void) => void;

type JoinIntent = Readonly<{ roomId: string; displayName: string }>;
const SOCKET_OPEN = 1;

export class ReconnectingGameClient {
  #socket: WebSocket | null = null;
  #transport: GameTransport | null = null;
  #joinIntent: JoinIntent | null = null;
  #leaveRequested = false;
  #generation = 0;
  #stopped = false;

  constructor(
    private readonly createSocket: GameSocketFactory,
    private readonly inbox: NetworkInbox,
    private readonly scheduleReconnect: ReconnectScheduler = reconnect => {
      window.setTimeout(reconnect, 500);
    },
    private readonly onProtocolError: (error: Error) => void = error => console.error(error)
  ) {
    this.openConnection();
  }

  join(roomId: string, displayName: string): void {
    this.#joinIntent = { roomId, displayName };
    this.#leaveRequested = false;
    if (this.#socket?.readyState === SOCKET_OPEN) this.#transport?.join(roomId, displayName);
  }

  leave(): void {
    if (this.#joinIntent !== null && this.#socket?.readyState === SOCKET_OPEN) {
      this.#leaveRequested = true;
      this.#transport?.leave();
    } else {
      this.#joinIntent = null;
      this.#leaveRequested = false;
    }
  }

  move(x: number, y: number): void {
    if (this.#joinIntent !== null && this.#socket?.readyState === SOCKET_OPEN) {
      this.#transport?.move(x, y);
    }
  }

  stop(): void {
    this.#stopped = true;
    this.#joinIntent = null;
    this.#leaveRequested = false;
    this.#socket?.close();
  }

  private openConnection(): void {
    if (this.#stopped) return;
    const generation = ++this.#generation;
    const socket = this.createSocket();
    const transport = new GameTransport(socket, this.inbox, this.onProtocolError, message => {
      if (generation === this.#generation && message.type === "room_left" && this.#leaveRequested) {
        this.#joinIntent = null;
        this.#leaveRequested = false;
      }
    });
    this.#socket = socket;
    this.#transport = transport;

    socket.addEventListener("open", () => {
      if (generation !== this.#generation) return;
      const joinIntent = this.#joinIntent;
      if (joinIntent !== null) {
        this.#leaveRequested = false;
        transport.join(joinIntent.roomId, joinIntent.displayName);
      }
    });
    socket.addEventListener("close", () => {
      if (generation !== this.#generation || this.#stopped || this.#joinIntent === null) return;
      this.scheduleReconnect(() => this.openConnection());
    });
  }
}
