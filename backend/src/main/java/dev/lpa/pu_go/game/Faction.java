package dev.lpa.pu_go.game;

import com.fasterxml.jackson.annotation.JsonValue;

/** The side a Player belongs to in a Game. */
public enum Faction {
    MAFIA("mafia"),
    VILLAGE("village");

    private final String wireValue;

    Faction(String wireValue) { this.wireValue = wireValue; }

    @JsonValue
    public String wireValue() { return wireValue; }
}
