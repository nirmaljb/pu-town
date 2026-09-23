package dev.lpa.pu_go.game;

import com.fasterxml.jackson.annotation.JsonValue;

/** The server-owned Game phases and their fixed durations. */
public enum GamePhase {
    ROLE_REVEAL("role_reveal", 8_000),
    /** Everyone walks the town; the Mafia hunt, the Doctor shields, the Sheriff scans. */
    ROAM("roam", 150_000),
    /** A Body was reported, an Emergency Meeting called, or the Roam ran out. */
    MEETING_CALL("meeting_call", 5_000),
    DISCUSSION("discussion", 90_000),
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
