package dev.lpa.pu_go.game;

/** Distances in world pixels and durations in milliseconds for the Roam. */
public final class FieldRules {
    /** Fastest walking speed the server accepts; the client walks a little slower. */
    public static final double SPEED = 240;
    /** How far a living Player can see. Nothing further away is ever sent to them. */
    public static final double VISION = 380;

    public static final double KILL_RANGE = 90;
    public static final long KILL_COOLDOWN = 25_000;
    public static final long VANISH_DURATION = 10_000;
    public static final long VANISH_COOLDOWN = 30_000;
    public static final double SHIELD_RANGE = 120;
    public static final long SHIELD_DURATION = 20_000;
    public static final long SHIELD_COOLDOWN = 30_000;
    public static final double SCAN_RANGE = 140;
    public static final long SCAN_COOLDOWN = 30_000;
    /** Every cooldown starts partly spent when a Roam begins. */
    public static final long OPENING_COOLDOWN = 10_000;
    public static final double REPORT_RANGE = 120;
    public static final double EMERGENCY_RANGE = 150;

    /** A Villager who stays this close to another Player for too long is pushed away. */
    public static final double CROWD_RADIUS = 90;
    public static final long CROWD_LIMIT = 6_000;
    public static final double PUSH_DISTANCE = 170;

    private FieldRules() {}
}
