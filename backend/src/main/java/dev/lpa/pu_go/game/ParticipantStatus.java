package dev.lpa.pu_go.game;

import com.fasterxml.jackson.annotation.JsonValue;

/** Participation in a Game, which outlives the Room Membership that began it. */
public enum ParticipantStatus {
    LIVING("living"),
    ELIMINATED("eliminated"),
    LEFT("left");

    private final String wireValue;

    ParticipantStatus(String wireValue) { this.wireValue = wireValue; }

    @JsonValue
    public String wireValue() { return wireValue; }
}
