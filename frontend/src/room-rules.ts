import type { Role } from "./protocol.js";

/** The canvas shows one screen of the town at a time. */
export const ROOM_WIDTH = 1_280;
export const ROOM_HEIGHT = 720;

// Client copies of the authoritative RoomRules and FieldRules; the server re-checks all of them.
export const WORLD_WIDTH = 2_560;
export const WORLD_HEIGHT = 1_440;
export const MIN_PLAYERS = 4;
/** The Emergency Meeting button in the middle of the Town Square; Meetings gather around it. */
export const BUTTON_X = 1_280;
export const BUTTON_Y = 742;
export const FOOT_RADIUS = 14;

/** A little below the server's limit, so honest movement is never corrected. */
export const WALK_SPEED = 220;
/** How far a living Player sees, by Role: the Mafia furthest, Villagers least. */
export const VISION: Readonly<Record<Role, number>> = { mafia: 440, doctor: 380, sheriff: 330, villager: 270 };
export const KILL_RANGE = 90;
export const SHIELD_RANGE = 120;
export const SCAN_RANGE = 140;
export const REPORT_RANGE = 120;
export const EMERGENCY_RANGE = 150;

export type Obstacle = Readonly<{ x: number; y: number; width: number; height: number }>;

/** The map's collision layer, from public/maps/pu-town/pu-town.collision.json. */
export const OBSTACLES: readonly Obstacle[] = [
  { x: 0, y: 0, width: 2560, height: 64 }, { x: 0, y: 64, width: 192, height: 64 }, { x: 576, y: 64, width: 256, height: 64 }, { x: 1728, y: 64, width: 192, height: 64 },
  { x: 2368, y: 64, width: 192, height: 64 }, { x: 1920, y: 96, width: 256, height: 96 }, { x: 0, y: 128, width: 128, height: 64 }, { x: 1056, y: 128, width: 32, height: 32 },
  { x: 1184, y: 128, width: 32, height: 32 }, { x: 1376, y: 128, width: 32, height: 32 }, { x: 1856, y: 128, width: 64, height: 96 }, { x: 2432, y: 128, width: 128, height: 64 },
  { x: 128, y: 160, width: 32, height: 32 }, { x: 1696, y: 160, width: 128, height: 64 }, { x: 2240, y: 160, width: 32, height: 32 }, { x: 2400, y: 160, width: 32, height: 32 },
  { x: 0, y: 192, width: 64, height: 1248 }, { x: 320, y: 192, width: 160, height: 96 }, { x: 800, y: 192, width: 32, height: 32 }, { x: 1600, y: 192, width: 64, height: 32 },
  { x: 1952, y: 192, width: 128, height: 32 }, { x: 2112, y: 192, width: 64, height: 32 }, { x: 2496, y: 192, width: 64, height: 1248 }, { x: 160, y: 224, width: 96, height: 64 },
  { x: 672, y: 224, width: 32, height: 32 }, { x: 928, y: 224, width: 32, height: 32 }, { x: 1856, y: 224, width: 32, height: 192 }, { x: 2144, y: 224, width: 32, height: 192 },
  { x: 1664, y: 256, width: 96, height: 64 }, { x: 1888, y: 256, width: 32, height: 32 }, { x: 2080, y: 256, width: 32, height: 32 }, { x: 1472, y: 288, width: 128, height: 96 },
  { x: 768, y: 320, width: 32, height: 32 }, { x: 1888, y: 320, width: 32, height: 96 }, { x: 2080, y: 320, width: 32, height: 32 }, { x: 2400, y: 320, width: 32, height: 32 },
  { x: 640, y: 352, width: 32, height: 32 }, { x: 864, y: 352, width: 32, height: 32 }, { x: 2112, y: 352, width: 32, height: 64 }, { x: 1152, y: 384, width: 256, height: 128 },
  { x: 1920, y: 384, width: 64, height: 32 }, { x: 2048, y: 384, width: 64, height: 32 }, { x: 2304, y: 384, width: 32, height: 32 }, { x: 1600, y: 416, width: 192, height: 96 },
  { x: 64, y: 448, width: 64, height: 192 }, { x: 800, y: 448, width: 32, height: 32 }, { x: 928, y: 448, width: 32, height: 32 }, { x: 2432, y: 448, width: 64, height: 128 },
  { x: 224, y: 480, width: 32, height: 32 }, { x: 672, y: 480, width: 32, height: 32 }, { x: 1568, y: 512, width: 32, height: 32 }, { x: 992, y: 544, width: 32, height: 32 },
  { x: 1856, y: 544, width: 32, height: 32 }, { x: 2304, y: 544, width: 32, height: 32 }, { x: 544, y: 576, width: 32, height: 32 }, { x: 512, y: 672, width: 96, height: 32 },
  { x: 2400, y: 672, width: 32, height: 32 }, { x: 1856, y: 704, width: 64, height: 32 }, { x: 448, y: 832, width: 96, height: 128 }, { x: 608, y: 832, width: 96, height: 128 },
  { x: 2080, y: 832, width: 384, height: 96 }, { x: 736, y: 864, width: 320, height: 96 }, { x: 2080, y: 928, width: 32, height: 160 }, { x: 2368, y: 928, width: 96, height: 32 },
  { x: 192, y: 960, width: 64, height: 480 }, { x: 320, y: 960, width: 64, height: 384 }, { x: 448, y: 960, width: 32, height: 192 }, { x: 672, y: 960, width: 32, height: 192 },
  { x: 736, y: 960, width: 128, height: 32 }, { x: 992, y: 960, width: 64, height: 32 }, { x: 2112, y: 960, width: 64, height: 64 }, { x: 2432, y: 960, width: 64, height: 128 },
  { x: 736, y: 992, width: 32, height: 160 }, { x: 928, y: 992, width: 64, height: 32 }, { x: 1024, y: 992, width: 32, height: 192 }, { x: 1536, y: 992, width: 64, height: 32 },
  { x: 1824, y: 992, width: 96, height: 96 }, { x: 1952, y: 992, width: 128, height: 64 }, { x: 2208, y: 992, width: 128, height: 32 }, { x: 128, y: 1024, width: 64, height: 416 },
  { x: 384, y: 1024, width: 64, height: 256 }, { x: 480, y: 1024, width: 64, height: 32 }, { x: 608, y: 1024, width: 64, height: 32 }, { x: 832, y: 1024, width: 32, height: 32 },
  { x: 1408, y: 1024, width: 64, height: 32 }, { x: 1664, y: 1024, width: 64, height: 32 }, { x: 2368, y: 1024, width: 64, height: 32 }, { x: 2112, y: 1056, width: 64, height: 32 },
  { x: 480, y: 1088, width: 32, height: 64 }, { x: 640, y: 1088, width: 32, height: 64 }, { x: 768, y: 1088, width: 64, height: 64 }, { x: 960, y: 1088, width: 64, height: 64 },
  { x: 2208, y: 1088, width: 32, height: 32 }, { x: 2272, y: 1088, width: 64, height: 32 }, { x: 2432, y: 1088, width: 32, height: 96 }, { x: 512, y: 1120, width: 128, height: 32 },
  { x: 832, y: 1120, width: 32, height: 32 }, { x: 928, y: 1120, width: 32, height: 32 }, { x: 1600, y: 1120, width: 32, height: 32 }, { x: 256, y: 1152, width: 64, height: 192 },
  { x: 1056, y: 1152, width: 32, height: 32 }, { x: 1728, y: 1152, width: 64, height: 32 }, { x: 2080, y: 1152, width: 160, height: 32 }, { x: 2304, y: 1152, width: 128, height: 32 },
  { x: 64, y: 1280, width: 64, height: 160 }, { x: 2432, y: 1280, width: 64, height: 160 }, { x: 1120, y: 1312, width: 32, height: 32 }, { x: 1440, y: 1312, width: 32, height: 32 },
  { x: 1632, y: 1312, width: 32, height: 128 }, { x: 2368, y: 1312, width: 64, height: 128 }, { x: 832, y: 1344, width: 192, height: 96 }, { x: 1536, y: 1344, width: 96, height: 96 },
  { x: 1664, y: 1344, width: 128, height: 96 }, { x: 2304, y: 1344, width: 64, height: 96 }, { x: 256, y: 1408, width: 576, height: 32 }, { x: 1024, y: 1408, width: 512, height: 32 },
  { x: 1792, y: 1408, width: 512, height: 32 }
];

/** Whether an Avatar's feet may stand at this point. Mirrors RoomRules.walkable. */
export function walkable(x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (x < FOOT_RADIUS || y < FOOT_RADIUS || x > WORLD_WIDTH - FOOT_RADIUS || y > WORLD_HEIGHT - FOOT_RADIUS) return false;
  return !OBSTACLES.some(o => x > o.x - FOOT_RADIUS && x < o.x + o.width + FOOT_RADIUS
    && y > o.y - FOOT_RADIUS && y < o.y + o.height + FOOT_RADIUS);
}
