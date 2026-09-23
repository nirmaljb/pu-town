import type { ChatEntry, FieldView, GameView, PlayerView, RoomPhase, ServerMessage } from "./protocol.js";

export type WorldState = Readonly<{
  roomId: string | null;
  phase: RoomPhase | null;
  hostPlayerId: string | null;
  selfPlayerId: string | null;
  players: ReadonlyMap<string, PlayerView>;
  game: GameView | null;
  /** The part of the town this recipient can see, only while the Game Roams. */
  field: FieldView | null;
  chat: readonly ChatEntry[];
  lastError: Readonly<{ code: string; message: string }> | null;
}>;

export function emptyWorld(): WorldState {
  return {
    phase: null, hostPlayerId: null, roomId: null, selfPlayerId: null,
    players: new Map(), game: null, field: null, chat: [], lastError: null
  };
}

export function reduceWorldEvent(world: WorldState, event: ServerMessage): WorldState {
  switch (event.type) {
    case "room_state":
      return {
        ...world, phase: event.phase, hostPlayerId: event.hostPlayerId,
        players: new Map(event.players.map(player => [player.playerId, player])),
        lastError: null
      };
    case "pong":
      return world;
    case "room_snapshot":
      return {
        ...emptyWorld(),
        roomId: event.roomId,
        phase: event.phase,
        hostPlayerId: event.hostPlayerId,
        selfPlayerId: event.selfPlayerId,
        players: new Map(event.players.map(player => [player.playerId, player])),
        // A Room Snapshot is followed by the recipient's own Game state and history.
        game: world.roomId === event.roomId ? world.game : null,
        field: world.roomId === event.roomId ? world.field : null,
        chat: world.roomId === event.roomId ? world.chat : []
      };
    case "game_state": {
      const { version, type, ...game } = event;
      // A field belongs to one Roam; leaving it, or a new one beginning, discards the old view.
      const field = game.phase === "roam" && world.field?.round === game.round ? world.field : null;
      return { ...world, game, field };
    }
    case "field_state": {
      const { version, type, ...field } = event;
      if (world.game?.phase !== "roam" || world.game.round !== field.round) return world;
      return { ...world, field };
    }
    case "chat_history":
      return { ...world, chat: event.messages };
    case "chat_message": {
      const { version, type, ...entry } = event;
      return { ...world, chat: [...world.chat, entry] };
    }
    case "player_joined": {
      const players = new Map(world.players);
      players.set(event.player.playerId, event.player);
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
