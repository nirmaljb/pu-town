package dev.lpa.pu_go.avatar;

/** One Player-selectable appearance, with the artwork clients render it from. */
public record AvatarPreset(String id, String name, String sprite, String seatedSprite) {}
