package dev.lpa.pu_go.avatar;

import dev.lpa.pu_go.room.Room;
import dev.lpa.pu_go.room.RoomManager;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Locale;

/**
 * Serves a Room its pinned collection, artwork included. Clients fetch this on join,
 * because only then do they know which Room — and so which collection — they need.
 */
@RestController
@CrossOrigin(origins = {"http://localhost:5173", "https://localhost:5173"})
public class AvatarCollectionController {
    private final RoomManager roomManager;

    public AvatarCollectionController(RoomManager roomManager) {
        this.roomManager = roomManager;
    }

    public record CollectionResponse(int version, String collectionId, List<AvatarPreset> presets) {}

    @GetMapping("/rooms/{roomCode}/avatars")
    public ResponseEntity<CollectionResponse> index(@PathVariable String roomCode) {
        String code = roomCode.strip().toUpperCase(Locale.ROOT);
        Room room = roomManager.serialized(List.of(code), () -> roomManager.findRoom(code));
        if (room == null) return ResponseEntity.notFound().build();
        AvatarCollection collection = room.getAvatarCollection();
        return ResponseEntity.ok(new CollectionResponse(1, collection.collectionId(), collection.presets()));
    }
}
