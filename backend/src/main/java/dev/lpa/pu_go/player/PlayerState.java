package dev.lpa.pu_go.player;

import org.springframework.web.socket.WebSocketSession;

public class PlayerState {
    private final String playerId;
    private WebSocketSession session;
    private String recoveryToken;
    private Long disconnectedUntil;
    public void setSession(WebSocketSession value) { session = value; }
    public String getRecoveryToken() { return recoveryToken; }
    public void setRecoveryToken(String value) { recoveryToken = value; }
    public Long getDisconnectedUntil() { return disconnectedUntil; }
    public void setDisconnectedUntil(Long value) { disconnectedUntil = value; }
    public boolean isConnected() { return disconnectedUntil == null; }
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
    // A Seat is taken on joining and held until the Membership ends, Game included.
    private int seat;
    public int getSeat() { return seat; }
    public void setSeat(int value) { seat = value; }
    private String roomId;
    private double x;
    private double y;
    private String facing = "down";
    public String getFacing() { return facing; }
    public void setFacing(String value) { facing = value; }

    // Voice belongs to one connection: a Reconnect or a new Membership starts without it.
    private boolean voiceEnabled;
    // The routes this connection was last sent, so unchanged routes are not sent again.
    private java.util.List<?> lastVoiceRoutes;
    public boolean isVoiceEnabled() { return voiceEnabled; }
    public java.util.List<?> getLastVoiceRoutes() { return lastVoiceRoutes; }
    public void setLastVoiceRoutes(java.util.List<?> value) { lastVoiceRoutes = value; }
    public void setVoiceEnabled(boolean value) {
        voiceEnabled = value;
        lastVoiceRoutes = null;
    }

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
}
