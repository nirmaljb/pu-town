package dev.lpa.pu_go.player;

import org.springframework.web.socket.WebSocketSession;

public class PlayerState {
    private final String playerId;
    private final WebSocketSession session;
    private String username;
    private String roomId;
    private double x;
    private double y;

    public PlayerState(String playerId, WebSocketSession session) {
        this.playerId = playerId;
        this.session = session;
    }

    public String getId() { return playerId; }
    public WebSocketSession getSession() { return session; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getRoomId() { return roomId; }
    public void setRoomId(String roomId) { this.roomId = roomId; }
    public double getX() { return x; }
    public void setX(double x) { this.x = x; }
    public double getY() { return y; }
    public void setY(double y) { this.y = y; }
}
