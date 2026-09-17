import { DIRECTIONS, type Direction } from "./avatar-facing.js";
import { requireAvatarPreset, requireSelectableAvatarPreset, type AvatarPreset } from "./avatar-presets.js";

export const PROTOCOL_VERSION = 1 as const;

export type RoomPhase = "lobby" | "playing";

export type PlayerView = Readonly<{
  playerId: string;
  displayName: string;
  colour: string;
  avatarPreset: AvatarPreset;
  seat: number;
  ready: boolean;
  connected: boolean;
  x: number;
  y: number;
  facing: Direction;
}>;

export const GAME_PHASES = ["role_reveal", "night", "night_result", "discussion", "voting", "voting_result", "finished"] as const;
export type GamePhase = typeof GAME_PHASES[number];
export const ROLES = ["mafia", "villager", "doctor", "sheriff"] as const;
export type Role = typeof ROLES[number];
export type Faction = "mafia" | "village";
export type ParticipantStatus = "living" | "eliminated" | "left";
export type ChatChannel = "public" | "mafia";
export const MAX_CHAT_CHARACTERS = 240;

/** One Game Roster entry: it outlives the Room Membership that created it. */
export type RosterEntry = Readonly<{
  playerId: string;
  displayName: string;
  colour: string;
  avatarPreset: AvatarPreset;
  seat: number;
  status: ParticipantStatus;
}>;

/** An accepted Mafia vote or a disclosed Meeting ballot. A null target is an explicit Skip. */
export type Ballot = Readonly<{ voterPlayerId: string; targetPlayerId: string | null }>;

export type GameOutcome = Readonly<{
  kind: "night" | "meeting";
  victimPlayerId: string | null;
  eliminatedPlayerId: string | null;
  eliminatedMafia: boolean | null;
}>;

export type Investigation = Readonly<{ round: number; targetPlayerId: string; mafia: boolean }>;

/** Everything this recipient is entitled to know. Absent fields are absent from the wire. */
export type SelfView = Readonly<{
  role: Role;
  faction: Faction;
  status: ParticipantStatus;
  killedByMafia: boolean;
  mafiaTeam: readonly string[] | null;
  mafiaVotes: readonly Ballot[] | null;
  mafiaVote: string | null;
  protect: string | null;
  protectBlockedPlayerId: string | null;
  investigate: string | null;
  investigations: readonly Investigation[] | null;
  meetingVoted: boolean;
  meetingVote: string | null;
}>;

export type GameView = Readonly<{
  phase: GamePhase;
  round: number;
  remainingMs: number | null;
  players: readonly RosterEntry[];
  outcome: GameOutcome | null;
  ballots: readonly Ballot[] | null;
  winner: Faction | null;
  roles: readonly Readonly<{ playerId: string; role: Role }>[] | null;
  self: SelfView;
}>;

export type ChatEntry = Readonly<{
  channel: ChatChannel;
  round: number;
  senderPlayerId: string;
  senderName: string;
  text: string;
}>;

export type ServerMessage =
  | Readonly<{ version: 1; type: "room_state"; phase: RoomPhase; hostPlayerId: string; players: readonly PlayerView[] }>
  | Readonly<{ version: 1; type: "pong" }>
  | Readonly<{ version: 1; type: "room_snapshot"; selfPlayerId: string; roomId: string; recoveryToken: string; phase: RoomPhase; hostPlayerId: string; players: readonly PlayerView[] }>
  | Readonly<{ version: 1; type: "player_joined"; player: PlayerView }>
  | (GameView & Readonly<{ version: 1; type: "game_state" }>)
  | (ChatEntry & Readonly<{ version: 1; type: "chat_message" }>)
  | Readonly<{ version: 1; type: "chat_history"; messages: readonly ChatEntry[] }>
  | Readonly<{ version: 1; type: "player_left"; playerId: string; reason: "left" | "disconnected" | "expired" }>
  | Readonly<{ version: 1; type: "room_left"; roomId: string }>
  | Readonly<{ version: 1; type: "error"; code: string; message: string }>;

