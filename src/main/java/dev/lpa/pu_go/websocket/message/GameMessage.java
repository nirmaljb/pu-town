package dev.lpa.pu_go.websocket.message;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class GameMessage {
    private String type;      // "join" | "move" | "chat"
    private String playerId;
    private String roomId;
    private String username;
    private Double x;
    private Double y;
    private String text;

    public GameMessage() {} // required by Jackson for deserialization

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getPlayerId() { return playerId; }
    public void setPlayerId(String playerId) { this.playerId = playerId; }
    public String getRoomId() { return roomId; }
    public void setRoomId(String roomId) { this.roomId = roomId; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public Double getX() { return x; }
    public void setX(Double x) { this.x = x; }
    public Double getY() { return y; }
    public void setY(Double y) { this.y = y; }
    public String getText() { return text; }
    public void setText(String text) { this.text = text; }
}