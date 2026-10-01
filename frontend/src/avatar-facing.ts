export const DIRECTIONS = ["up", "left", "down", "right"] as const;
export type Direction = typeof DIRECTIONS[number];

/** Mirrors ROOM_CAPACITY; kept here so this module stays free of Phaser imports. */
const SEAT_COUNT = 10;

/** Seated Avatars face the centre of the circle, mirroring authoritative RoomRules. */
export function seatFacing(seat: number): Direction {
  return seat === 0 ? "down" : seat * 2 < SEAT_COUNT ? "left" : seat * 2 === SEAT_COUNT ? "up" : "right";
}
