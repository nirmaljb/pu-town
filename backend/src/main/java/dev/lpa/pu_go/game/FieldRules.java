package dev.lpa.pu_go.game;

/** Distances in world pixels and durations in milliseconds for Day. */
public final class FieldRules {
    /** Fastest walking speed the server accepts; the client walks a little slower. */
    public static final double SPEED = 240;
    /** Shared living Vision, covering the five-tile (160px) hearing range. */
    public static final double DAY_VISION = 320;

    private FieldRules() {}
}
