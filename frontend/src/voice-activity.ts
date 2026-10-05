import type { WorldState } from "./world-state.js";

/** Sample media activity only against the authoritative world applied for this frame. */
export function visibleSpeakers(world: WorldState | undefined, active: ReadonlySet<string>): ReadonlySet<string> {
  const game = world?.game;
  if (!world?.voice || !game || !["day", "discussion", "voting"].includes(game.phase)) return new Set();
  const visible = new Set(world.field?.round === game.round ? world.field.players.map(p => p.playerId) : []);
  const audible = new Set(world.voicePeers.filter(p => p.gain > 0).map(p => p.playerId));
  return new Set(game.players.filter(p => active.has(p.playerId) && p.status === "living"
    && world.players.get(p.playerId)?.connected
    && (game.phase !== "day" || visible.has(p.playerId)
      && (p.playerId === world.selfPlayerId || audible.has(p.playerId))))
    .map(p => p.playerId));
}
