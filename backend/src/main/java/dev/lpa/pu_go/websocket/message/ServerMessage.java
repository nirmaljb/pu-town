package dev.lpa.pu_go.websocket.message;

import com.fasterxml.jackson.annotation.JsonValue;
import dev.lpa.pu_go.game.ChatChannel;
import dev.lpa.pu_go.game.Faction;
import dev.lpa.pu_go.game.ParticipantStatus;
import dev.lpa.pu_go.game.Role;

import java.util.List;

public sealed interface ServerMessage permits ServerMessage.RoomState, ServerMessage.Pong, ServerMessage.RoomSnapshot, ServerMessage.PlayerJoined,
        ServerMessage.PlayerLeft, ServerMessage.RoomLeft, ServerMessage.ErrorMessage,
        ServerMessage.GameState, ServerMessage.ChatMessage, ServerMessage.ChatHistory {
    int version();
    String type();

    record Pong(int version, String type) implements ServerMessage {
        public Pong() { this(1, "pong"); }
    }

    record PlayerView(String playerId, String displayName, String colour, String avatarPreset, int seat, boolean ready, boolean connected, double x, double y, String facing) {}

    enum DepartureReason {
        LEFT("left"),
        EXPIRED("expired"),
        DISCONNECTED("disconnected");

        private final String wireValue;

        DepartureReason(String wireValue) { this.wireValue = wireValue; }

        @JsonValue
        public String wireValue() { return wireValue; }
    }

    record RoomSnapshot(int version, String type, String selfPlayerId, String roomId, String recoveryToken, String phase, String hostPlayerId, List<PlayerView> players)
            implements ServerMessage {
        public RoomSnapshot(String selfPlayerId, String roomId, String recoveryToken, String phase, String hostPlayerId, List<PlayerView> players) {
            this(1, "room_snapshot", selfPlayerId, roomId, recoveryToken, phase, hostPlayerId, List.copyOf(players));
        }
    }

    record RoomState(int version, String type, String phase, String hostPlayerId, List<PlayerView> players)
            implements ServerMessage {
        public RoomState(String phase, String hostPlayerId, List<PlayerView> players) {
            this(1, "room_state", phase, hostPlayerId, List.copyOf(players));
        }
    }

    record PlayerJoined(int version, String type, PlayerView player) implements ServerMessage {
        public PlayerJoined(PlayerView player) { this(1, "player_joined", player); }
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

    /** One Game Roster entry: original participation, independent of current Room Membership. */
    record RosterView(String playerId, String displayName, String colour, String avatarPreset, int seat,
                      ParticipantStatus status) {}

    record OutcomeView(String kind, String victimPlayerId, String eliminatedPlayerId, Boolean eliminatedMafia) {}

    /** A disclosed ballot or accepted Mafia vote. A null target is an explicit Skip. */
    record BallotView(String voterPlayerId, String targetPlayerId) {}

    record RoleView(String playerId, Role role) {}

    record InvestigationView(int round, String targetPlayerId, boolean mafia) {}

    /**
     * Everything one recipient is entitled to know beyond the public Game state. It is
     * built per recipient, never filtered in the client.
     */
    record SelfView(Role role, Faction faction, ParticipantStatus status, boolean killedByMafia,
                    List<String> mafiaTeam, List<BallotView> mafiaVotes, String mafiaVote,
                    String protect, String protectBlockedPlayerId, String investigate,
                    List<InvestigationView> investigations, boolean meetingVoted, String meetingVote) {}

    record GameState(int version, String type, String phase, int round, Long remainingMs,
                     List<RosterView> players, OutcomeView outcome, List<BallotView> ballots,
                     Faction winner, List<RoleView> roles, SelfView self) implements ServerMessage {
        public GameState(String phase, int round, Long remainingMs, List<RosterView> players, OutcomeView outcome,
                         List<BallotView> ballots, Faction winner, List<RoleView> roles, SelfView self) {
            this(1, "game_state", phase, round, remainingMs, List.copyOf(players), outcome,
                    ballots == null ? null : List.copyOf(ballots), winner,
                    roles == null ? null : List.copyOf(roles), self);
        }
    }

    record ChatMessage(int version, String type, ChatChannel channel, int round, String senderPlayerId,
                       String senderName, String text) implements ServerMessage {
        public ChatMessage(ChatChannel channel, int round, String senderPlayerId, String senderName, String text) {
            this(1, "chat_message", channel, round, senderPlayerId, senderName, text);
        }
    }

    record ChatView(ChatChannel channel, int round, String senderPlayerId, String senderName, String text) {}

    record ChatHistory(int version, String type, List<ChatView> messages) implements ServerMessage {
        public ChatHistory(List<ChatView> messages) { this(1, "chat_history", List.copyOf(messages)); }
    }
}
