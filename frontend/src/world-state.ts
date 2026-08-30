import type { PlayerView, ServerMessage } from "./protocol.js";

export type WorldState = Readonly<{
  roomId: string | null;
  selfPlayerId: string | null;
  players: ReadonlyMap<string, PlayerView>;
  lastError: Readonly<{ code: string; message: string }> | null;
}>;

export function emptyWorld(): WorldState {
  return { roomId: null, selfPlayerId: null, players: new Map(), lastError: null };
}

export function reduceWorldEvent(world: WorldState, event: ServerMessage): WorldState {
  switch (event.type) {
    case "room_snapshot":
      return {
        roomId: event.roomId,
        selfPlayerId: event.selfPlayerId,
        players: new Map(event.players.map(player => [player.playerId, player])),
        lastError: null
      };
    case "player_joined": {
      const players = new Map(world.players);
      players.set(event.player.playerId, event.player);
      return { ...world, players };
    }
    case "player_moved": {
      const player = world.players.get(event.playerId);
      if (player === undefined) return world;
      const players = new Map(world.players);
      players.set(event.playerId, { ...player, x: event.x, y: event.y });
      return { ...world, players };
    }
    case "player_left": {
      if (!world.players.has(event.playerId)) return world;
      const players = new Map(world.players);
      players.delete(event.playerId);
      return { ...world, players };
    }
    case "room_left":
      return emptyWorld();
    case "error":
      return { ...world, lastError: { code: event.code, message: event.message } };
  }
}
