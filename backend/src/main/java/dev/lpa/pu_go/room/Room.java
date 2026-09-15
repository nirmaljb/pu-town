package dev.lpa.pu_go.room;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

public class Room {
    private final String roomId;
    private String phase = "lobby";
    private String hostPlayerId;
    public void setHostPlayerId(String value) { hostPlayerId = value; }
    public String getPhase() { return phase; }
    public String getHostPlayerId() { return hostPlayerId; }
    public void startGame() { phase = "playing"; }
    private long emptySince;
    public long getEmptySince() { return emptySince; }
    public void setEmptySince(long value) { emptySince = value; }
    private final Set<String> playerIds = new LinkedHashSet<>();

    public Room(String roomId) { this.roomId = roomId; }

    public String getRoomId() { return roomId; }
    public List<String> playerIdsSnapshot() { return List.copyOf(playerIds); }
    public void addPlayer(String playerId) { playerIds.add(playerId); if (hostPlayerId == null) hostPlayerId = playerId; }
    public void removePlayer(String playerId) {
        playerIds.remove(playerId);
        if (playerId.equals(hostPlayerId)) hostPlayerId = playerIds.stream().findFirst().orElse(null);
    }
    public boolean containsPlayer(String playerId) { return playerIds.contains(playerId); }
}
