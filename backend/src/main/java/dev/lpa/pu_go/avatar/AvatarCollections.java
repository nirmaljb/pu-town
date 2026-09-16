package dev.lpa.pu_go.avatar;

/** The source a Room resolves its collection from, once, when it is created. */
@FunctionalInterface
public interface AvatarCollections {
    AvatarCollection current();
}
