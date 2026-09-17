package dev.lpa.pu_go.game;

import com.fasterxml.jackson.annotation.JsonValue;

/** The server-owned Game phases and their fixed durations. */
public enum GamePhase {
    ROLE_REVEAL("role_reveal", 8_000),
    NIGHT("night", 90_000),
    NIGHT_RESULT("night_result", 6_000),
    DISCUSSION("discussion", 120_000),
    VOTING("voting", 30_000),
    VOTING_RESULT("voting_result", 6_000),
    FINISHED("finished", 0);

    private final String wireValue;
    private final long durationMillis;

    GamePhase(String wireValue, long durationMillis) {
        this.wireValue = wireValue;
        this.durationMillis = durationMillis;
    }

    @JsonValue
    public String wireValue() { return wireValue; }

    public long durationMillis() { return durationMillis; }
}
