import { GameTransport, type GameSocket } from "./game-transport.js";
import { NetworkInbox } from "./network-inbox.js";

export interface ReconnectableGameSocket extends GameSocket {
  readonly readyState: number;
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "close", listener: () => void): void;
  close(): void;
}

export type GameSocketFactory = () => ReconnectableGameSocket;
export type ReconnectScheduler = (reconnect: () => void) => void;

type DesiredMembership = Readonly<{ roomId: string; displayName: string }>;
const SOCKET_OPEN = 1;

export class ReconnectingGameClient {
  #socket: ReconnectableGameSocket | null = null;
  #transport: GameTransport | null = null;
  #desiredMembership: DesiredMembership | null = null;
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
    this.#desiredMembership = { roomId, displayName };
    if (this.#socket?.readyState === SOCKET_OPEN) this.#transport?.join(roomId, displayName);
  }

  leave(): void {
    this.#desiredMembership = null;
    if (this.#socket?.readyState === SOCKET_OPEN) this.#transport?.leave();
  }

  move(x: number, y: number): void {
    if (this.#desiredMembership !== null && this.#socket?.readyState === SOCKET_OPEN) {
      this.#transport?.move(x, y);
    }
  }

  stop(): void {
    this.#stopped = true;
    this.#desiredMembership = null;
    this.#socket?.close();
  }

  private openConnection(): void {
    if (this.#stopped) return;
    const generation = ++this.#generation;
    const socket = this.createSocket();
    const transport = new GameTransport(socket, this.inbox, this.onProtocolError);
    this.#socket = socket;
    this.#transport = transport;

    socket.addEventListener("open", () => {
      if (generation !== this.#generation) return;
      const desiredMembership = this.#desiredMembership;
      if (desiredMembership !== null) transport.join(desiredMembership.roomId, desiredMembership.displayName);
    });
    socket.addEventListener("close", () => {
      if (generation !== this.#generation || this.#stopped || this.#desiredMembership === null) return;
      this.scheduleReconnect(() => this.openConnection());
    });
  }
}
