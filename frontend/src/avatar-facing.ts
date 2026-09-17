export const DIRECTIONS = ["up", "left", "down", "right"] as const;
export type Direction = typeof DIRECTIONS[number];

/** Seated Avatars face the centre of the circle, mirroring authoritative RoomRules. */
export function seatFacing(seat: number): Direction {
  return seat === 0 ? "down" : seat < 5 ? "left" : seat === 5 ? "up" : "right";
}
