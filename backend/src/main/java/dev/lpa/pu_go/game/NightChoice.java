package dev.lpa.pu_go.game;

import java.util.Arrays;

/** The three Night choices, each belonging to exactly one Role. */
public enum NightChoice {
    MAFIA_VOTE("mafia_vote"),
    PROTECT("protect"),
    INVESTIGATE("investigate");

    private final String wireValue;

    NightChoice(String wireValue) { this.wireValue = wireValue; }

    public String wireValue() { return wireValue; }

    /** The choice this message type names, or null when it names none. */
    public static NightChoice ofWireValue(String value) {
        return Arrays.stream(values()).filter(choice -> choice.wireValue.equals(value)).findFirst().orElse(null);
    }
}
