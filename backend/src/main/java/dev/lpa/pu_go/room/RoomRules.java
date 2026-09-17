package dev.lpa.pu_go.room;

public final class RoomRules {
    public static final double WIDTH = 1_280;
    public static final double HEIGHT = 720;

    public static final int CAPACITY = 10;

    // Seat zero is north; indices run clockwise around the open centre.
    public static double seatX(int seat) { return Math.round(640 + 390 * Math.sin(seat * Math.PI / 5)); }
    public static double seatY(int seat) { return Math.round(382 - 205 * Math.cos(seat * Math.PI / 5)); }

    /** Seated Avatars face the centre of the circle in both the Lobby and the Game. */
    public static String seatFacing(int seat) {
        return seat == 0 ? "down" : seat < 5 ? "left" : seat == 5 ? "up" : "right";
    }

    private RoomRules() {}
}
