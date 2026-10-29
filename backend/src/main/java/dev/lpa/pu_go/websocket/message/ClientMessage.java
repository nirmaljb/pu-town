package dev.lpa.pu_go.websocket.message;

import dev.lpa.pu_go.game.ChatChannel;
import dev.lpa.pu_go.game.Ability;

public sealed interface ClientMessage permits ClientMessage.SelectAvatar, ClientMessage.RecoverRoom, ClientMessage.SetReady, ClientMessage.SetRoleSetup, ClientMessage.StartGame, ClientMessage.Ping, ClientMessage.CreateRoom, ClientMessage.JoinRoom, ClientMessage.LeaveRoom, ClientMessage.Move, ClientMessage.UseAbility, ClientMessage.MeetingVote, ClientMessage.SendChat, ClientMessage.SetVoice, ClientMessage.VoiceSignal, ClientMessage.VoiceFrame {
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

    /** Joins or leaves this connection's voice; only voice-enabled Players are routed. */
    record SetVoice(int version, String type, boolean enabled) implements ClientMessage {}

    /** One WebRTC negotiation step for another voice-enabled Player; {@code data} is opaque. */
    record VoiceSignal(int version, String type, String targetPlayerId, String kind, String data) implements ClientMessage {}

    /**
     * One encoded voice packet for peers the sender cannot reach directly. The server relays
     * it only to those of {@code targetPlayerIds} who may hear the sender right now.
     */
    record VoiceFrame(int version, String type, java.util.List<String> targetPlayerIds, String data) implements ClientMessage {}
}
