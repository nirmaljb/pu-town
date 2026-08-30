package dev.lpa.pu_go.websocket.message;

import com.fasterxml.jackson.annotation.JsonValue;

import java.util.List;

public sealed interface ServerMessage permits ServerMessage.RoomSnapshot, ServerMessage.PlayerJoined,
        ServerMessage.PlayerMoved, ServerMessage.PlayerLeft, ServerMessage.RoomLeft, ServerMessage.ErrorMessage {
    int version();
    String type();

    record PlayerView(String playerId, String displayName, double x, double y) {}

    enum DepartureReason {
        LEFT("left"),
        DISCONNECTED("disconnected");

        private final String wireValue;

        DepartureReason(String wireValue) { this.wireValue = wireValue; }

        @JsonValue
        public String wireValue() { return wireValue; }
    }

    record RoomSnapshot(int version, String type, String selfPlayerId, String roomId, List<PlayerView> players)
            implements ServerMessage {
        public RoomSnapshot(String selfPlayerId, String roomId, List<PlayerView> players) {
            this(1, "room_snapshot", selfPlayerId, roomId, List.copyOf(players));
        }
    }

    record PlayerJoined(int version, String type, PlayerView player) implements ServerMessage {
        public PlayerJoined(PlayerView player) { this(1, "player_joined", player); }
    }

    record PlayerMoved(int version, String type, String playerId, double x, double y) implements ServerMessage {
        public PlayerMoved(String playerId, double x, double y) { this(1, "player_moved", playerId, x, y); }
    }

    record PlayerLeft(int version, String type, String playerId, DepartureReason reason) implements ServerMessage {
        public PlayerLeft(String playerId, DepartureReason reason) { this(1, "player_left", playerId, reason); }
    }

    record RoomLeft(int version, String type, String roomId) implements ServerMessage {
        public RoomLeft(String roomId) { this(1, "room_left", roomId); }
    }

    record ErrorMessage(int version, String type, String code, String message) implements ServerMessage {
        public ErrorMessage(String code, String message) { this(1, "error", code, message); }
    }
}
