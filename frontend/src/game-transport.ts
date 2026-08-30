import { NetworkInbox } from "./network-inbox.js";
import {
  decodeServerMessage,
  joinRoom,
  leaveRoom,
  movePlayer,
  type ClientMessage,
  type ServerMessage
} from "./protocol.js";

export interface GameSocket {
  send(data: string): void;
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
}

export class GameTransport {
  constructor(
    private readonly socket: GameSocket,
    private readonly inbox: NetworkInbox,
    onProtocolError: (error: Error) => void = () => undefined,
    onServerMessage: (message: ServerMessage) => void = () => undefined
  ) {
    socket.addEventListener("message", event => {
      try {
        if (typeof event.data !== "string") throw new Error("Server message must be text");
        const message = decodeServerMessage(event.data);
        inbox.enqueue(message);
        onServerMessage(message);
      } catch (error) {
        onProtocolError(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  join(roomId: string, displayName: string): void {
    this.send(joinRoom(roomId, displayName));
  }

  leave(): void {
    this.send(leaveRoom());
  }

  move(x: number, y: number): void {
    this.send(movePlayer(x, y));
  }

  private send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }
}
