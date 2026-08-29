package dev.lpa.pu_go.room;

import dev.lpa.pu_go.player.PlayerState;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

public class Room {
    private final String roomId;
    private final Set<String> playerIds = ConcurrentHashMap.newKeySet();

    public Room(String roomId) { this.roomId = roomId; }

    public String getRoomId() { return roomId; }
    public Set<String> getPlayerIds() { return playerIds; }
    public void addPlayer(String playerId) { playerIds.add(playerId); }
    public void removePlayer(String playerId) { playerIds.remove(playerId); }
}
