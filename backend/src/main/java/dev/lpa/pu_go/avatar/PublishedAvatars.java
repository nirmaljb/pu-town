package dev.lpa.pu_go.avatar;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Reads the publication file the authoring tool writes. Rooms resolve a collection here
 * when they are created, so Publishing reaches the next Room without a rebuild or restart.
 */
@Component
public class PublishedAvatars implements AvatarCollections {
    private static final Pattern PRESET_ID = Pattern.compile("[a-z0-9][a-z0-9-]{0,63}");
    private static final String ARTWORK_PREFIX = "data:image/png;base64,";
    private final Path publication;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private AvatarCollection collection;
    private long loadedFrom = -1;
    private long loadedSize = -1;

    public PublishedAvatars(@Value("${putown.avatars.publication:data/published-avatars.json}") Path publication) {
        this.publication = publication;
    }

    /** A publication that cannot be read is a startup failure, not a first-Room surprise. */
    @PostConstruct
    void requireReadablePublication() {
        current();
    }

    @Override
    public synchronized AvatarCollection current() {
        try {
            long modified = Files.getLastModifiedTime(publication).toMillis();
            long size = Files.size(publication);
            if (collection == null || modified != loadedFrom || size != loadedSize) {
                collection = read(Files.readAllBytes(publication));
                loadedFrom = modified;
                loadedSize = size;
            }
        } catch (Exception exception) {
            // A running game keeps serving the last good collection; only a cold start fails.
            if (collection == null)
                throw new IllegalStateException("Cannot load published Avatar Collection from " + publication, exception);
        }
        return collection;
    }

    private AvatarCollection read(byte[] published) {
        JsonNode document = objectMapper.readTree(published);
        JsonNode presets = document.path("presets");
        if (document.path("version").asInt() != 1 || !presets.isArray() || presets.isEmpty())
            throw new IllegalStateException("Publish at least one Avatar Preset");
        List<AvatarPreset> collected = new ArrayList<>();
        for (JsonNode preset : presets) {
            String id = preset.path("id").asText();
            String name = preset.path("name").asText();
            String sprite = preset.path("sprite").asText();
            String seatedSprite = preset.path("seatedSprite").asText();
            // Names are counted in code points, as Display Names are.
            if (!PRESET_ID.matcher(id).matches() || name.isBlank()
                    || name.codePointCount(0, name.length()) > 24
                    || !sprite.startsWith(ARTWORK_PREFIX) || !seatedSprite.startsWith(ARTWORK_PREFIX))
                throw new IllegalStateException("Incomplete published Avatar Preset: " + id);
            collected.add(new AvatarPreset(id, name, sprite, seatedSprite));
        }
        if (new HashSet<>(collected.stream().map(AvatarPreset::id).toList()).size() != collected.size())
            throw new IllegalStateException("Duplicate published Avatar Preset");
        return new AvatarCollection(identify(published), collected);
    }

    /** Content-derived, so a Room's pinned collection is nameable without a release counter. */
    private static String identify(byte[] published) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(published);
            return HexFormat.of().formatHex(digest, 0, 8);
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
