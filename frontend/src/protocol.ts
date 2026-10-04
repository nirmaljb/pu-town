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

export const GAME_PHASES = ["role_reveal", "day", "night", "discussion", "voting", "voting_result", "finished"] as const;
export type PracticePhase = Exclude<GamePhase, "role_reveal" | "finished">;
export type GamePhase = typeof GAME_PHASES[number];
export const ROLES = ["mafia", "villager", "doctor", "sheriff"] as const;
export type Role = typeof ROLES[number];
export type Faction = "mafia" | "village";
export type ParticipantStatus = "living" | "eliminated" | "left";
export type ChatChannel = "public";
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
 * Townhall announces Night deaths; a Meeting names its verdict.
 */
export type GameOutcome = Readonly<{
  kind: "night" | "meeting";
  callerPlayerId: string | null;
  bodyPlayerId: string | null;
  deaths: readonly string[];
  eliminatedPlayerId: string | null;
  eliminatedRole: Role | null;
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
  nightChoice: string | null;
}>;

export type GameView = Readonly<{
  mode: "competitive" | "practice";
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

/** One Avatar this recipient is allowed to see during Day or sleeping Night. */
export type FieldPlayer = Readonly<{ playerId: string; x: number; y: number; facing: Direction; ghost: boolean }>;
export type OwnField = Readonly<{ x: number; y: number; facing: Direction; correction: number }>;
export type FieldView = Readonly<{ round: number; players: readonly FieldPlayer[]; self: OwnField }>;

/** The Host's deal: how many Mafia, Doctors and Sheriffs. Everyone else is a Villager. */
export type RoleSetup = Readonly<{ mafia: number; doctors: number; sheriffs: number }>;
export const MAX_MAFIA = 2;
export const MAX_SHERIFFS = 2;

export type ChatEntry = Readonly<{
  channel: ChatChannel;
  round: number;
  senderPlayerId: string;
  senderName: string;
  text: string;
}>;

export type MovementSound = Readonly<{ eventId: number; round: number; kind: "footstep" | "enter" | "exit"; playerId: string; gain: number }>;

export type PracticeTarget = Readonly<{ targetId: string; displayName: string; role: Role }>;

export type TaskView = Readonly<{ taskId: string; name: string; kind: "repair" | "sequence" | "delivery";
  x: number; y: number; step: number; steps: number; fake: boolean; sequence: readonly number[] }>;
export type TaskState = Readonly<{ tasks: readonly TaskView[]; completed: number; total: number;
  activeTaskId: string | null; remainingMs: number | null }>;

export type VoicePeer = Readonly<{ playerId: string; token: string; gain: number }>;

export type VoiceState = Readonly<{ url: "/voice" | null; token: string | null; canPublish: boolean }>;

export type ServerMessage =
  | Readonly<{ version: 1; type: "voice_peers"; peers: readonly VoicePeer[] }>
  | (VoiceState & Readonly<{ version: 1; type: "voice_state" }>)
  | (MovementSound & Readonly<{ version: 1; type: "sound_event" }>)
  | Readonly<{ version: 1; type: "practice_state"; targets: readonly PracticeTarget[] }>
  | (TaskState & Readonly<{ version: 1; type: "task_state" }>)
  | Readonly<{ version: 1; type: "room_state"; phase: RoomPhase; hostPlayerId: string; roleSetup: RoleSetup; players: readonly PlayerView[] }>
  | Readonly<{ version: 1; type: "pong" }>
  | Readonly<{ version: 1; type: "room_snapshot"; selfPlayerId: string; roomId: string; recoveryToken: string; phase: RoomPhase; hostPlayerId: string; roleSetup: RoleSetup; players: readonly PlayerView[] }>
  | Readonly<{ version: 1; type: "player_joined"; player: PlayerView }>
  | (GameView & Readonly<{ version: 1; type: "game_state" }>)
  | (FieldView & Readonly<{ version: 1; type: "field_state" }>)
  | (ChatEntry & Readonly<{ version: 1; type: "chat_message" }>)
  | Readonly<{ version: 1; type: "chat_history"; messages: readonly ChatEntry[] }>
  | Readonly<{ version: 1; type: "player_left"; playerId: string; reason: "left" | "disconnected" | "expired" }>
  | Readonly<{ version: 1; type: "room_left"; roomId: string }>
  | Readonly<{ version: 1; type: "error"; code: string; message: string }>;

export type ClientMessage =
  | Readonly<{ version: 1; type: "join_voice"; round: number }>
  | Readonly<{ version: 1; type: "leave_voice" }>
  | Readonly<{ version: 1; type: "preview_role"; role: Role }>
  | Readonly<{ version: 1; type: "open_task"; round: number; taskId: string }>
  | Readonly<{ version: 1; type: "task_step"; round: number; taskId: string; step: number; value: number }>
  | Readonly<{ version: 1; type: "close_task" }>
  | Readonly<{ version: 1; type: "select_avatar"; avatarPreset: AvatarPreset }>
  | Readonly<{ version: 1; type: "recover_room"; roomId: string; recoveryToken: string }>
  | Readonly<{ version: 1; type: "start_game" }>
  | Readonly<{ version: 1; type: "start_practice" }>
  | Readonly<{ version: 1; type: "advance_practice"; round: number; phase: PracticePhase }>
  | Readonly<{ version: 1; type: "set_ready"; ready: boolean }>
  | Readonly<{ version: 1; type: "set_role_setup"; mafia: number; doctors: number; sheriffs: number }>
  | Readonly<{ version: 1; type: "create_room"; displayName: string }>
  | Readonly<{ version: 1; type: "ping" }>
  | Readonly<{ version: 1; type: "join_room"; roomId: string; displayName: string }>
  | Readonly<{ version: 1; type: "leave_room" }>
  | Readonly<{ version: 1; type: "move"; x: number; y: number; facing: Direction }>
  | Readonly<{ version: 1; type: "meeting_vote"; round: number; targetPlayerId: string | null }>
  | Readonly<{ version: 1; type: "night_choice"; round: number; targetPlayerId: string | null }>
  | Readonly<{ version: 1; type: "send_chat"; channel: ChatChannel; text: string }>;

export function joinVoice(round: number): ClientMessage { return { version: 1, type: "join_voice", round: requireRound(round) }; }
export function leaveVoice(): ClientMessage { return { version: 1, type: "leave_voice" }; }

export function startPractice(): ClientMessage {
  return { version: 1, type: "start_practice" };
}

export function advancePractice(round: number, phase: PracticePhase): ClientMessage {
  return {
    version: 1, type: "advance_practice", round: requireRound(round),
    phase: requireMember(phase, ["day", "night", "discussion", "voting", "voting_result"] as const, "practice phase")
  };
}

export function move(x: number, y: number, facing: Direction): ClientMessage {
  return {
    version: 1, type: "move",
    x: Math.round(requireFiniteNumber(x, "x") * 10) / 10,
    y: Math.round(requireFiniteNumber(y, "y") * 10) / 10,
    facing: requireFacing(facing)
  };
}

export function meetingVote(round: number, targetPlayerId: string | null): ClientMessage {
  return {
    version: 1, type: "meeting_vote", round: requireRound(round),
    targetPlayerId: targetPlayerId === null ? null : requireNonEmptyString(targetPlayerId, "targetPlayerId")
  };
}

export function nightChoice(round: number, targetPlayerId: string | null): ClientMessage {
  return {
    version: 1, type: "night_choice", round: requireRound(round),
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

/** Rounds are numbered from one; only Role Reveal, which precedes the first Day, is round zero. */
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
      requireFields(message, ["version", "type", "selfPlayerId", "roomId", "recoveryToken", "phase", "hostPlayerId", "roleSetup", "players"]);
      if (!Array.isArray(message.players)) throw new Error("players must be an array");
      return {
        version: 1,
        type,
        selfPlayerId: requireNonEmptyString(message.selfPlayerId, "selfPlayerId"),
        recoveryToken: requireRecoveryToken(message.recoveryToken),
        roomId: requireNonEmptyString(message.roomId, "roomId"),
        phase: requirePhase(message.phase),
        hostPlayerId: requireNonEmptyString(message.hostPlayerId, "hostPlayerId"),
        roleSetup: decodeRoleSetup(message.roleSetup),
        players: decodeRoomPlayers(message.players)
      };
    }
    case "room_state":
      requireFields(message, ["version", "type", "phase", "hostPlayerId", "roleSetup", "players"]);
      if (!Array.isArray(message.players)) throw new Error("players must be an array");
      return {
        version: 1, type, phase: requirePhase(message.phase),
        hostPlayerId: requireNonEmptyString(message.hostPlayerId, "hostPlayerId"),
        roleSetup: decodeRoleSetup(message.roleSetup),
        players: decodeRoomPlayers(message.players)
      };
    case "player_joined":
      requireFields(message, ["version", "type", "player"]);
      return { version: 1, type, player: decodePlayer(message.player) };
    case "voice_peers": {
      requireFields(message, ["version", "type", "peers"]);
      if (!Array.isArray(message.peers) || message.peers.length > 9) throw new Error("Invalid voice peers");
      const ids = new Set<string>();
      const peers = message.peers.map((value: unknown) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid voice peer");
        const peer = value as Record<string, unknown>;
        requireFields(peer, ["playerId", "token", "gain"]);
        const playerId = requireNonEmptyString(peer.playerId, "playerId");
        const gain = requireFiniteNumber(peer.gain, "gain");
        if (gain <= 0 || gain > 1 || ids.has(playerId)) throw new Error("Invalid voice peer gain or identity");
        ids.add(playerId);
        return { playerId, token: requireNonEmptyString(peer.token, "token"), gain };
      });
      return { version: 1, type, peers };
    }
    case "voice_state": {
      requireFields(message, ["version", "type", "url", "token", "canPublish"]);
      const canPublish = requireBoolean(message.canPublish);
      if (message.url === null && message.token === null && !canPublish) return { version: 1, type, url: null, token: null, canPublish };
      if (message.url !== "/voice") throw new Error("Invalid voice gateway");
      return { version: 1, type, url: "/voice", token: requireNonEmptyString(message.token, "token"), canPublish };
    }
    case "game_state":
      return { version: 1, type, ...decodeGameView(message) };
    case "field_state":
      return { version: 1, type, ...decodeField(message) };
    case "sound_event": {
      requireFields(message, ["version", "type", "eventId", "round", "kind", "playerId", "gain"]);
      const gain = requireFiniteNumber(message.gain, "gain");
      const eventId = requireNonNegativeInteger(message.eventId, "eventId");
      if (gain <= 0 || gain > 1 || eventId === 0) throw new Error("Invalid sound authorization");
      return { version: 1, type, eventId, round: requireRound(message.round), gain,
        kind: requireMember(message.kind, ["footstep", "enter", "exit"] as const, "movement sound"), playerId: requireNonEmptyString(message.playerId, "playerId") };
    }
    case "practice_state": {
      requireFields(message, ["version", "type", "targets"]);
      const targets = requireArray(message.targets, "targets").map(value => {
        const target = requireRecord(value, "practice target");
        requireFields(target, ["targetId", "displayName", "role"]);
        return { targetId: requireNonEmptyString(target.targetId, "targetId"), displayName: requireNonEmptyString(target.displayName, "displayName"), role: requireMember(target.role, ROLES, "practice Role") };
      });
      if (new Set(targets.map(target => target.targetId)).size !== targets.length) throw new Error("Duplicate practice target");
      return { version: 1, type, targets };
    }
    case "task_state": {
      requireFields(message, ["version", "type", "tasks", "completed", "total", "activeTaskId", "remainingMs"]);
      const total = requireNonNegativeInteger(message.total, "total");
      const completed = requireNonNegativeInteger(message.completed, "completed");
      if (completed > total) throw new Error("Task progress exceeds total");
      const tasks = requireArray(message.tasks, "tasks").map(value => {
        const task = requireRecord(value, "Task");
        requireFields(task, ["taskId", "name", "kind", "x", "y", "step", "steps", "fake", "sequence"]);
        const steps = requireNonNegativeInteger(task.steps, "steps");
        const step = requireNonNegativeInteger(task.step, "step");
        if (steps === 0 || step > steps) throw new Error("Invalid Task step");
        return { taskId: requireNonEmptyString(task.taskId, "taskId"), name: requireNonEmptyString(task.name, "name"),
          kind: requireMember(task.kind, ["repair", "sequence", "delivery"] as const, "Task kind"),
          x: requireFiniteNumber(task.x, "x"), y: requireFiniteNumber(task.y, "y"), step, steps,
          fake: requireBoolean(task.fake), sequence: requireArray(task.sequence, "sequence").map(value => requireNonNegativeInteger(value, "sequence value")) };
      });
      if (new Set(tasks.map(task => task.taskId)).size !== tasks.length) throw new Error("Duplicate Task assignment");
      const activeTaskId = message.activeTaskId === null ? null : requireNonEmptyString(message.activeTaskId, "activeTaskId");
      const remainingMs = message.remainingMs === null ? null : requireNonNegativeInteger(message.remainingMs, "remainingMs");
      if ((activeTaskId === null) !== (remainingMs === null) || activeTaskId !== null && !tasks.some(task => task.taskId === activeTaskId && task.step < task.steps))
        throw new Error("Invalid active Task");
      return { version: 1, type, tasks, completed, total, activeTaskId, remainingMs };
    }
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
  requireFields(message, ["version", "type", "mode", "phase", "round", "remainingMs", "players", "outcome", "ballots", "winner", "roles", "self"]);
  if (!Array.isArray(message.players)) throw new Error("players must be an array");
  return {
    mode: requireMember(message.mode, ["competitive", "practice"] as const, "Game mode"),
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
  requireFields(message, ["version", "type", "round", "players", "self"]);
  return {
    round: requireRound(message.round),
    players: requireArray(message.players, "players").map(value => {
      const player = requireRecord(value, "field player");
      requireFields(player, ["playerId", "x", "y", "facing", "ghost"]);
      return {
        playerId: requireNonEmptyString(player.playerId, "playerId"),
        x: requireFiniteNumber(player.x, "x"), y: requireFiniteNumber(player.y, "y"),
        facing: requireFacing(player.facing), ghost: requireBoolean(player.ghost)
      };
    }),
    self: decodeOwnField(requireRecord(message.self, "self"))
  };
}

function decodeOwnField(self: Record<string, unknown>): OwnField {
  requireFields(self, ["x", "y", "facing", "correction"]);
  return {
    x: requireFiniteNumber(self.x, "x"), y: requireFiniteNumber(self.y, "y"),
    facing: requireFacing(self.facing), correction: requireCounter(self.correction)
  };
}

function decodeOutcome(outcome: Record<string, unknown>): GameOutcome {
  requireFields(outcome, ["kind", "callerPlayerId", "bodyPlayerId", "deaths", "eliminatedPlayerId", "eliminatedRole"]);
  return {
    kind: requireMember(outcome.kind, ["night", "meeting"] as const, "outcome kind"),
    callerPlayerId: requireOptionalPlayerId(outcome.callerPlayerId),
    bodyPlayerId: requireOptionalPlayerId(outcome.bodyPlayerId),
    deaths: requireArray(outcome.deaths, "deaths").map(id => requireNonEmptyString(id, "playerId")),
    eliminatedPlayerId: requireOptionalPlayerId(outcome.eliminatedPlayerId),
    eliminatedRole: outcome.eliminatedRole === null ? null : requireMember(outcome.eliminatedRole, ["mafia", "doctor", "sheriff", "villager"] as const, "eliminated Role")
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
  requireFields(self, ["role", "faction", "status", "killedByMafia", "mafiaTeam", "investigations", "meetingVoted", "meetingVote", "nightChoice"]);
  return {
    role: requireMember(self.role, ROLES, "Role"),
    faction: requireMember(self.faction, ["mafia", "village"] as const, "Faction"),
    status: requireMember(self.status, ["living", "eliminated", "left"] as const, "participation status"),
    killedByMafia: requireBoolean(self.killedByMafia),
    mafiaTeam: self.mafiaTeam === null ? null : requireArray(self.mafiaTeam, "mafiaTeam").map(id => requireNonEmptyString(id, "playerId")),
    investigations: self.investigations === null ? null : requireArray(self.investigations, "investigations").map(decodeInvestigation),
    meetingVoted: requireBoolean(self.meetingVoted),
    meetingVote: requireOptionalPlayerId(self.meetingVote),
    nightChoice: requireOptionalPlayerId(self.nightChoice)
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
    channel: requireMember(entry.channel, ["public"] as const, "chat channel"),
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

function requireNonNegativeInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${name}`);
  return value;
}

export function openTask(round: number, taskId: string): ClientMessage {
  return { version: 1, type: "open_task", round: requireRound(round), taskId: requireNonEmptyString(taskId, "taskId") };
}
export function taskStep(round: number, taskId: string, step: number, value: number): ClientMessage {
  return { version: 1, type: "task_step", round: requireRound(round), taskId: requireNonEmptyString(taskId, "taskId"),
    step: requireNonNegativeInteger(step, "step"), value: requireNonNegativeInteger(value, "value") };
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

/** A Game round counts up from zero; only Role Reveal, before the first Day, is zero. */
function decodeRoleSetup(value: unknown): RoleSetup {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("roleSetup must be an object");
  const setup = value as Record<string, unknown>;
  requireFields(setup, ["mafia", "doctors", "sheriffs"]);
  const count = (field: unknown) => {
    const n = requireCounter(field);
    if (n < 1) throw new Error("Every Role is dealt at least once");
    return n;
  };
  return { mafia: count(setup.mafia), doctors: count(setup.doctors), sheriffs: count(setup.sheriffs) };
}

export function setRoleSetup(setup: RoleSetup): ClientMessage {
  return { version: 1, type: "set_role_setup", mafia: setup.mafia, doctors: setup.doctors, sheriffs: setup.sheriffs };
}

function requireCounter(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid Game counter");
  return value;
}


export function selectAvatar(avatarPreset: string): ClientMessage {
  return { version: 1, type: "select_avatar", avatarPreset: requireSelectableAvatarPreset(avatarPreset) };
}
