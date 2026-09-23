package dev.lpa.pu_go.game;

import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Arrays;

/** The things a Player can do while the town Roams, beyond walking. */
public enum Ability {
    /** Mafia: kill a visible Village Player within reach. */
    KILL("kill"),
    /** Mafia: disappear from every non-Mafia view for a while. */
    VANISH("vanish"),
    /** Doctor: shield a nearby Player so the next kill on them fails. */
    SHIELD("shield"),
    /** Sheriff: learn whether a nearby Player is Mafia. */
    SCAN("scan"),
    /** Anyone living: report a Body within reach, which calls a Meeting. */
    REPORT("report"),
    /** Anyone living, once per Game: call a Meeting from the button in the Town Hall. */
    EMERGENCY("emergency");

    private final String wireValue;

    Ability(String wireValue) { this.wireValue = wireValue; }

    @JsonValue
    public String wireValue() { return wireValue; }

    /** Whether the ability names a target Player. */
    public boolean targeted() { return this == KILL || this == SHIELD || this == SCAN; }

    public static Ability ofWireValue(String value) {
        return Arrays.stream(values()).filter(ability -> ability.wireValue.equals(value)).findFirst().orElse(null);
    }
}
