package dev.lpa.pu_go.player;

import org.springframework.web.socket.WebSocketSession;

public class PlayerState {
    private final String playerId;
    private final WebSocketSession session;
    private String displayName;
    private String colour;
    private String avatarPreset;
    public String getAvatarPreset() { return avatarPreset; }
    public void setAvatarPreset(String value) { avatarPreset = value; }
    public String getColour() { return colour; }
    public void setColour(String value) { colour = value; }
    private boolean ready;
    public boolean isReady() { return ready; }
    public void setReady(boolean value) { ready = value; }
    private Integer seat;
    public Integer getSeat() { return seat; }
    public void setSeat(Integer value) { seat = value; }
    private String roomId;
    private double x;
    private double y;
    private long lastAcceptedMovementNanos;

    public PlayerState(String playerId, WebSocketSession session) {
        this.playerId = playerId;
        this.session = session;
    }

    public String getId() { return playerId; }
    public WebSocketSession getSession() { return session; }
    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
    public String getRoomId() { return roomId; }
    public void setRoomId(String roomId) { this.roomId = roomId; }
    public double getX() { return x; }
    public void setX(double x) { this.x = x; }
    public double getY() { return y; }
    public void setY(double y) { this.y = y; }
    public long getLastAcceptedMovementNanos() { return lastAcceptedMovementNanos; }
    public void setLastAcceptedMovementNanos(long lastAcceptedMovementNanos) {
        this.lastAcceptedMovementNanos = lastAcceptedMovementNanos;
    }
}
