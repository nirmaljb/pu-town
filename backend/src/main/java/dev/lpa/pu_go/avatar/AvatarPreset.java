package dev.lpa.pu_go.avatar;

/** One Player-selectable appearance, with the artwork clients render it from. */
public record AvatarPreset(String id, String name, String sprite, String seatedSprite, NativeAvatar nativeRepresentation) {
    /** Existing sprite publications and their callers remain supported during the native migration. */
    public AvatarPreset(String id, String name, String sprite, String seatedSprite) {
        this(id, name, sprite, seatedSprite, null);
    }
}
