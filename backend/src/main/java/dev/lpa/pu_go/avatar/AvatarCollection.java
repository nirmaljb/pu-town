package dev.lpa.pu_go.avatar;

import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

/**
 * A resolved Published Avatar Collection. A Room pins one at creation and keeps it for
 * its whole life, so Publishing never alters what a running Room offers or accepts.
 */
public record AvatarCollection(String collectionId, List<AvatarPreset> presets) {
    public AvatarCollection {
        presets = List.copyOf(presets);
    }

    public List<String> ids() {
        return presets.stream().map(AvatarPreset::id).toList();
    }

    public boolean contains(String avatarPreset) {
        return presets.stream().anyMatch(preset -> preset.id().equals(avatarPreset));
    }

    /** Assignment for a new Room Membership. Duplicates within a Room are allowed. */
    public String randomId() {
        return presets.get(ThreadLocalRandom.current().nextInt(presets.size())).id();
    }
}