export type ClientMessage =
  | Readonly<{ version: 1; type: "select_avatar"; avatarPreset: AvatarPreset }>
  | Readonly<{ version: 1; type: "recover_room"; roomId: string; recoveryToken: string }>
  | Readonly<{ version: 1; type: "start_game" }>
  | Readonly<{ version: 1; type: "set_ready"; ready: boolean }>
  | Readonly<{ version: 1; type: "create_room"; displayName: string }>
  | Readonly<{ version: 1; type: "ping" }>
  | Readonly<{ version: 1; type: "join_room"; roomId: string; displayName: string }>
  | Readonly<{ version: 1; type: "leave_room" }>
  | Readonly<{ version: 1; type: "mafia_vote" | "protect" | "investigate"; round: number; targetPlayerId: string }>
  | Readonly<{ version: 1; type: "meeting_vote"; round: number; targetPlayerId: string | null }>
  | Readonly<{ version: 1; type: "send_chat"; channel: ChatChannel; text: string }>;

export function nightAction(type: "mafia_vote" | "protect" | "investigate", round: number, targetPlayerId: string): ClientMessage {
  return { version: 1, type, round: requireRound(round), targetPlayerId: requireNonEmptyString(targetPlayerId, "targetPlayerId") };
}

export function meetingVote(round: number, targetPlayerId: string | null): ClientMessage {
  return {
    version: 1, type: "meeting_vote", round: requireRound(round),
    targetPlayerId: targetPlayerId === null ? null : requireNonEmptyString(targetPlayerId, "targetPlayerId")
  };
}

export function sendChat(channel: ChatChannel, text: string): ClientMessage {
  const message = text.trim();
  if ([...message].length < 1 || [...message].length > MAX_CHAT_CHARACTERS) {
    throw new Error(`A chat message must be 1\u2013${MAX_CHAT_CHARACTERS} characters.`);
  }
  return { version: 1, type: "send_chat", channel, text: message };
}

/** Rounds are numbered from one; only Role Reveal, which precedes the first Night, is round zero. */
function requireRound(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error("Invalid Game round");
  return value;
}

export function recoverRoom(roomId: string, recoveryToken: string): ClientMessage {
  return { version: 1, type: "recover_room", roomId: requireNonEmptyString(roomId, "roomId").trim().toUpperCase(), recoveryToken: requireRecoveryToken(recoveryToken) };
}

