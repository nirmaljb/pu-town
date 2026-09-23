package dev.lpa.pu_go.room;

import java.util.List;

public final class RoomRules {
    /** The whole town the Players roam; the camera shows one screen of it at a time. */
    public static final double WIDTH = 2_560;
    public static final double HEIGHT = 1_440;

    public static final int CAPACITY = 10;
    public static final int MIN_PLAYERS = 4;

    /** The Town Hall is drawn in its own 1280x720 frame, placed at this offset in the town. */
    public static final double HALL_X = 640;
    public static final double HALL_Y = 360;
    /** The Emergency Meeting button stands on the rug at the centre of the Town Hall. */
    public static final double BUTTON_X = HALL_X + 640;
    public static final double BUTTON_Y = HALL_Y + 382;

    /** Collision radius of an Avatar's feet. */
    public static final double FOOT_RADIUS = 14;

    /** One solid rectangle of the town, in world coordinates. */
    public record Obstacle(double x, double y, double width, double height) {
        boolean blocks(double px, double py, double radius) {
            return px > x - radius && px < x + width + radius && py > y - radius && py < y + height + radius;
        }
    }

    /** Walls, houses, stalls and trees. Mirrored by the client's room-rules.ts. */
    public static final List<Obstacle> OBSTACLES = List.of(
            // Town Hall: north wall and the two side walls; the south side is open.
            new Obstacle(704, 424, 1152, 30),
            new Obstacle(704, 424, 30, 618),
            new Obstacle(1826, 424, 30, 618),
            // Four houses in the corners.
            new Obstacle(160, 140, 360, 250),
            new Obstacle(2040, 140, 360, 250),
            new Obstacle(160, 1060, 360, 250),
            new Obstacle(2040, 1060, 360, 250),
            // The shed north of the Hall and two market stalls south of it.
            new Obstacle(1140, 110, 280, 170),
            new Obstacle(980, 1200, 220, 110),
            new Obstacle(1360, 1200, 220, 110),
            // Trees.
            new Obstacle(596, 176, 48, 48),
            new Obstacle(1896, 176, 48, 48),
            new Obstacle(306, 676, 48, 48),
            new Obstacle(2206, 676, 48, 48),
            new Obstacle(596, 1276, 48, 48),
            new Obstacle(1896, 1276, 48, 48));

    /** Whether an Avatar's feet may stand at this point. */
    public static boolean walkable(double x, double y) {
        if (!Double.isFinite(x) || !Double.isFinite(y)) return false;
        if (x < FOOT_RADIUS || y < FOOT_RADIUS || x > WIDTH - FOOT_RADIUS || y > HEIGHT - FOOT_RADIUS) return false;
        for (Obstacle obstacle : OBSTACLES) if (obstacle.blocks(x, y, FOOT_RADIUS)) return false;
        return true;
    }

    // Seat zero is north; indices run clockwise around the open centre of the Town Hall.
    public static double seatX(int seat) { return HALL_X + Math.round(640 + 390 * Math.sin(seat * 2 * Math.PI / CAPACITY)); }
    public static double seatY(int seat) { return HALL_Y + Math.round(382 - 205 * Math.cos(seat * 2 * Math.PI / CAPACITY)); }

    /** Seated Avatars face the centre of the circle in both the Lobby and the Meetings. */
    public static String seatFacing(int seat) {
        return seat == 0 ? "down" : seat * 2 < CAPACITY ? "left" : seat * 2 == CAPACITY ? "up" : "right";
    }

    private RoomRules() {}
}
