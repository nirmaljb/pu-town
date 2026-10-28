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
            new Obstacle(0, 0, 2560, 96), new Obstacle(0, 96, 736, 32), new Obstacle(800, 96, 736, 32), new Obstacle(1696, 96, 864, 32),
            new Obstacle(0, 128, 160, 32), new Obstacle(192, 128, 128, 32), new Obstacle(512, 128, 64, 32), new Obstacle(608, 128, 128, 32),
            new Obstacle(832, 128, 64, 32), new Obstacle(1088, 128, 160, 32), new Obstacle(2016, 128, 128, 32), new Obstacle(2464, 128, 96, 96),
            new Obstacle(0, 160, 96, 64), new Obstacle(608, 160, 96, 64), new Obstacle(736, 160, 32, 32), new Obstacle(832, 160, 160, 32),
            new Obstacle(1248, 160, 64, 32), new Obstacle(1344, 160, 32, 32), new Obstacle(256, 192, 32, 32), new Obstacle(352, 192, 32, 32),
            new Obstacle(448, 192, 32, 32), new Obstacle(800, 192, 224, 64), new Obstacle(1632, 192, 128, 32), new Obstacle(1792, 192, 32, 32),
            new Obstacle(0, 224, 160, 32), new Obstacle(576, 224, 128, 32), new Obstacle(1280, 224, 64, 32), new Obstacle(1440, 224, 32, 32),
            new Obstacle(1632, 224, 32, 32), new Obstacle(1696, 224, 32, 32), new Obstacle(2496, 224, 64, 128), new Obstacle(0, 256, 96, 128),
            new Obstacle(352, 256, 32, 32), new Obstacle(768, 256, 256, 32), new Obstacle(1152, 256, 32, 32), new Obstacle(1280, 256, 32, 32),
            new Obstacle(1344, 256, 32, 32), new Obstacle(1824, 256, 32, 32), new Obstacle(2048, 256, 128, 64), new Obstacle(768, 288, 32, 32),
            new Obstacle(832, 288, 160, 32), new Obstacle(1088, 288, 32, 32), new Obstacle(1504, 288, 64, 32), new Obstacle(1632, 288, 96, 32),
            new Obstacle(1888, 288, 64, 64), new Obstacle(2272, 288, 64, 64), new Obstacle(896, 320, 32, 32), new Obstacle(1056, 320, 64, 32),
            new Obstacle(288, 352, 32, 32), new Obstacle(608, 352, 96, 32), new Obstacle(1248, 352, 96, 32), new Obstacle(2464, 352, 96, 320),
            new Obstacle(0, 384, 64, 32), new Obstacle(352, 384, 32, 64), new Obstacle(608, 384, 128, 128), new Obstacle(864, 384, 64, 32),
            new Obstacle(992, 384, 32, 32), new Obstacle(1088, 384, 352, 32), new Obstacle(1568, 384, 96, 32), new Obstacle(0, 416, 96, 96),
            new Obstacle(288, 416, 32, 32), new Obstacle(1088, 416, 384, 96), new Obstacle(1568, 416, 128, 32), new Obstacle(1824, 416, 32, 32),
            new Obstacle(2336, 416, 96, 32), new Obstacle(192, 448, 32, 32), new Obstacle(448, 448, 32, 32), new Obstacle(1792, 448, 32, 32),
            new Obstacle(2176, 448, 32, 32), new Obstacle(2240, 448, 32, 32), new Obstacle(2336, 448, 64, 32), new Obstacle(128, 480, 288, 32),
            new Obstacle(480, 480, 64, 32), new Obstacle(1888, 480, 64, 32), new Obstacle(0, 512, 416, 32), new Obstacle(480, 512, 32, 32),
            new Obstacle(608, 512, 96, 32), new Obstacle(928, 512, 32, 32), new Obstacle(1600, 512, 32, 32), new Obstacle(2080, 512, 32, 32),
            new Obstacle(2208, 512, 64, 32), new Obstacle(0, 544, 512, 64), new Obstacle(576, 544, 128, 64), new Obstacle(1696, 544, 256, 160),
            new Obstacle(2080, 576, 160, 96), new Obstacle(2272, 576, 160, 96), new Obstacle(0, 608, 160, 64), new Obstacle(512, 608, 160, 32),
            new Obstacle(704, 608, 32, 32), new Obstacle(896, 608, 32, 32), new Obstacle(1632, 608, 32, 32), new Obstacle(288, 640, 64, 32),
            new Obstacle(544, 640, 128, 32), new Obstacle(0, 672, 96, 288), new Obstacle(512, 672, 128, 32), new Obstacle(2432, 672, 128, 128),
            new Obstacle(512, 800, 128, 96), new Obstacle(1760, 800, 64, 32), new Obstacle(2112, 800, 64, 32), new Obstacle(2336, 800, 32, 32),
            new Obstacle(2464, 800, 96, 96), new Obstacle(768, 832, 32, 32), new Obstacle(1792, 832, 32, 32), new Obstacle(2080, 864, 32, 32),
            new Obstacle(544, 896, 96, 32), new Obstacle(672, 896, 64, 32), new Obstacle(768, 896, 32, 32), new Obstacle(1728, 896, 160, 96),
            new Obstacle(1984, 896, 64, 32), new Obstacle(2400, 896, 160, 32), new Obstacle(544, 928, 128, 96), new Obstacle(1920, 928, 32, 32),
            new Obstacle(2048, 928, 320, 96), new Obstacle(2464, 928, 96, 96), new Obstacle(0, 960, 64, 128), new Obstacle(384, 1024, 32, 32),
            new Obstacle(544, 1024, 192, 32), new Obstacle(1984, 1024, 352, 32), new Obstacle(2400, 1024, 160, 32), new Obstacle(544, 1056, 128, 128),
            new Obstacle(768, 1056, 64, 32), new Obstacle(896, 1056, 96, 64), new Obstacle(1056, 1056, 160, 32), new Obstacle(1344, 1056, 96, 64),
            new Obstacle(1504, 1056, 96, 64), new Obstacle(1664, 1056, 64, 32), new Obstacle(1952, 1056, 32, 32), new Obstacle(2368, 1056, 32, 32),
            new Obstacle(2464, 1056, 96, 64), new Obstacle(0, 1088, 288, 32), new Obstacle(352, 1088, 160, 32), new Obstacle(736, 1088, 128, 32),
            new Obstacle(1056, 1088, 96, 32), new Obstacle(1664, 1088, 96, 32), new Obstacle(1792, 1088, 32, 32), new Obstacle(1888, 1088, 32, 32),
            new Obstacle(1952, 1088, 96, 32), new Obstacle(0, 1120, 128, 192), new Obstacle(192, 1120, 32, 32), new Obstacle(384, 1120, 64, 32),
            new Obstacle(480, 1120, 32, 64), new Obstacle(736, 1120, 32, 32), new Obstacle(832, 1120, 32, 32), new Obstacle(960, 1120, 32, 32),
            new Obstacle(1120, 1120, 32, 32), new Obstacle(1408, 1120, 32, 32), new Obstacle(1504, 1120, 32, 32), new Obstacle(2368, 1120, 64, 32),
            new Obstacle(2496, 1120, 64, 128), new Obstacle(288, 1152, 32, 32), new Obstacle(2304, 1152, 64, 32), new Obstacle(320, 1184, 32, 32),
            new Obstacle(416, 1184, 96, 32), new Obstacle(576, 1184, 128, 64), new Obstacle(1888, 1184, 64, 32), new Obstacle(480, 1216, 32, 96),
            new Obstacle(160, 1248, 32, 32), new Obstacle(576, 1248, 160, 32), new Obstacle(768, 1248, 96, 32), new Obstacle(1248, 1248, 64, 64),
            new Obstacle(1760, 1248, 64, 64), new Obstacle(2464, 1248, 96, 64), new Obstacle(608, 1280, 160, 32), new Obstacle(800, 1280, 64, 32),
            new Obstacle(1152, 1280, 32, 32), new Obstacle(1472, 1280, 96, 32), new Obstacle(1632, 1280, 32, 32), new Obstacle(1920, 1280, 64, 32),
            new Obstacle(2176, 1280, 32, 32), new Obstacle(2240, 1280, 32, 64), new Obstacle(2368, 1280, 64, 32), new Obstacle(0, 1312, 512, 32),
            new Obstacle(608, 1312, 128, 32), new Obstacle(1120, 1312, 64, 32), new Obstacle(1696, 1312, 32, 32), new Obstacle(2016, 1312, 64, 32),
            new Obstacle(2400, 1312, 160, 32), new Obstacle(0, 1344, 544, 32), new Obstacle(608, 1344, 160, 32), new Obstacle(864, 1344, 32, 32),
            new Obstacle(992, 1344, 96, 32), new Obstacle(1216, 1344, 224, 32), new Obstacle(1568, 1344, 96, 32), new Obstacle(1888, 1344, 160, 32),
            new Obstacle(2112, 1344, 224, 32), new Obstacle(2368, 1344, 192, 32), new Obstacle(0, 1376, 2560, 64));


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