function requireRecoveryToken(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) throw new Error("Invalid recovery credential");
  return value;
}

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
      requireFields(message, ["version", "type", "selfPlayerId", "roomId", "recoveryToken", "phase", "hostPlayerId", "players"]);
      if (!Array.isArray(message.players)) throw new Error("players must be an array");
      return {
        version: 1,
        type,
        selfPlayerId: requireNonEmptyString(message.selfPlayerId, "selfPlayerId"),
        recoveryToken: requireRecoveryToken(message.recoveryToken),
        roomId: requireNonEmptyString(message.roomId, "roomId"),
        phase: requirePhase(message.phase),
        hostPlayerId: requireNonEmptyString(message.hostPlayerId, "hostPlayerId"),
        players: decodeRoomPlayers(message.players)
      };
    }
    case "room_state":
      requireFields(message, ["version", "type", "phase", "hostPlayerId", "players"]);
      if (!Array.isArray(message.players)) throw new Error("players must be an array");
      return {
        version: 1, type, phase: requirePhase(message.phase),
        hostPlayerId: requireNonEmptyString(message.hostPlayerId, "hostPlayerId"),
        players: decodeRoomPlayers(message.players)
      };
    case "player_joined":
      requireFields(message, ["version", "type", "player"]);
      return { version: 1, type, player: decodePlayer(message.player) };
    case "game_state":
      return { version: 1, type, ...decodeGameView(message) };
    case "chat_message":
      requireFields(message, ["version", "type", "channel", "round", "senderPlayerId", "senderName", "text"]);
      return { version: 1, type, ...decodeChatEntry(message) };
    case "chat_history":
      requireFields(message, ["version", "type", "messages"]);
      if (!Array.isArray(message.messages)) throw new Error("messages must be an array");
      return { version: 1, type, messages: message.messages.map(entry => decodeChatEntry(requireRecord(entry, "message"))) };
    case "player_left": {
      requireFields(message, ["version", "type", "playerId", "reason"]);
      if (message.reason !== "left" && message.reason !== "disconnected" && message.reason !== "expired") {
        throw new Error("Invalid departure reason");
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

function decodeGameView(message: Record<string, unknown>): GameView {
  requireFields(message, ["version", "type", "phase", "round", "remainingMs", "players", "outcome", "ballots", "winner", "roles", "self"]);
  if (!Array.isArray(message.players)) throw new Error("players must be an array");
  return {
    phase: requireMember(message.phase, GAME_PHASES, "Game phase"),
    round: requireCounter(message.round),
    remainingMs: message.remainingMs === null ? null : requireCounter(message.remainingMs),
    players: message.players.map(decodeRosterEntry),
    outcome: message.outcome === null ? null : decodeOutcome(requireRecord(message.outcome, "outcome")),
    ballots: message.ballots === null ? null : requireArray(message.ballots, "ballots").map(decodeBallot),
    winner: message.winner === null ? null : requireMember(message.winner, ["mafia", "village"] as const, "Faction"),
    roles: message.roles === null ? null : requireArray(message.roles, "roles").map(decodeRoleReveal),
    self: decodeSelf(requireRecord(message.self, "self"))
  };
}

function decodeRosterEntry(value: unknown): RosterEntry {
  const entry = requireRecord(value, "roster entry");
  requireFields(entry, ["playerId", "displayName", "colour", "avatarPreset", "seat", "status"]);
  return {
    playerId: requireNonEmptyString(entry.playerId, "playerId"),
    displayName: requireNonEmptyString(entry.displayName, "displayName"),
    colour: requireColour(entry.colour),
    avatarPreset: requireAvatarPreset(entry.avatarPreset),
    seat: requireSeat(entry.seat),
    status: requireMember(entry.status, ["living", "eliminated", "left"] as const, "participation status")
  };
}

function decodeOutcome(outcome: Record<string, unknown>): GameOutcome {
  requireFields(outcome, ["kind", "victimPlayerId", "eliminatedPlayerId", "eliminatedMafia"]);
  return {
    kind: requireMember(outcome.kind, ["night", "meeting"] as const, "outcome kind"),
    victimPlayerId: requireOptionalPlayerId(outcome.victimPlayerId),
    eliminatedPlayerId: requireOptionalPlayerId(outcome.eliminatedPlayerId),
    eliminatedMafia: outcome.eliminatedMafia === null ? null : requireBoolean(outcome.eliminatedMafia)
  };
}

function decodeBallot(value: unknown): Ballot {
  const ballot = requireRecord(value, "ballot");
  requireFields(ballot, ["voterPlayerId", "targetPlayerId"]);
  return {
    voterPlayerId: requireNonEmptyString(ballot.voterPlayerId, "voterPlayerId"),
    targetPlayerId: requireOptionalPlayerId(ballot.targetPlayerId)
  };
}

function decodeRoleReveal(value: unknown): Readonly<{ playerId: string; role: Role }> {
  const reveal = requireRecord(value, "role");
  requireFields(reveal, ["playerId", "role"]);
  return { playerId: requireNonEmptyString(reveal.playerId, "playerId"), role: requireMember(reveal.role, ROLES, "Role") };
}

function decodeSelf(self: Record<string, unknown>): SelfView {
  requireFields(self, ["role", "faction", "status", "killedByMafia", "mafiaTeam", "mafiaVotes", "mafiaVote",
    "protect", "protectBlockedPlayerId", "investigate", "investigations", "meetingVoted", "meetingVote"]);
  return {
    role: requireMember(self.role, ROLES, "Role"),
    faction: requireMember(self.faction, ["mafia", "village"] as const, "Faction"),
    status: requireMember(self.status, ["living", "eliminated", "left"] as const, "participation status"),
    killedByMafia: requireBoolean(self.killedByMafia),
    mafiaTeam: self.mafiaTeam === null ? null : requireArray(self.mafiaTeam, "mafiaTeam").map(id => requireNonEmptyString(id, "playerId")),
    mafiaVotes: self.mafiaVotes === null ? null : requireArray(self.mafiaVotes, "mafiaVotes").map(decodeBallot),
    mafiaVote: requireOptionalPlayerId(self.mafiaVote),
    protect: requireOptionalPlayerId(self.protect),
    protectBlockedPlayerId: requireOptionalPlayerId(self.protectBlockedPlayerId),
    investigate: requireOptionalPlayerId(self.investigate),
    investigations: self.investigations === null ? null : requireArray(self.investigations, "investigations").map(decodeInvestigation),
    meetingVoted: requireBoolean(self.meetingVoted),
    meetingVote: requireOptionalPlayerId(self.meetingVote)
  };
}

function decodeInvestigation(value: unknown): Investigation {
  const result = requireRecord(value, "investigation");
  requireFields(result, ["round", "targetPlayerId", "mafia"]);
  return {
    round: requireRound(result.round),
    targetPlayerId: requireNonEmptyString(result.targetPlayerId, "targetPlayerId"),
    mafia: requireBoolean(result.mafia)
  };
}

function decodeChatEntry(entry: Record<string, unknown>): ChatEntry {
  if (!("version" in entry)) requireFields(entry, ["channel", "round", "senderPlayerId", "senderName", "text"]);
  return {
    channel: requireMember(entry.channel, ["public", "mafia"] as const, "chat channel"),
    round: requireRound(entry.round),
    senderPlayerId: requireNonEmptyString(entry.senderPlayerId, "senderPlayerId"),
    senderName: requireNonEmptyString(entry.senderName, "senderName"),
    text: requireNonEmptyString(entry.text, "text")
  };
}

function requireMember<T extends string>(value: unknown, allowed: readonly T[], name: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error(`Invalid ${name}`);
  return value as T;
}

function requireArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  return value;
}

function requireOptionalPlayerId(value: unknown): string | null {
  return value === null ? null : requireNonEmptyString(value, "playerId");
}

function decodePlayer(value: unknown): PlayerView {
  const player = requireRecord(value, "player");
  requireFields(player, ["playerId", "displayName", "colour", "avatarPreset", "seat", "ready", "connected", "x", "y", "facing"]);
  return {
    playerId: requireNonEmptyString(player.playerId, "playerId"),
    displayName: requireNonEmptyString(player.displayName, "displayName"),
    colour: requireColour(player.colour),
    avatarPreset: requireAvatarPreset(player.avatarPreset),
    seat: requireSeat(player.seat),
    ready: requireBoolean(player.ready),
    connected: requireBoolean(player.connected),
    x: requireFiniteNumber(player.x, "x"),
    y: requireFiniteNumber(player.y, "y"),
    facing: requireFacing(player.facing)
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


function requirePhase(value: unknown): RoomPhase {
  if (value !== "lobby" && value !== "playing") throw new Error("Invalid Room phase");
  return value;
}

function requireSeat(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value >= 10) throw new Error("Invalid seat");
  return value;
}

function requireBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("ready must be a boolean");
  return value;
}

function decodeRoomPlayers(values: unknown[]): PlayerView[] {
  const players = values.map(decodePlayer);
  const seats = new Set(players.map(player => player.seat));
  if (seats.size !== players.length) throw new Error("Two Players cannot share a Seat");
  return players;
}

function requireFacing(value: unknown): Direction {
  if (!DIRECTIONS.includes(value as Direction)) throw new Error("Invalid Facing");
  return value as Direction;
}

/** A Game round counts up from zero; only Role Reveal, before the first Night, is zero. */
function requireCounter(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid Game counter");
  return value;
}


export function selectAvatar(avatarPreset: string): ClientMessage {
  return { version: 1, type: "select_avatar", avatarPreset: requireSelectableAvatarPreset(avatarPreset) };
}
