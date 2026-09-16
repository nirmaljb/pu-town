package dev.lpa.pu_go.avatar;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PublishedAvatarsTest {
    private static final String ARTWORK = "data:image/png;base64,iVBORw0KGgo=";

    private static String publication(String... presets) {
        return "{\"version\":1,\"presets\":[" + String.join(",", presets) + "]}";
    }

    private static String preset(String id, String name) {
        return "{\"id\":\"" + id + "\",\"name\":\"" + name + "\",\"sprite\":\"" + ARTWORK
                + "\",\"seatedSprite\":\"" + ARTWORK + "\"}";
    }

    private static Path write(Path file, String contents) throws Exception {
        Files.writeString(file, contents);
        // Publication reload is detected by modification time; tests replace files within a tick.
        Files.setLastModifiedTime(file, java.nio.file.attribute.FileTime.fromMillis(System.nanoTime()));
        return file;
    }

    @Test
    void publishingIsPickedUpWithoutRestartAndIdentifiesTheCollectionByContent(@org.junit.jupiter.api.io.TempDir Path directory) throws Exception {
        Path file = write(directory.resolve("published-avatars.json"), publication(preset("townsperson-1", "Rowan")));
        PublishedAvatars avatars = new PublishedAvatars(file);

        AvatarCollection first = avatars.current();
        assertEquals(List.of("townsperson-1"), first.ids());
        assertEquals(first.collectionId(), avatars.current().collectionId());
        assertTrue(first.contains("townsperson-1"));
        assertFalse(first.contains("unpublished-draft"));

        write(file, publication(preset("townsperson-1", "Rowan"), preset("townsperson-2", "Mira")));
        AvatarCollection republished = avatars.current();
        assertEquals(List.of("townsperson-1", "townsperson-2"), republished.ids());
        assertNotEquals(first.collectionId(), republished.collectionId());
        for (int attempt = 0; attempt < 50; attempt++)
            assertTrue(republished.ids().contains(republished.randomId()));
    }

    @Test
    void oneCompletePresetIsEnoughAndThereIsNoUpperBound(@org.junit.jupiter.api.io.TempDir Path directory) throws Exception {
        String[] many = new String[25];
        for (int index = 0; index < many.length; index++) many[index] = preset("townsperson-" + (index + 1), "Name " + index);
        Path file = write(directory.resolve("published-avatars.json"), publication(many));
        assertEquals(25, new PublishedAvatars(file).current().presets().size());
    }

    @Test
    void incompleteOrEmptyPublicationsAreARefusalNotAHalfLoadedCollection(@org.junit.jupiter.api.io.TempDir Path directory) throws Exception {
        for (String refused : List.of(
                publication(),
                "{\"version\":2,\"presets\":[" + preset("townsperson-1", "Rowan") + "]}",
                publication(preset("Townsperson 1", "Rowan")),
                publication(preset("townsperson-1", " ")),
                publication(preset("townsperson-1", "N".repeat(25))),
                publication(preset("townsperson-1", "\uD83D\uDE00".repeat(25))),
                publication("{\"id\":\"townsperson-1\",\"name\":\"Rowan\",\"sprite\":\"/assets/rowan.png\",\"seatedSprite\":\"" + ARTWORK + "\"}"),
                publication("{\"id\":\"townsperson-1\",\"name\":\"Rowan\",\"sprite\":\"" + ARTWORK + "\"}"),
                publication(preset("townsperson-1", "Rowan"), preset("townsperson-1", "Mira")))) {
            Path file = write(directory.resolve("refused.json"), refused);
            assertThrows(IllegalStateException.class, () -> new PublishedAvatars(file).current(), refused);
        }
        assertThrows(IllegalStateException.class, () -> new PublishedAvatars(directory.resolve("absent.json")).current());
    }

    @Test
    void namesAreBoundedInCodePointsAsDisplayNamesAre(@org.junit.jupiter.api.io.TempDir Path directory) throws Exception {
        // The authoring tool counts Python code points, so a 24-emoji name it accepts must load here.
        String name = "\uD83D\uDE00".repeat(24);
        Path file = write(directory.resolve("published-avatars.json"), publication(preset("townsperson-1", name)));
        assertEquals(name, new PublishedAvatars(file).current().presets().get(0).name());
    }

    @Test
    void aRunningGameKeepsTheLastGoodCollectionWhenPublicationBreaks(@org.junit.jupiter.api.io.TempDir Path directory) throws Exception {
        Path file = write(directory.resolve("published-avatars.json"), publication(preset("townsperson-1", "Rowan")));
        PublishedAvatars avatars = new PublishedAvatars(file);
        AvatarCollection loaded = avatars.current();
        write(file, "{ not json");
        assertEquals(loaded, avatars.current());
        Files.delete(file);
        assertEquals(loaded, avatars.current());
    }

    @Test
    void theShippedPublicationLoadsFromItsConfiguredDefaultLocation() {
        AvatarCollection shipped = new PublishedAvatars(Path.of("data/published-avatars.json")).current();
        assertFalse(shipped.presets().isEmpty());
        assertEquals(shipped.presets().size(), shipped.ids().stream().distinct().count());
    }
}
