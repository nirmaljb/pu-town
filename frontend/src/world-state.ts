import type { MovementSound, PracticeTarget, TaskState, ChatEntry, FieldView, GameView, PlayerView, RoleSetup, RoomPhase, ServerMessage } from "./protocol.js";

export type WorldState = Readonly<{
  roomId: string | null;
  snapshotSerial: number;
  sounds: readonly MovementSound[];
  phase: RoomPhase | null;
  hostPlayerId: string | null;
  /** The Host's deal for the Room's Game. */
  roleSetup: RoleSetup | null;
  selfPlayerId: string | null;
  players: ReadonlyMap<string, PlayerView>;
  game: GameView | null;
  /** Local clock time the current phase ends: the server's remaining time, counted from arrival. */
  phaseEndsAt: number | null;
  /** The part of the town this recipient can see, during Day or sleeping Night. */
  field: FieldView | null;
  practiceTargets: readonly PracticeTarget[];
  tasks: TaskState | null;
  taskEndsAt: number | null;
  chat: readonly ChatEntry[];
  lastError: Readonly<{ code: string; message: string }> | null;
}>;

export function emptyWorld(): WorldState {
  return {
    snapshotSerial: 0, sounds: [], phase: null, hostPlayerId: null, roleSetup: null, roomId: null, selfPlayerId: null,
    players: new Map(), game: null, phaseEndsAt: null, field: null, tasks: null, taskEndsAt: null, practiceTargets: [], chat: [], lastError: null
  };
}

export function reduceWorldEvent(world: WorldState, event: ServerMessage, receivedAt: number = Date.now()): WorldState {
  switch (event.type) {
    case "room_state":
      return {
        ...world, phase: event.phase, hostPlayerId: event.hostPlayerId, roleSetup: event.roleSetup,
        players: new Map(event.players.map(player => [player.playerId, player])),
        lastError: null
      };
    case "pong":
      return world;
    case "room_snapshot":
      return {
        ...emptyWorld(),
        snapshotSerial: world.snapshotSerial + 1,
        roomId: event.roomId,
        phase: event.phase,
        hostPlayerId: event.hostPlayerId,
        roleSetup: event.roleSetup,
        selfPlayerId: event.selfPlayerId,
        players: new Map(event.players.map(player => [player.playerId, player])),
        // A Room Snapshot is followed by the recipient's own Game state and history.
        game: world.roomId === event.roomId ? world.game : null,
        phaseEndsAt: world.roomId === event.roomId ? world.phaseEndsAt : null,
        field: world.roomId === event.roomId ? world.field : null,
        chat: world.roomId === event.roomId ? world.chat : []
      };
    case "game_state": {
      const { version, type, ...game } = event;
      // A field belongs to one round of Day and Night; Townhall or a new Day discards it.
      const field = (game.phase === "day" || game.phase === "night") && world.field?.round === game.round ? world.field : null;
      const phaseEndsAt = game.remainingMs === null ? null : receivedAt + game.remainingMs;
      return { ...world, game, phaseEndsAt, field };
    }
    case "field_state": {
      const { version, type, ...field } = event;
      if ((world.game?.phase !== "day" && world.game?.phase !== "night") || world.game.round !== field.round) return world;
      return { ...world, field };
    }
    case "sound_event": {
      const { version, type, ...sound } = event;
      if (world.game?.phase !== "day" || world.game.round !== sound.round) return world;
      return { ...world, sounds: [...world.sounds, sound].slice(-64) };
    }
    case "practice_state":
      return { ...world, practiceTargets: event.targets };
    case "task_state": {
      const { version, type, ...tasks } = event;
      return { ...world, tasks, taskEndsAt: tasks.remainingMs === null ? null : receivedAt + tasks.remainingMs };
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
