package dev.lpa.pu_go.websocket.message;

import dev.lpa.pu_go.game.ChatChannel;
import dev.lpa.pu_go.game.NightChoice;

public sealed interface ClientMessage permits ClientMessage.SelectAvatar, ClientMessage.RecoverRoom, ClientMessage.SetReady, ClientMessage.StartGame, ClientMessage.Ping, ClientMessage.CreateRoom, ClientMessage.JoinRoom, ClientMessage.LeaveRoom, ClientMessage.NightAction, ClientMessage.MeetingVote, ClientMessage.SendChat {
    int version();
    String type();

    record SelectAvatar(int version, String type, String avatarPreset) implements ClientMessage {}
    record RecoverRoom(int version, String type, String roomId, String recoveryToken) implements ClientMessage {}
    record SetReady(int version, String type, boolean ready) implements ClientMessage {}
    record StartGame(int version, String type) implements ClientMessage {}
    record Ping(int version, String type) implements ClientMessage {}
    record CreateRoom(int version, String type, String displayName) implements ClientMessage {}
    record JoinRoom(int version, String type, String roomId, String displayName) implements ClientMessage {}
    record LeaveRoom(int version, String type) implements ClientMessage {}

    /** One confirmed Night choice. The type names which Role's action it is. */
    record NightAction(int version, String type, NightChoice choice, int round, String targetPlayerId) implements ClientMessage {}

    /** A Meeting ballot. A null target is an explicit Skip. */
    record MeetingVote(int version, String type, int round, String targetPlayerId) implements ClientMessage {}

    record SendChat(int version, String type, ChatChannel channel, String text) implements ClientMessage {}
}
