export const PROTOCOL_VERSION = 1 as const;

export type PlayerView = Readonly<{
  playerId: string;
  displayName: string;
  colour: string;
  x: number;
  y: number;
}>;

export type ServerMessage =
  | Readonly<{ version: 1; type: "pong" }>
  | Readonly<{ version: 1; type: "room_snapshot"; selfPlayerId: string; roomId: string; players: readonly PlayerView[] }>
  | Readonly<{ version: 1; type: "player_joined"; player: PlayerView }>
  | Readonly<{ version: 1; type: "player_moved"; playerId: string; x: number; y: number }>
  | Readonly<{ version: 1; type: "player_left"; playerId: string; reason: "left" | "disconnected" }>
  | Readonly<{ version: 1; type: "room_left"; roomId: string }>
  | Readonly<{ version: 1; type: "error"; code: string; message: string }>;

export type ClientMessage =
  | Readonly<{ version: 1; type: "create_room"; displayName: string }>
  | Readonly<{ version: 1; type: "ping" }>
  | Readonly<{ version: 1; type: "join_room"; roomId: string; displayName: string }>
  | Readonly<{ version: 1; type: "leave_room" }>
  | Readonly<{ version: 1; type: "move_player"; x: number; y: number }>;

export function joinRoom(roomId: string, displayName: string): ClientMessage {
  requireNonEmptyString(roomId, "roomId");
  displayName = normalizeDisplayName(displayName);
  roomId = roomId.trim().toUpperCase();
  return { version: PROTOCOL_VERSION, type: "join_room", roomId, displayName };
}

export function normalizeDisplayName(value: string): string {
  const name = value.trim();
  if ([...name].length < 1 || [...name].length > 24) throw new Error("Display Name must be 1–24 characters.");
  return name;
}

export function createRoom(displayName: string): ClientMessage {
  return { version: 1, type: "create_room", displayName: normalizeDisplayName(displayName) };
}

export function leaveRoom(): ClientMessage {
  return { version: PROTOCOL_VERSION, type: "leave_room" };
}

export function movePlayer(x: number, y: number): ClientMessage {
  requireFiniteNumber(x, "x");
  requireFiniteNumber(y, "y");
  return { version: PROTOCOL_VERSION, type: "move_player", x, y };
}

export function decodeServerMessage(payload: string): ServerMessage {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    throw new Error("Server message must be valid JSON");
  }
  const message = requireRecord(value, "Server message");
  if (message.version !== PROTOCOL_VERSION) throw new Error("Only protocol version 1 is supported");
  const type = requireNonEmptyString(message.type, "type");

  switch (type) {
    case "pong":
      requireFields(message, ["version", "type"]);
      return { version: 1, type };
    case "room_snapshot": {
      requireFields(message, ["version", "type", "selfPlayerId", "roomId", "players"]);
      if (!Array.isArray(message.players)) throw new Error("players must be an array");
      return {
        version: 1,
        type,
        selfPlayerId: requireNonEmptyString(message.selfPlayerId, "selfPlayerId"),
        roomId: requireNonEmptyString(message.roomId, "roomId"),
        players: message.players.map(decodePlayer)
      };
    }
    case "player_joined":
      requireFields(message, ["version", "type", "player"]);
      return { version: 1, type, player: decodePlayer(message.player) };
    case "player_moved":
      requireFields(message, ["version", "type", "playerId", "x", "y"]);
      return {
        version: 1,
        type,
        playerId: requireNonEmptyString(message.playerId, "playerId"),
        x: requireFiniteNumber(message.x, "x"),
        y: requireFiniteNumber(message.y, "y")
      };
    case "player_left": {
      requireFields(message, ["version", "type", "playerId", "reason"]);
      if (message.reason !== "left" && message.reason !== "disconnected") {
        throw new Error("reason must be left or disconnected");
      }
      return {
        version: 1,
        type,
        playerId: requireNonEmptyString(message.playerId, "playerId"),
        reason: message.reason
      };
    }
    case "room_left":
      requireFields(message, ["version", "type", "roomId"]);
      return { version: 1, type, roomId: requireNonEmptyString(message.roomId, "roomId") };
    case "error":
      requireFields(message, ["version", "type", "code", "message"]);
      return {
        version: 1,
        type,
        code: requireNonEmptyString(message.code, "code"),
        message: requireNonEmptyString(message.message, "message")
      };
    default:
      throw new Error(`Unknown server message type: ${type}`);
  }
}

function decodePlayer(value: unknown): PlayerView {
  const player = requireRecord(value, "player");
  requireFields(player, ["playerId", "displayName", "colour", "x", "y"]);
  return {
    playerId: requireNonEmptyString(player.playerId, "playerId"),
    displayName: requireNonEmptyString(player.displayName, "displayName"),
    colour: requireColour(player.colour),
    x: requireFiniteNumber(player.x, "x"),
    y: requireFiniteNumber(player.y, "y")
  };
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireFields(value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((field, index) => field !== wanted[index])) {
    throw new Error("Server message fields do not match its type");
  }
}

function requireNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${name} must be a non-empty string`);
  return value;
}

function requireFiniteNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} must be finite`);
  return value;
}

function requireColour(value: unknown): string {
  if (typeof value !== "string" || !/^#[0-9A-F]{6}$/.test(value)) throw new Error("Invalid Player Colour");
  return value;
}
