package dev.lpa.pu_go.avatar;

import dev.lpa.pu_go.room.Room;
import dev.lpa.pu_go.room.RoomManager;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;
import java.util.Locale;

/**
 * Serves a Room its pinned collection, artwork included. Clients fetch this on join,
 * because only then do they know which Room — and so which collection — they need.
 */
@RestController
@CrossOrigin(origins = "${putown.allowed-origins:http://localhost:5173,https://localhost:5173}")
public class AvatarCollectionController {
    private final RoomManager roomManager;

    public AvatarCollectionController(RoomManager roomManager) {
        this.roomManager = roomManager;
    }

    public record SpritePreset(String id, String name, String sprite, String seatedSprite) {}
    public record NativePreset(String id, String name, @JsonProperty("native") NativeAvatar nativeRepresentation) {}
    public record CollectionResponse(int version, String collectionId, List<?> presets) {}

    @GetMapping("/rooms/{roomCode}/avatars")
    public ResponseEntity<CollectionResponse> index(@PathVariable String roomCode,
                                                   @RequestParam(defaultValue = "1") int version) {
        if (version != 1 && version != 2) return ResponseEntity.badRequest().build();
        String code = roomCode.strip().toUpperCase(Locale.ROOT);
        Room room = roomManager.serialized(List.of(code), () -> roomManager.findRoom(code));
        if (room == null) return ResponseEntity.notFound().build();
        AvatarCollection collection = room.getAvatarCollection();
        if (version == 2) {
            if (collection.presets().stream().anyMatch(preset -> preset.nativeRepresentation() == null))
                return ResponseEntity.status(409).build();
            return ResponseEntity.ok(new CollectionResponse(2, collection.collectionId(), collection.presets().stream()
                    .map(preset -> new NativePreset(preset.id(), preset.name(), preset.nativeRepresentation())).toList()));
        }
        if (collection.presets().stream().anyMatch(preset -> preset.sprite() == null || preset.seatedSprite() == null))
            return ResponseEntity.status(409).build();
        return ResponseEntity.ok(new CollectionResponse(1, collection.collectionId(), collection.presets().stream()
                .map(preset -> new SpritePreset(preset.id(), preset.name(), preset.sprite(), preset.seatedSprite())).toList()));
    }
}
