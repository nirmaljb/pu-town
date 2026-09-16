package dev.lpa.pu_go.player;

import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

/** Loaded once at startup from the same release artifact bundled by the frontend. */
public final class PublishedAvatars {
    public static final List<String> IDS = load();

    private PublishedAvatars() {}

    private static List<String> load() {
        try (var stream = PublishedAvatars.class.getResourceAsStream("/published-avatars.json")) {
            if (stream == null) throw new IllegalStateException("Missing published Avatar Collection");
            var collection = new ObjectMapper().readTree(stream);
            var presets = collection.path("presets");
            if (collection.path("version").asInt() != 1 || !presets.isArray() || presets.size() != 10)
                throw new IllegalStateException("Publish exactly ten Avatar Presets before building");
            var ids = new ArrayList<String>();
            for (var preset : presets) {
                String id = preset.path("id").asText();
                if (!id.matches("[a-z0-9][a-z0-9-]{0,63}") || preset.path("name").asText().isBlank()
                        || !preset.path("sprite").asText().startsWith("data:image/png;base64,")
                        || !preset.path("seatedSprite").asText().startsWith("data:image/png;base64,"))
                    throw new IllegalStateException("Incomplete published Avatar Preset: " + id);
                ids.add(id);
            }
            if (new HashSet<>(ids).size() != 10) throw new IllegalStateException("Duplicate published Avatar Preset");
            return List.copyOf(ids);
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot load published Avatar Collection", exception);
        }
    }
}
