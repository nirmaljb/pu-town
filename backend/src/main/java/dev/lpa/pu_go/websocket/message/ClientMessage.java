package dev.lpa.pu_go.websocket.message;

import dev.lpa.pu_go.game.ChatChannel;
import dev.lpa.pu_go.game.Ability;

public sealed interface ClientMessage permits ClientMessage.SelectAvatar, ClientMessage.RecoverRoom, ClientMessage.SetReady, ClientMessage.SetRoleSetup, ClientMessage.StartGame, ClientMessage.Ping, ClientMessage.CreateRoom, ClientMessage.JoinRoom, ClientMessage.LeaveRoom, ClientMessage.Move, ClientMessage.UseAbility, ClientMessage.MeetingVote, ClientMessage.SendChat {
    int version();
    String type();

    record SelectAvatar(int version, String type, String avatarPreset) implements ClientMessage {}
    record RecoverRoom(int version, String type, String roomId, String recoveryToken) implements ClientMessage {}
    record SetReady(int version, String type, boolean ready) implements ClientMessage {}
    /** The Host's deal for the next Game: how many Mafia, Doctors and Sheriffs. */
    record SetRoleSetup(int version, String type, int mafia, int doctors, int sheriffs) implements ClientMessage {}
    record StartGame(int version, String type) implements ClientMessage {}
    record Ping(int version, String type) implements ClientMessage {}
    record CreateRoom(int version, String type, String displayName) implements ClientMessage {}
    record JoinRoom(int version, String type, String roomId, String displayName) implements ClientMessage {}
    record LeaveRoom(int version, String type) implements ClientMessage {}

    /** The sender's own client-walked position during a Roam. The server may refuse it. */
    record Move(int version, String type, double x, double y, String facing) implements ClientMessage {}

    /** One Roam ability. Only kill, shield and scan name a target; the rest send null. */
    record UseAbility(int version, String type, Ability ability, int round, String targetPlayerId) implements ClientMessage {}

    /** A Meeting ballot. A null target is an explicit Skip. */
    record MeetingVote(int version, String type, int round, String targetPlayerId) implements ClientMessage {}

    record SendChat(int version, String type, ChatChannel channel, String text) implements ClientMessage {}
}
