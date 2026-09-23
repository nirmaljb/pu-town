package dev.lpa.pu_go.room;

import java.util.List;

public final class RoomRules {
    /** The whole town the Players roam; the camera shows one screen of it at a time. */
    public static final double WIDTH = 2_560;
    public static final double HEIGHT = 1_440;

    public static final int CAPACITY = 10;
    public static final int MIN_PLAYERS = 4;

    /** The Emergency Meeting button stands in the middle of the Town Square; Meetings gather around it. */
    public static final double BUTTON_X = 1_280;
    public static final double BUTTON_Y = 742;

    /** Collision radius of an Avatar's feet. */
    public static final double FOOT_RADIUS = 14;

    /** One solid rectangle of the town, in world coordinates. */
    public record Obstacle(double x, double y, double width, double height) {
        boolean blocks(double px, double py, double radius) {
            return px > x - radius && px < x + width + radius && py > y - radius && py < y + height + radius;
        }
    }

    /**
     * The map's collision layer: the sea and pond, buildings, room walls and furniture, tree trunks and
     * large props, from frontend/public/maps/pu-town/pu-town.collision.json. Mirrored by the client's
     * room-rules.ts.
     */
    public static final List<Obstacle> OBSTACLES = List.of(
            new Obstacle(0, 0, 2560, 64), new Obstacle(0, 64, 192, 64), new Obstacle(576, 64, 256, 64), new Obstacle(1728, 64, 192, 64),
            new Obstacle(2368, 64, 192, 64), new Obstacle(1920, 96, 256, 96), new Obstacle(0, 128, 128, 64), new Obstacle(1056, 128, 32, 32),
            new Obstacle(1184, 128, 32, 32), new Obstacle(1376, 128, 32, 32), new Obstacle(1856, 128, 64, 96), new Obstacle(2432, 128, 128, 64),
            new Obstacle(128, 160, 32, 32), new Obstacle(1696, 160, 128, 64), new Obstacle(2240, 160, 32, 32), new Obstacle(2400, 160, 32, 32),
            new Obstacle(0, 192, 64, 1248), new Obstacle(320, 192, 160, 96), new Obstacle(800, 192, 32, 32), new Obstacle(1600, 192, 64, 32),
            new Obstacle(1952, 192, 128, 32), new Obstacle(2112, 192, 64, 32), new Obstacle(2496, 192, 64, 1248), new Obstacle(160, 224, 96, 64),
            new Obstacle(672, 224, 32, 32), new Obstacle(928, 224, 32, 32), new Obstacle(1856, 224, 32, 192), new Obstacle(2144, 224, 32, 192),
            new Obstacle(1664, 256, 96, 64), new Obstacle(1888, 256, 32, 32), new Obstacle(2080, 256, 32, 32), new Obstacle(1472, 288, 128, 96),
            new Obstacle(768, 320, 32, 32), new Obstacle(1888, 320, 32, 96), new Obstacle(2080, 320, 32, 32), new Obstacle(2400, 320, 32, 32),
            new Obstacle(640, 352, 32, 32), new Obstacle(864, 352, 32, 32), new Obstacle(2112, 352, 32, 64), new Obstacle(1152, 384, 256, 128),
            new Obstacle(1920, 384, 64, 32), new Obstacle(2048, 384, 64, 32), new Obstacle(2304, 384, 32, 32), new Obstacle(1600, 416, 192, 96),
            new Obstacle(64, 448, 64, 192), new Obstacle(800, 448, 32, 32), new Obstacle(928, 448, 32, 32), new Obstacle(2432, 448, 64, 128),
            new Obstacle(224, 480, 32, 32), new Obstacle(672, 480, 32, 32), new Obstacle(1568, 512, 32, 32), new Obstacle(992, 544, 32, 32),
            new Obstacle(1856, 544, 32, 32), new Obstacle(2304, 544, 32, 32), new Obstacle(544, 576, 32, 32), new Obstacle(512, 672, 96, 32),
            new Obstacle(2400, 672, 32, 32), new Obstacle(1856, 704, 64, 32), new Obstacle(448, 832, 96, 128), new Obstacle(608, 832, 96, 128),
            new Obstacle(2080, 832, 384, 96), new Obstacle(736, 864, 320, 96), new Obstacle(2080, 928, 32, 160), new Obstacle(2368, 928, 96, 32),
            new Obstacle(192, 960, 64, 480), new Obstacle(320, 960, 64, 384), new Obstacle(448, 960, 32, 192), new Obstacle(672, 960, 32, 192),
            new Obstacle(736, 960, 128, 32), new Obstacle(992, 960, 64, 32), new Obstacle(2112, 960, 64, 64), new Obstacle(2432, 960, 64, 128),
            new Obstacle(736, 992, 32, 160), new Obstacle(928, 992, 64, 32), new Obstacle(1024, 992, 32, 192), new Obstacle(1536, 992, 64, 32),
            new Obstacle(1824, 992, 96, 96), new Obstacle(1952, 992, 128, 64), new Obstacle(2208, 992, 128, 32), new Obstacle(128, 1024, 64, 416),
            new Obstacle(384, 1024, 64, 256), new Obstacle(480, 1024, 64, 32), new Obstacle(608, 1024, 64, 32), new Obstacle(832, 1024, 32, 32),
            new Obstacle(1408, 1024, 64, 32), new Obstacle(1664, 1024, 64, 32), new Obstacle(2368, 1024, 64, 32), new Obstacle(2112, 1056, 64, 32),
            new Obstacle(480, 1088, 32, 64), new Obstacle(640, 1088, 32, 64), new Obstacle(768, 1088, 64, 64), new Obstacle(960, 1088, 64, 64),
            new Obstacle(2208, 1088, 32, 32), new Obstacle(2272, 1088, 64, 32), new Obstacle(2432, 1088, 32, 96), new Obstacle(512, 1120, 128, 32),
            new Obstacle(832, 1120, 32, 32), new Obstacle(928, 1120, 32, 32), new Obstacle(1600, 1120, 32, 32), new Obstacle(256, 1152, 64, 192),
            new Obstacle(1056, 1152, 32, 32), new Obstacle(1728, 1152, 64, 32), new Obstacle(2080, 1152, 160, 32), new Obstacle(2304, 1152, 128, 32),
            new Obstacle(64, 1280, 64, 160), new Obstacle(2432, 1280, 64, 160), new Obstacle(1120, 1312, 32, 32), new Obstacle(1440, 1312, 32, 32),
            new Obstacle(1632, 1312, 32, 128), new Obstacle(2368, 1312, 64, 128), new Obstacle(832, 1344, 192, 96), new Obstacle(1536, 1344, 96, 96),
            new Obstacle(1664, 1344, 128, 96), new Obstacle(2304, 1344, 64, 96), new Obstacle(256, 1408, 576, 32), new Obstacle(1024, 1408, 512, 32),
            new Obstacle(1792, 1408, 512, 32));


    /** Whether an Avatar's feet may stand at this point. */
    public static boolean walkable(double x, double y) {
        if (!Double.isFinite(x) || !Double.isFinite(y)) return false;
        if (x < FOOT_RADIUS || y < FOOT_RADIUS || x > WIDTH - FOOT_RADIUS || y > HEIGHT - FOOT_RADIUS) return false;
        for (Obstacle obstacle : OBSTACLES) if (obstacle.blocks(x, y, FOOT_RADIUS)) return false;
        return true;
    }

    // Seat zero is north; indices run clockwise around the button in the Town Square.
    public static double seatX(int seat) { return BUTTON_X + Math.round(330 * Math.sin(seat * 2 * Math.PI / CAPACITY)); }
    public static double seatY(int seat) { return BUTTON_Y + Math.round(-205 * Math.cos(seat * 2 * Math.PI / CAPACITY)); }

    /** Seated Avatars face the centre of the circle in both the Lobby and the Meetings. */
    public static String seatFacing(int seat) {
        return seat == 0 ? "down" : seat * 2 < CAPACITY ? "left" : seat * 2 == CAPACITY ? "up" : "right";
    }

    private RoomRules() {}
}
