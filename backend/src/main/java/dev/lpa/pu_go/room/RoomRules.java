package dev.lpa.pu_go.room;

import dev.lpa.pu_go.player.PlayerState;

public final class RoomRules {
    public static final double WIDTH = 1_280;
    public static final double HEIGHT = 720;
    public static final double SPAWN_X = WIDTH / 2;
    public static final double SPAWN_Y = HEIGHT / 2;
    public static final double MAX_SPEED_PER_SECOND = 240;
    public static final double NETWORK_TOLERANCE = 32;

    public static final int CAPACITY = 10;

    // Seat zero is north; indices run clockwise around the open centre.
    public static double seatX(int seat) { return Math.round(640 + 390 * Math.sin(seat * Math.PI / 5)); }
    public static double seatY(int seat) { return Math.round(382 - 205 * Math.cos(seat * Math.PI / 5)); }

    private RoomRules() {}

    public static boolean acceptsMovement(PlayerState player, double x, double y, long nowNanos) {
        if (!Double.isFinite(x) || !Double.isFinite(y)) return false;
        if (x < 0 || x > WIDTH || y < 0 || y > HEIGHT) return false;

        double elapsedSeconds = Math.max(0, nowNanos - player.getLastAcceptedMovementNanos()) / 1_000_000_000d;
        double allowedDistance = NETWORK_TOLERANCE + MAX_SPEED_PER_SECOND * elapsedSeconds;
        return Math.hypot(x - player.getX(), y - player.getY()) <= allowedDistance;
    }
}
