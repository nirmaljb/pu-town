package dev.lpa.pu_go.game;

import com.fasterxml.jackson.annotation.JsonValue;

/** A Player's assigned identity within a Game, independent of their Avatar Preset. */
public enum Role {
    MAFIA("mafia", Faction.MAFIA),
    VILLAGER("villager", Faction.VILLAGE),
    DOCTOR("doctor", Faction.VILLAGE),
    SHERIFF("sheriff", Faction.VILLAGE);

    private final String wireValue;
    private final Faction faction;

    Role(String wireValue, Faction faction) {
        this.wireValue = wireValue;
        this.faction = faction;
    }

    @JsonValue
    public String wireValue() { return wireValue; }

    public Faction faction() { return faction; }
}
