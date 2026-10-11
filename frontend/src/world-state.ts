import type { DeveloperStatus, DeveloperState } from "./developer-protocol.js";
import type { MapId, VoicePeer, VoiceState, MovementSound, PracticeTarget, TaskState, ChatEntry, FieldView, GameView, PlayerView, RoleSetup, RoomPhase, ServerMessage } from "./protocol.js";

export type WorldState = Readonly<{
  developer: DeveloperStatus | null;
  inspector: DeveloperState | null;
  phaseReceivedAt: number;
  roomId: string | null;
  mapId: MapId;
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
  voice: VoiceState | null;
  voicePeers: readonly VoicePeer[];
  tasks: TaskState | null;
  taskEndsAt: number | null;
  chat: readonly ChatEntry[];
  lastError: Readonly<{ code: string; message: string }> | null;
}>;

export function emptyWorld(): WorldState {
  return {
    developer: null, inspector: null, phaseReceivedAt: 0, snapshotSerial: 0, mapId: "village", sounds: [], phase: null, hostPlayerId: null, roleSetup: null, roomId: null, selfPlayerId: null,
    players: new Map(), voice: null, voicePeers: [], game: null, phaseEndsAt: null, field: null, tasks: null, taskEndsAt: null, practiceTargets: [], chat: [], lastError: null
  };
}

export function reduceWorldEvent(world: WorldState, event: ServerMessage, receivedAt: number = Date.now()): WorldState {
  switch (event.type) {
    case "developer_status": {
      const { version, type, ...developer } = event;
      return { ...world, developer, inspector: developer.controllerId === world.selfPlayerId ? world.inspector : null };
    }
    case "developer_state": {
      if (world.developer?.controllerId !== world.selfPlayerId) return world;
      const { version, type, ...inspector } = event;
      return { ...world, inspector };
    }
    case "room_state":
      return {
        ...world, ...(event.phase === "lobby" ? { game: null, phaseEndsAt: null, field: null, tasks: null, taskEndsAt: null, chat: [], practiceTargets: [] } : {}), mapId: event.mapId, phase: event.phase, hostPlayerId: event.hostPlayerId, roleSetup: event.roleSetup,
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
        mapId: event.mapId,
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
    case "voice_peers":
      return { ...world, voicePeers: event.peers };
    case "voice_state":
      return { ...world, voicePeers: event.token === null ? [] : world.voicePeers, voice: event.token === null ? null : { url: event.url, token: event.token, canPublish: event.canPublish } };
    case "game_state": {
      const { version, type, ...game } = event;
      // A field belongs to one round of Day and Night; Townhall or a new Day discards it.
      const field = (game.phase === "day" || game.phase === "night") && world.field?.round === game.round ? world.field : null;
      const phaseEndsAt = game.remainingMs === null ? null : receivedAt + game.remainingMs;
      return { ...world, game, phaseEndsAt, field, phaseReceivedAt: world.game?.phase === game.phase && world.game.round === game.round ? world.phaseReceivedAt : receivedAt };
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
