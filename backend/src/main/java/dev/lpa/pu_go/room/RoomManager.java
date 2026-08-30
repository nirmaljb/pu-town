package dev.lpa.pu_go.room;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RoomManager {
    private final Map<String, Room> rooms = new ConcurrentHashMap<>();

    public Room getOrCreateRoom(String roomId) {
        return rooms.computeIfAbsent(roomId, Room::new);
    }

    public void removePlayerFromRoom(String roomId, String playerId) {
        Room room = rooms.get(roomId);
        if (room != null) {
            room.removePlayer(playerId);
            if (room.getPlayerIds().isEmpty()) rooms.remove(roomId);
        }
    }
}
