package dev.lpa.pu_go.websocket.message;

public sealed interface ClientMessage permits ClientMessage.JoinRoom, ClientMessage.LeaveRoom, ClientMessage.MovePlayer {
    int version();
    String type();

    record JoinRoom(int version, String type, String roomId, String displayName) implements ClientMessage {}
    record LeaveRoom(int version, String type) implements ClientMessage {}
    record MovePlayer(int version, String type, double x, double y) implements ClientMessage {}
}
