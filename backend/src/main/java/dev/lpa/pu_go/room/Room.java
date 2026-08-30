package dev.lpa.pu_go.room;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.locks.ReentrantLock;

public class Room {
    private final String roomId;
    private final Set<String> playerIds = new LinkedHashSet<>();
    private final ReentrantLock lock = new ReentrantLock();

    public Room(String roomId) { this.roomId = roomId; }

    public String getRoomId() { return roomId; }
    public List<String> playerIdsSnapshot() { return List.copyOf(playerIds); }
    public void addPlayer(String playerId) { playerIds.add(playerId); }
    public void removePlayer(String playerId) { playerIds.remove(playerId); }
    public boolean containsPlayer(String playerId) { return playerIds.contains(playerId); }
    ReentrantLock lock() { return lock; }
}
