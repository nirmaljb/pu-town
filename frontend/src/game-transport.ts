import { NetworkInbox } from "./network-inbox.js";
import {
  decodeServerMessage,
  joinRoom,
  leaveRoom,
  type ClientMessage,
  type ServerMessage,
  type VoiceMessage
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
    onServerMessage: (message: ServerMessage) => void = () => undefined,
    isCurrent: () => boolean = () => true,
    onVoice: (message: VoiceMessage) => void = () => undefined
  ) {
    socket.addEventListener("message", event => {
      if (!isCurrent()) return;
      try {
        if (typeof event.data !== "string") throw new Error("Server message must be text");
        const message = decodeServerMessage(event.data);
        // Voice bypasses the frame boundary: it drives only audio, which must keep its routes
        // and its latency while frames pause in a hidden tab (ADR 0016).
        if (message.type === "voice_routes" || message.type === "voice_signal" || message.type === "voice_frame") {
          onVoice(message);
          return;
        }
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

  private send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }
}
