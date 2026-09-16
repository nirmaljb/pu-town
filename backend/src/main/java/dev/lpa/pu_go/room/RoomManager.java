package dev.lpa.pu_go.room;

import dev.lpa.pu_go.avatar.AvatarCollections;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.Scheduled;
import java.security.SecureRandom;
import java.util.Collection;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

@Component
public class RoomManager {
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    // Stable striped locks survive removal/reuse of a code without retaining expired rooms.
    private final ReentrantLock[] locks = new ReentrantLock[256];
    private final SecureRandom random = new SecureRandom();
    private final LongSupplier milliseconds;
    private final AvatarCollections avatarCollections;

    @Autowired
    public RoomManager(AvatarCollections avatarCollections) { this(System::currentTimeMillis, avatarCollections); }

    public RoomManager(LongSupplier milliseconds, AvatarCollections avatarCollections) {
        this.milliseconds = milliseconds;
        this.avatarCollections = avatarCollections;
        for (int i = 0; i < locks.length; i++) locks[i] = new ReentrantLock();
    }

    public java.util.List<String> roomIdsSnapshot() { return java.util.List.copyOf(rooms.keySet()); }

    public long currentTimeMillis() { return milliseconds.getAsLong(); }

    public Room createRoom() {
        // Resolved once, before the code is settled, so every attempt pins the same collection.
        var collection = avatarCollections.current();
        while (true) {
            StringBuilder code = new StringBuilder();
            for (int i = 0; i < 6; i++) code.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
            String roomId = code.toString();
            Room created = serialized(java.util.List.of(roomId), () -> {
                Room room = new Room(roomId, collection);
                room.setEmptySince(milliseconds.getAsLong());
                return rooms.putIfAbsent(roomId, room) == null ? room : null;
            });
            if (created != null) return created;
        }
    }

    /** Called within serialized transitions. */
    public Room findRoom(String roomId) {
        Room room = rooms.get(roomId);
        if (room != null && room.playerIdsSnapshot().isEmpty()
                && milliseconds.getAsLong() - room.getEmptySince() >= 300_000) {
            rooms.remove(roomId, room);
            return null;
        }
        return room;
    }

    public void membershipEnded(Room room) {
        if (room.playerIdsSnapshot().isEmpty()) {
            if (room.getPhase().equals("playing")) rooms.remove(room.getRoomId(), room);
            else room.setEmptySince(milliseconds.getAsLong());
        }
    }

    @Scheduled(fixedDelay = 30_000)
    public void removeExpiredRooms() {
        for (String code : rooms.keySet()) serialized(java.util.List.of(code), () -> findRoom(code));
    }

    public <T> T serialized(Collection<String> roomIds, Supplier<T> transition) {
        var indices = roomIds.stream().filter(id -> id != null && !id.isBlank())
                .map(id -> (id.hashCode() & Integer.MAX_VALUE) % locks.length).distinct().sorted().toList();
        indices.forEach(index -> locks[index].lock());
        try { return transition.get(); }
        finally {
            for (int i = indices.size() - 1; i >= 0; i--) locks[indices.get(i)].unlock();
        }
    }
}
