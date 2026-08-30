package dev.lpa.pu_go.room;

import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

@Component
public class RoomManager {
    private final Map<String, Room> rooms = new ConcurrentHashMap<>();

    public Room getOrCreateRoom(String roomId) {
        return rooms.computeIfAbsent(roomId, Room::new);
    }

    public <T> T serialized(Collection<String> roomIds, Supplier<T> transition) {
        List<Room> lockedRooms = roomIds.stream()
                .filter(roomId -> roomId != null && !roomId.isBlank())
                .distinct()
                .sorted(Comparator.naturalOrder())
                .map(this::getOrCreateRoom)
                .toList();
        lockedRooms.forEach(room -> room.lock().lock());
        try {
            return transition.get();
        } finally {
            for (int index = lockedRooms.size() - 1; index >= 0; index--) {
                lockedRooms.get(index).lock().unlock();
            }
        }
    }
}
