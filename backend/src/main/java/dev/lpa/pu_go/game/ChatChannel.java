package dev.lpa.pu_go.game;

import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Arrays;

/** Who a chat message is addressed to: the whole town, or the Mafia alone. */
public enum ChatChannel {
    PUBLIC("public"),
    MAFIA("mafia");

    private final String wireValue;

    ChatChannel(String wireValue) { this.wireValue = wireValue; }

    @JsonValue
    public String wireValue() { return wireValue; }

    /** The channel this name identifies, or null when it identifies none. */
    public static ChatChannel ofWireValue(String value) {
        return Arrays.stream(values()).filter(channel -> channel.wireValue.equals(value)).findFirst().orElse(null);
    }
}
