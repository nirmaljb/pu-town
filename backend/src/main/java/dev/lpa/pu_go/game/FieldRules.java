package dev.lpa.pu_go.game;

/** Distances in world pixels and durations in milliseconds for Day. */
public final class FieldRules {
    /** Fastest walking speed the server accepts; the client walks a little slower. */
    public static final double SPEED = 240;
    /**
     * How far a living Player can see; nothing further away is ever sent to them. The Mafia
     * see furthest, then the Doctor, then the Sheriff, and Villagers least.
     */
    public static final double MAFIA_VISION = 440;
    public static final double DOCTOR_VISION = 380;
    public static final double SHERIFF_VISION = 330;
    public static final double VILLAGER_VISION = 270;

    public static double vision(Role role) {
        return switch (role) {
            case MAFIA -> MAFIA_VISION;
            case DOCTOR -> DOCTOR_VISION;
            case SHERIFF -> SHERIFF_VISION;
            case VILLAGER -> VILLAGER_VISION;
        };
    }

    private FieldRules() {}
}
