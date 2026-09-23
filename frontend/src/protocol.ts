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

export const GAME_PHASES = ["role_reveal", "roam", "meeting_call", "discussion", "voting", "voting_result", "finished"] as const;
export type GamePhase = typeof GAME_PHASES[number];
export const ROLES = ["mafia", "villager", "doctor", "sheriff"] as const;
export type Role = typeof ROLES[number];
export type Faction = "mafia" | "village";
export type ParticipantStatus = "living" | "eliminated" | "left";
export type ChatChannel = "public" | "mafia";
export const ABILITIES = ["kill", "vanish", "shield", "scan", "report", "emergency"] as const;
export type Ability = typeof ABILITIES[number];
/** Only these name a target Player; the rest are sent with a null target. */
export const TARGETED_ABILITIES: readonly Ability[] = ["kill", "shield", "scan"];
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

/**
 * A Meeting Call (report, emergency or timeout) names its caller, the reported Body and every
 * death since the last Meeting; a Meeting names its verdict.
 */
export type GameOutcome = Readonly<{
  kind: "report" | "emergency" | "timeout" | "meeting";
  callerPlayerId: string | null;
  bodyPlayerId: string | null;
  deaths: readonly string[];
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

/** One Avatar this recipient is allowed to see during a Roam. */
export type FieldPlayer = Readonly<{ playerId: string; x: number; y: number; facing: Direction; ghost: boolean; vanished: boolean }>;
export type Body = Readonly<{ playerId: string; x: number; y: number }>;

/** This recipient's own position and ability timers; null where their Role has no such ability. */
export type OwnField = Readonly<{
  x: number;
  y: number;
  facing: Direction;
  correction: number;
  crowding: number | null;
  primaryCooldownMs: number | null;
  vanishCooldownMs: number | null;
  vanishedMs: number | null;
  shieldTargetPlayerId: string | null;
  shieldMs: number | null;
  emergencyAvailable: boolean;
}>;

export type FieldView = Readonly<{ round: number; players: readonly FieldPlayer[]; bodies: readonly Body[]; self: OwnField }>;

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
  | (FieldView & Readonly<{ version: 1; type: "field_state" }>)
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
  | Readonly<{ version: 1; type: "move"; x: number; y: number; facing: Direction }>
  | Readonly<{ version: 1; type: "use_ability"; ability: Ability; round: number; targetPlayerId: string | null }>
  | Readonly<{ version: 1; type: "meeting_vote"; round: number; targetPlayerId: string | null }>
  | Readonly<{ version: 1; type: "send_chat"; channel: ChatChannel; text: string }>;

export function move(x: number, y: number, facing: Direction): ClientMessage {
  return {
    version: 1, type: "move",
    x: Math.round(requireFiniteNumber(x, "x") * 10) / 10,
    y: Math.round(requireFiniteNumber(y, "y") * 10) / 10,
    facing: requireFacing(facing)
  };
}

export function useAbility(ability: Ability, round: number, targetPlayerId: string | null): ClientMessage {
  const targeted = TARGETED_ABILITIES.includes(ability);
  if (targeted !== (targetPlayerId !== null)) throw new Error(targeted ? "This ability needs a target" : "This ability takes no target");
  return {
    version: 1, type: "use_ability", ability: requireMember(ability, ABILITIES, "ability"), round: requireRound(round),
    targetPlayerId: targetPlayerId === null ? null : requireNonEmptyString(targetPlayerId, "targetPlayerId")
  };
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
    case "field_state":
      return { version: 1, type, ...decodeField(message) };
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

function decodeField(message: Record<string, unknown>): FieldView {
  requireFields(message, ["version", "type", "round", "players", "bodies", "self"]);
  return {
    round: requireRound(message.round),
    players: requireArray(message.players, "players").map(value => {
      const player = requireRecord(value, "field player");
      requireFields(player, ["playerId", "x", "y", "facing", "ghost", "vanished"]);
      return {
        playerId: requireNonEmptyString(player.playerId, "playerId"),
        x: requireFiniteNumber(player.x, "x"), y: requireFiniteNumber(player.y, "y"),
        facing: requireFacing(player.facing), ghost: requireBoolean(player.ghost), vanished: requireBoolean(player.vanished)
      };
    }),
    bodies: requireArray(message.bodies, "bodies").map(value => {
      const body = requireRecord(value, "body");
      requireFields(body, ["playerId", "x", "y"]);
      return { playerId: requireNonEmptyString(body.playerId, "playerId"), x: requireFiniteNumber(body.x, "x"), y: requireFiniteNumber(body.y, "y") };
    }),
    self: decodeOwnField(requireRecord(message.self, "self"))
  };
}

function decodeOwnField(self: Record<string, unknown>): OwnField {
  requireFields(self, ["x", "y", "facing", "correction", "crowding", "primaryCooldownMs", "vanishCooldownMs", "vanishedMs",
    "shieldTargetPlayerId", "shieldMs", "emergencyAvailable"]);
  const optionalCounter = (value: unknown) => value === null ? null : requireCounter(value);
  return {
    x: requireFiniteNumber(self.x, "x"),
    y: requireFiniteNumber(self.y, "y"),
    facing: requireFacing(self.facing),
    correction: requireCounter(self.correction),
    crowding: self.crowding === null ? null : requireFiniteNumber(self.crowding, "crowding"),
    primaryCooldownMs: optionalCounter(self.primaryCooldownMs),
    vanishCooldownMs: optionalCounter(self.vanishCooldownMs),
    vanishedMs: optionalCounter(self.vanishedMs),
    shieldTargetPlayerId: requireOptionalPlayerId(self.shieldTargetPlayerId),
    shieldMs: optionalCounter(self.shieldMs),
    emergencyAvailable: requireBoolean(self.emergencyAvailable)
  };
}

function decodeOutcome(outcome: Record<string, unknown>): GameOutcome {
  requireFields(outcome, ["kind", "callerPlayerId", "bodyPlayerId", "deaths", "eliminatedPlayerId", "eliminatedMafia"]);
  return {
    kind: requireMember(outcome.kind, ["report", "emergency", "timeout", "meeting"] as const, "outcome kind"),
    callerPlayerId: requireOptionalPlayerId(outcome.callerPlayerId),
    bodyPlayerId: requireOptionalPlayerId(outcome.bodyPlayerId),
    deaths: requireArray(outcome.deaths, "deaths").map(id => requireNonEmptyString(id, "playerId")),
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
  requireFields(self, ["role", "faction", "status", "killedByMafia", "mafiaTeam", "investigations", "meetingVoted", "meetingVote"]);
  return {
    role: requireMember(self.role, ROLES, "Role"),
    faction: requireMember(self.faction, ["mafia", "village"] as const, "Faction"),
    status: requireMember(self.status, ["living", "eliminated", "left"] as const, "participation status"),
    killedByMafia: requireBoolean(self.killedByMafia),
    mafiaTeam: self.mafiaTeam === null ? null : requireArray(self.mafiaTeam, "mafiaTeam").map(id => requireNonEmptyString(id, "playerId")),
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
