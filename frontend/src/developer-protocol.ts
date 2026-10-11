import type { Role, ParticipantStatus } from "./protocol.js";

export const DEVELOPER_SETTINGS = ["automatic", "factionVictory", "taskVictory", "taskRange", "taskDuration", "nightMovement"] as const;
export type DeveloperSetting = typeof DEVELOPER_SETTINGS[number];
export type DeveloperTask = Readonly<{ playerId: string; taskId: string; location: number; currentLocation: number; kind: "repair" | "sequence" | "delivery"; steps: number; durationMs: number; step: number; fake: boolean }>;
export type DeveloperPlayer = Readonly<{ playerId: string; displayName: string; role: Role; status: ParticipantStatus; simulated: boolean; x: number; y: number;
  nightChoice: string | null; voted: boolean; vote: string | null; tasks: readonly DeveloperTask[] }>;
export type DeveloperStatus = Readonly<{ controllerId: string | null; paused: boolean; nightMovement: boolean; taskRange: boolean; scenario: string; revision: number; simulatedPlayerIds: readonly string[] }>;
export type DeveloperState = Readonly<{ settings: Readonly<Record<DeveloperSetting, boolean>>; players: readonly DeveloperPlayer[]; locations: readonly Readonly<{ name: string; x: number; y: number }>[] }>;
export type DeveloperCommand =
  | Readonly<{ action: "start" | "advance" | "reset" | "lobby" | "inspect" | "claim" | "release" }>
  | Readonly<{ action: "pause"; enabled: boolean }>
  | Readonly<{ action: "setting"; name: DeveloperSetting; enabled: boolean }>
  | Readonly<{ action: "scenario"; name: "four_roles" | "protection" | "voting" | "tasks" | "recovery" }>
  | Readonly<{ action: "add_player"; displayName: string; role: Role }>
  | Readonly<{ action: "remove_player"; playerId: string }>
  | Readonly<{ action: "role"; playerId: string; role: Role }>
  | Readonly<{ action: "status"; playerId: string; living: boolean }>
  | Readonly<{ action: "teleport"; playerId: string; x: number; y: number }>
  | Readonly<{ action: "night_choice" | "vote"; playerId: string; round: number; targetPlayerId: string | null }>
  | Readonly<{ action: "open_task"; playerId: string; round: number; taskId: string }>
  | Readonly<{ action: "task_step"; playerId: string; round: number; taskId: string; step: number; value: number }>
  | (Omit<DeveloperTask, "fake" | "currentLocation"> & Readonly<{ action: "task" }>);

function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid developer object");
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== fields.length || fields.some(field => !(field in result))) throw new Error("Invalid developer fields");
  return result;
}
function text(value: unknown): string { if (typeof value !== "string" || !value.trim()) throw new Error("Invalid developer text"); return value; }
function number(value: unknown): number { if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Invalid developer number"); return value; }
function counter(value: unknown): number { const n = number(value); if (!Number.isSafeInteger(n) || n < 0) throw new Error("Invalid developer counter"); return n; }
function bool(value: unknown): boolean { if (typeof value !== "boolean") throw new Error("Invalid developer boolean"); return value; }
function nullable(value: unknown): string | null { return value === null ? null : text(value); }
function array(value: unknown): unknown[] { if (!Array.isArray(value)) throw new Error("Invalid developer array"); return value; }
function member<T extends string>(value: unknown, choices: readonly T[]): T { if (!choices.includes(value as T)) throw new Error("Invalid developer choice"); return value as T; }
export function decodeDeveloperStatus(value: unknown): DeveloperStatus {
  const data = record(value, ["version", "type", "controllerId", "paused", "nightMovement", "taskRange", "scenario", "revision", "simulatedPlayerIds"]);
  return { controllerId: nullable(data.controllerId), paused: bool(data.paused), nightMovement: bool(data.nightMovement), taskRange: bool(data.taskRange), scenario: text(data.scenario), revision: counter(data.revision), simulatedPlayerIds: array(data.simulatedPlayerIds).map(text) };
}
export function decodeDeveloperState(value: unknown): DeveloperState {
  const data = record(value, ["version", "type", "settings", "players", "locations"]);
  const rawSettings = record(data.settings, DEVELOPER_SETTINGS);
  const settings = Object.fromEntries(DEVELOPER_SETTINGS.map(name => [name, bool(rawSettings[name])])) as Record<DeveloperSetting, boolean>;
  const locations = array(data.locations).map(value => { const data = record(value, ["name", "x", "y"]); return { name: text(data.name), x: number(data.x), y: number(data.y) }; });
  const players = array(data.players).map(value => {
    const data = record(value, ["playerId", "displayName", "role", "status", "simulated", "x", "y", "nightChoice", "voted", "vote", "tasks"]);
    const tasks = array(data.tasks).map(value => {
      const task = record(value, ["playerId", "taskId", "location", "kind", "steps", "durationMs", "step", "fake", "currentLocation"]);
      const steps = counter(task.steps), step = counter(task.step), location = counter(task.location), durationMs = counter(task.durationMs), currentLocation = counter(task.currentLocation);
      if (steps < 1 || steps > 100 || step > steps || location >= locations.length || currentLocation >= locations.length || durationMs > 3_600_000) throw new Error("Invalid developer Task");
      return { playerId: text(task.playerId), taskId: text(task.taskId), location, currentLocation, kind: member(task.kind, ["repair", "sequence", "delivery"] as const), steps, durationMs, step, fake: bool(task.fake) };
    });
    if (new Set(tasks.map(task => task.taskId)).size !== tasks.length || tasks.some(task => task.playerId !== data.playerId)) throw new Error("Invalid developer assignments");
    return { playerId: text(data.playerId), displayName: text(data.displayName), role: member(data.role, ["mafia", "villager", "doctor", "sheriff"] as const),
      status: member(data.status, ["living", "eliminated", "left"] as const), simulated: bool(data.simulated), x: number(data.x), y: number(data.y),
      nightChoice: nullable(data.nightChoice), voted: bool(data.voted), vote: nullable(data.vote), tasks };
  });
  if (players.length > 10 || new Set(players.map(player => player.playerId)).size !== players.length) throw new Error("Invalid developer Players");
  return { settings, players, locations };
}
