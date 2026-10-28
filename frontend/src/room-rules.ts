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
  { x: 0, y: 0, width: 2560, height: 96 }, { x: 0, y: 96, width: 736, height: 32 }, { x: 800, y: 96, width: 736, height: 32 }, { x: 1696, y: 96, width: 864, height: 32 },
  { x: 0, y: 128, width: 160, height: 32 }, { x: 192, y: 128, width: 128, height: 32 }, { x: 512, y: 128, width: 64, height: 32 }, { x: 608, y: 128, width: 128, height: 32 },
  { x: 832, y: 128, width: 64, height: 32 }, { x: 1088, y: 128, width: 160, height: 32 }, { x: 2016, y: 128, width: 128, height: 32 }, { x: 2464, y: 128, width: 96, height: 96 },
  { x: 0, y: 160, width: 96, height: 64 }, { x: 608, y: 160, width: 96, height: 64 }, { x: 736, y: 160, width: 32, height: 32 }, { x: 832, y: 160, width: 160, height: 32 },
  { x: 1248, y: 160, width: 64, height: 32 }, { x: 1344, y: 160, width: 32, height: 32 }, { x: 256, y: 192, width: 32, height: 32 }, { x: 352, y: 192, width: 32, height: 32 },
  { x: 448, y: 192, width: 32, height: 32 }, { x: 800, y: 192, width: 224, height: 64 }, { x: 1632, y: 192, width: 128, height: 32 }, { x: 1792, y: 192, width: 32, height: 32 },
  { x: 0, y: 224, width: 160, height: 32 }, { x: 576, y: 224, width: 128, height: 32 }, { x: 1280, y: 224, width: 64, height: 32 }, { x: 1440, y: 224, width: 32, height: 32 },
  { x: 1632, y: 224, width: 32, height: 32 }, { x: 1696, y: 224, width: 32, height: 32 }, { x: 2496, y: 224, width: 64, height: 128 }, { x: 0, y: 256, width: 96, height: 128 },
  { x: 352, y: 256, width: 32, height: 32 }, { x: 768, y: 256, width: 256, height: 32 }, { x: 1152, y: 256, width: 32, height: 32 }, { x: 1280, y: 256, width: 32, height: 32 },
  { x: 1344, y: 256, width: 32, height: 32 }, { x: 1824, y: 256, width: 32, height: 32 }, { x: 2048, y: 256, width: 128, height: 64 }, { x: 768, y: 288, width: 32, height: 32 },
  { x: 832, y: 288, width: 160, height: 32 }, { x: 1088, y: 288, width: 32, height: 32 }, { x: 1504, y: 288, width: 64, height: 32 }, { x: 1632, y: 288, width: 96, height: 32 },
  { x: 1888, y: 288, width: 64, height: 64 }, { x: 2272, y: 288, width: 64, height: 64 }, { x: 896, y: 320, width: 32, height: 32 }, { x: 1056, y: 320, width: 64, height: 32 },
  { x: 288, y: 352, width: 32, height: 32 }, { x: 608, y: 352, width: 96, height: 32 }, { x: 1248, y: 352, width: 96, height: 32 }, { x: 2464, y: 352, width: 96, height: 320 },
  { x: 0, y: 384, width: 64, height: 32 }, { x: 352, y: 384, width: 32, height: 64 }, { x: 608, y: 384, width: 128, height: 128 }, { x: 864, y: 384, width: 64, height: 32 },
  { x: 992, y: 384, width: 32, height: 32 }, { x: 1088, y: 384, width: 352, height: 32 }, { x: 1568, y: 384, width: 96, height: 32 }, { x: 0, y: 416, width: 96, height: 96 },
  { x: 288, y: 416, width: 32, height: 32 }, { x: 1088, y: 416, width: 384, height: 96 }, { x: 1568, y: 416, width: 128, height: 32 }, { x: 1824, y: 416, width: 32, height: 32 },
  { x: 2336, y: 416, width: 96, height: 32 }, { x: 192, y: 448, width: 32, height: 32 }, { x: 448, y: 448, width: 32, height: 32 }, { x: 1792, y: 448, width: 32, height: 32 },
  { x: 2176, y: 448, width: 32, height: 32 }, { x: 2240, y: 448, width: 32, height: 32 }, { x: 2336, y: 448, width: 64, height: 32 }, { x: 128, y: 480, width: 288, height: 32 },
  { x: 480, y: 480, width: 64, height: 32 }, { x: 1888, y: 480, width: 64, height: 32 }, { x: 0, y: 512, width: 416, height: 32 }, { x: 480, y: 512, width: 32, height: 32 },
  { x: 608, y: 512, width: 96, height: 32 }, { x: 928, y: 512, width: 32, height: 32 }, { x: 1600, y: 512, width: 32, height: 32 }, { x: 2080, y: 512, width: 32, height: 32 },
  { x: 2208, y: 512, width: 64, height: 32 }, { x: 0, y: 544, width: 512, height: 64 }, { x: 576, y: 544, width: 128, height: 64 }, { x: 1696, y: 544, width: 256, height: 160 },
  { x: 2080, y: 576, width: 160, height: 96 }, { x: 2272, y: 576, width: 160, height: 96 }, { x: 0, y: 608, width: 160, height: 64 }, { x: 512, y: 608, width: 160, height: 32 },
  { x: 704, y: 608, width: 32, height: 32 }, { x: 896, y: 608, width: 32, height: 32 }, { x: 1632, y: 608, width: 32, height: 32 }, { x: 288, y: 640, width: 64, height: 32 },
  { x: 544, y: 640, width: 128, height: 32 }, { x: 0, y: 672, width: 96, height: 288 }, { x: 512, y: 672, width: 128, height: 32 }, { x: 2432, y: 672, width: 128, height: 128 },
  { x: 512, y: 800, width: 128, height: 96 }, { x: 1760, y: 800, width: 64, height: 32 }, { x: 2112, y: 800, width: 64, height: 32 }, { x: 2336, y: 800, width: 32, height: 32 },
  { x: 2464, y: 800, width: 96, height: 96 }, { x: 768, y: 832, width: 32, height: 32 }, { x: 1792, y: 832, width: 32, height: 32 }, { x: 2080, y: 864, width: 32, height: 32 },
  { x: 544, y: 896, width: 96, height: 32 }, { x: 672, y: 896, width: 64, height: 32 }, { x: 768, y: 896, width: 32, height: 32 }, { x: 1728, y: 896, width: 160, height: 96 },
  { x: 1984, y: 896, width: 64, height: 32 }, { x: 2400, y: 896, width: 160, height: 32 }, { x: 544, y: 928, width: 128, height: 96 }, { x: 1920, y: 928, width: 32, height: 32 },
  { x: 2048, y: 928, width: 320, height: 96 }, { x: 2464, y: 928, width: 96, height: 96 }, { x: 0, y: 960, width: 64, height: 128 }, { x: 384, y: 1024, width: 32, height: 32 },
  { x: 544, y: 1024, width: 192, height: 32 }, { x: 1984, y: 1024, width: 352, height: 32 }, { x: 2400, y: 1024, width: 160, height: 32 }, { x: 544, y: 1056, width: 128, height: 128 },
  { x: 768, y: 1056, width: 64, height: 32 }, { x: 896, y: 1056, width: 96, height: 64 }, { x: 1056, y: 1056, width: 160, height: 32 }, { x: 1344, y: 1056, width: 96, height: 64 },
  { x: 1504, y: 1056, width: 96, height: 64 }, { x: 1664, y: 1056, width: 64, height: 32 }, { x: 1952, y: 1056, width: 32, height: 32 }, { x: 2368, y: 1056, width: 32, height: 32 },
  { x: 2464, y: 1056, width: 96, height: 64 }, { x: 0, y: 1088, width: 288, height: 32 }, { x: 352, y: 1088, width: 160, height: 32 }, { x: 736, y: 1088, width: 128, height: 32 },
  { x: 1056, y: 1088, width: 96, height: 32 }, { x: 1664, y: 1088, width: 96, height: 32 }, { x: 1792, y: 1088, width: 32, height: 32 }, { x: 1888, y: 1088, width: 32, height: 32 },
  { x: 1952, y: 1088, width: 96, height: 32 }, { x: 0, y: 1120, width: 128, height: 192 }, { x: 192, y: 1120, width: 32, height: 32 }, { x: 384, y: 1120, width: 64, height: 32 },
  { x: 480, y: 1120, width: 32, height: 64 }, { x: 736, y: 1120, width: 32, height: 32 }, { x: 832, y: 1120, width: 32, height: 32 }, { x: 960, y: 1120, width: 32, height: 32 },
  { x: 1120, y: 1120, width: 32, height: 32 }, { x: 1408, y: 1120, width: 32, height: 32 }, { x: 1504, y: 1120, width: 32, height: 32 }, { x: 2368, y: 1120, width: 64, height: 32 },
  { x: 2496, y: 1120, width: 64, height: 128 }, { x: 288, y: 1152, width: 32, height: 32 }, { x: 2304, y: 1152, width: 64, height: 32 }, { x: 320, y: 1184, width: 32, height: 32 },
  { x: 416, y: 1184, width: 96, height: 32 }, { x: 576, y: 1184, width: 128, height: 64 }, { x: 1888, y: 1184, width: 64, height: 32 }, { x: 480, y: 1216, width: 32, height: 96 },
  { x: 160, y: 1248, width: 32, height: 32 }, { x: 576, y: 1248, width: 160, height: 32 }, { x: 768, y: 1248, width: 96, height: 32 }, { x: 1248, y: 1248, width: 64, height: 64 },
  { x: 1760, y: 1248, width: 64, height: 64 }, { x: 2464, y: 1248, width: 96, height: 64 }, { x: 608, y: 1280, width: 160, height: 32 }, { x: 800, y: 1280, width: 64, height: 32 },
  { x: 1152, y: 1280, width: 32, height: 32 }, { x: 1472, y: 1280, width: 96, height: 32 }, { x: 1632, y: 1280, width: 32, height: 32 }, { x: 1920, y: 1280, width: 64, height: 32 },
  { x: 2176, y: 1280, width: 32, height: 32 }, { x: 2240, y: 1280, width: 32, height: 64 }, { x: 2368, y: 1280, width: 64, height: 32 }, { x: 0, y: 1312, width: 512, height: 32 },
  { x: 608, y: 1312, width: 128, height: 32 }, { x: 1120, y: 1312, width: 64, height: 32 }, { x: 1696, y: 1312, width: 32, height: 32 }, { x: 2016, y: 1312, width: 64, height: 32 },
  { x: 2400, y: 1312, width: 160, height: 32 }, { x: 0, y: 1344, width: 544, height: 32 }, { x: 608, y: 1344, width: 160, height: 32 }, { x: 864, y: 1344, width: 32, height: 32 },
  { x: 992, y: 1344, width: 96, height: 32 }, { x: 1216, y: 1344, width: 224, height: 32 }, { x: 1568, y: 1344, width: 96, height: 32 }, { x: 1888, y: 1344, width: 160, height: 32 },
  { x: 2112, y: 1344, width: 224, height: 32 }, { x: 2368, y: 1344, width: 192, height: 32 }, { x: 0, y: 1376, width: 2560, height: 64 }
];

/** Whether an Avatar's feet may stand at this point. Mirrors RoomRules.walkable. */
export function walkable(x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (x < FOOT_RADIUS || y < FOOT_RADIUS || x > WORLD_WIDTH - FOOT_RADIUS || y > WORLD_HEIGHT - FOOT_RADIUS) return false;
  return !OBSTACLES.some(o => x > o.x - FOOT_RADIUS && x < o.x + o.width + FOOT_RADIUS
    && y > o.y - FOOT_RADIUS && y < o.y + o.height + FOOT_RADIUS);
}
