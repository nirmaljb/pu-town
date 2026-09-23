/** The canvas shows one screen of the town at a time. */
export const ROOM_WIDTH = 1_280;
export const ROOM_HEIGHT = 720;

// Client copies of the authoritative RoomRules and FieldRules; the server re-checks all of them.
export const WORLD_WIDTH = 2_560;
export const WORLD_HEIGHT = 1_440;
export const MIN_PLAYERS = 4;
/** The Town Hall is drawn in its own 1280x720 frame, placed at this offset in the town. */
export const HALL_X = 640;
export const HALL_Y = 360;
export const BUTTON_X = HALL_X + 640;
export const BUTTON_Y = HALL_Y + 382;
export const FOOT_RADIUS = 14;

/** A little below the server's limit, so honest movement is never corrected. */
export const WALK_SPEED = 220;
export const VISION = 380;
export const KILL_RANGE = 90;
export const SHIELD_RANGE = 120;
export const SCAN_RANGE = 140;
export const REPORT_RANGE = 120;
export const EMERGENCY_RANGE = 150;

export type Obstacle = Readonly<{ x: number; y: number; width: number; height: number; kind: "wall" | "house" | "shed" | "stall" | "tree" }>;

export const OBSTACLES: readonly Obstacle[] = [
  { x: 704, y: 424, width: 1152, height: 30, kind: "wall" },
  { x: 704, y: 424, width: 30, height: 618, kind: "wall" },
  { x: 1826, y: 424, width: 30, height: 618, kind: "wall" },
  { x: 160, y: 140, width: 360, height: 250, kind: "house" },
  { x: 2040, y: 140, width: 360, height: 250, kind: "house" },
  { x: 160, y: 1060, width: 360, height: 250, kind: "house" },
  { x: 2040, y: 1060, width: 360, height: 250, kind: "house" },
  { x: 1140, y: 110, width: 280, height: 170, kind: "shed" },
  { x: 980, y: 1200, width: 220, height: 110, kind: "stall" },
  { x: 1360, y: 1200, width: 220, height: 110, kind: "stall" },
  { x: 596, y: 176, width: 48, height: 48, kind: "tree" },
  { x: 1896, y: 176, width: 48, height: 48, kind: "tree" },
  { x: 306, y: 676, width: 48, height: 48, kind: "tree" },
  { x: 2206, y: 676, width: 48, height: 48, kind: "tree" },
  { x: 596, y: 1276, width: 48, height: 48, kind: "tree" },
  { x: 1896, y: 1276, width: 48, height: 48, kind: "tree" }
];

/** Whether an Avatar's feet may stand at this point. Mirrors RoomRules.walkable. */
export function walkable(x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (x < FOOT_RADIUS || y < FOOT_RADIUS || x > WORLD_WIDTH - FOOT_RADIUS || y > WORLD_HEIGHT - FOOT_RADIUS) return false;
  return !OBSTACLES.some(o => x > o.x - FOOT_RADIUS && x < o.x + o.width + FOOT_RADIUS
    && y > o.y - FOOT_RADIUS && y < o.y + o.height + FOOT_RADIUS);
}
