package dev.lpa.pu_go.websocket.message;

public sealed interface ClientMessage permits ClientMessage.SetReady, ClientMessage.StartGame, ClientMessage.Ping, ClientMessage.CreateRoom, ClientMessage.JoinRoom, ClientMessage.LeaveRoom, ClientMessage.MovePlayer {
    int version();
    String type();

    record SetReady(int version, String type, boolean ready) implements ClientMessage {}
    record StartGame(int version, String type) implements ClientMessage {}
    record Ping(int version, String type) implements ClientMessage {}
    record CreateRoom(int version, String type, String displayName) implements ClientMessage {}
    record JoinRoom(int version, String type, String roomId, String displayName) implements ClientMessage {}
    record LeaveRoom(int version, String type) implements ClientMessage {}
    record MovePlayer(int version, String type, double x, double y) implements ClientMessage {}
}
