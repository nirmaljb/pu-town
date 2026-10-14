package dev.lpa.pu_go.avatar;

import dev.lpa.pu_go.room.RoomManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HexFormat;

import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class NativeAvatarPublicationTest {
    // Manifest validation fixture only; real prefab/rig/clip acceptance is a Unity runtime check.
    private static final byte[] BUNDLE = "UnityFS\0manifest-test-fixture".getBytes(StandardCharsets.UTF_8);

    static String preset(String id, String name) throws Exception {
        String digest = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(BUNDLE));
        String data = Base64.getEncoder().encodeToString(BUNDLE);
        String platformAsset = "{\"platform\":\"%s\",\"format\":\"unity-assetbundle\",\"unityVersion\":\"6000.6.0f1\","
                + "\"assetName\":\"assets/avatars/" + id + ".prefab\",\"sha256\":\"" + digest + "\","
                + "\"byteLength\":" + BUNDLE.length + ",\"data\":\"" + data + "\"}";
        return """
                {"id":"%s","name":"%s","native":{
                  "version":1,"masterId":"campus-base","masterRevision":1,
                  "model":{"sourceSha256":"%s","rootNode":"Avatar","heightMetres":1.7,"pivot":"feet","forwardAxis":"+z"},
                  "rig":{"type":"humanoid","avatarName":"CampusHumanoid","hipsBone":"Hips"},
                  "animations":{
                    "standing":{"clipName":"Standing","durationSeconds":2.0,"loop":true},
                    "walking":{"clipName":"Walking","durationSeconds":1.0,"loop":true},
                    "seated":{"clipName":"Seated","durationSeconds":2.0,"loop":true}
                  },
                  "platformAssets":[%s,%s]
                }}
                """.formatted(id, name, "a".repeat(64), platformAsset.formatted("windows-x86_64"), platformAsset.formatted("macos-universal"));
    }

    static Path publish(Path file, String... presets) throws Exception {
        Files.writeString(file, "{\"version\":2,\"presets\":[" + String.join(",", presets) + "]}");
        Files.setLastModifiedTime(file, java.nio.file.attribute.FileTime.fromMillis(System.nanoTime()));
        return file;
    }

    @Test
    void nativeRoomsServeTheirCompletePlatformAssetsAndPinThePublishedCollection(@TempDir Path directory) throws Exception {
        Path file = publish(directory.resolve("collection.json"), preset("campus-rowan", "Rowan"));
        RoomManager rooms = new RoomManager(() -> 0L, new PublishedAvatars(file));
        String first = rooms.createRoom().getRoomId();
        MockMvc http = MockMvcBuilders.standaloneSetup(new AvatarCollectionController(rooms)).build();
        String firstCollectionId = http.perform(get("/rooms/" + first + "/avatars?version=2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.presets[0].native.version").value(1))
                .andExpect(jsonPath("$.presets[0].native.rig.type").value("humanoid"))
                .andExpect(jsonPath("$.presets[0].native.animations.walking.clipName").value("Walking"))
                .andExpect(jsonPath("$.presets[0].native.platformAssets[0].platform").value("windows-x86_64"))
                .andExpect(jsonPath("$.presets[0].native.platformAssets[1].platform").value("macos-universal"))
                .andExpect(jsonPath("$.presets[0].native.platformAssets[0].data").value(Base64.getEncoder().encodeToString(BUNDLE)))
                .andExpect(jsonPath("$.presets[0].sprite").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        publish(file, preset("campus-mira", "Mira"));
        String second = rooms.createRoom().getRoomId();
        http.perform(get("/rooms/" + first + "/avatars?version=2"))
                .andExpect(result -> org.junit.jupiter.api.Assertions.assertEquals(firstCollectionId, result.getResponse().getContentAsString()));
        http.perform(get("/rooms/" + second + "/avatars?version=2"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.presets[0].id").value("campus-mira"));
        // A sprite consumer receives an explicit incompatibility instead of incomplete sprite data.
        http.perform(get("/rooms/" + first + "/avatars")).andExpect(status().isConflict());
    }

    @Test
    void atomicPublicationReplacementIsVisibleEvenWithTheSameSizeAndTimestamp(@TempDir Path directory) throws Exception {
        Path file = publish(directory.resolve("collection.json"), preset("campus-rowan", "Rowan"));
        RoomManager rooms = new RoomManager(() -> 0L, new PublishedAvatars(file));
        String first = rooms.createRoom().getRoomId();
        var timestamp = Files.getLastModifiedTime(file);
        Path replacement = publish(directory.resolve("replacement.json"), preset("campus-rowan", "Miraa"));
        org.junit.jupiter.api.Assertions.assertEquals(Files.size(file), Files.size(replacement));
        Files.setLastModifiedTime(replacement, timestamp);
        Files.move(replacement, file, java.nio.file.StandardCopyOption.ATOMIC_MOVE, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        String second = rooms.createRoom().getRoomId();
        MockMvc http = MockMvcBuilders.standaloneSetup(new AvatarCollectionController(rooms)).build();
        http.perform(get("/rooms/" + first + "/avatars?version=2"))
                .andExpect(jsonPath("$.presets[0].name").value("Rowan"));
        http.perform(get("/rooms/" + second + "/avatars?version=2"))
                .andExpect(jsonPath("$.presets[0].name").value("Miraa"));
    }

    @Test
    void malformedOrIncompleteNativePublicationRetainsTheLastGoodCollectionAndFailsColdStart(@TempDir Path directory) throws Exception {
        String complete = "{\"version\":2,\"presets\":[" + preset("campus-rowan", "Rowan") + "]}";
        Path file = directory.resolve("collection.json");
        Files.writeString(file, complete);
        PublishedAvatars published = new PublishedAvatars(file);
        RoomManager rooms = new RoomManager(() -> 0L, published);
        String first = rooms.createRoom().getRoomId();
        MockMvc http = MockMvcBuilders.standaloneSetup(new AvatarCollectionController(rooms)).build();
        String expected = http.perform(get("/rooms/" + first + "/avatars?version=2"))
                .andReturn().getResponse().getContentAsString();
        for (String invalid : java.util.List.of(
                "{ not json",
                complete.replace("\"version\":2", "\"version\":4294967298"),
                complete.replace("\"version\":1,\"masterId\"", "\"version\":4294967297,\"masterId\""),
                complete.replace("\"masterRevision\":1", "\"masterRevision\":18446744073709551617"),
                complete.replace("\"masterRevision\":1", "\"masterRevision\":0"),
                complete.replace("\"heightMetres\":1.7", "\"heightMetres\":\"1.7\""),
                complete.replace("\"heightMetres\":1.7", "\"heightMetres\":0"),
                complete.replace("\"pivot\":\"feet\"", "\"pivot\":\"centre\""),
                complete.replace("\"hipsBone\":\"Hips\"", "\"hipsBone\":\"\""),
                complete.replace("\"durationSeconds\":1.0", "\"durationSeconds\":-1.0"),
                complete.replace("\"loop\":true", "\"loop\":false"),
                complete.replace("\"platform\":\"macos-universal\"", "\"platform\":\"windows-x86_64\""),
                complete.replace("\"unityVersion\":\"6000.6.0f1\"", "\"unityVersion\":\"unknown\""),
                complete.replace("\"byteLength\":" + BUNDLE.length, "\"byteLength\":8"),
                complete.replace(Base64.getEncoder().encodeToString(BUNDLE), "bm90LWFzLWFzc2V0YnVuZGxl"),
                complete.replace("\"rootNode\":\"Avatar\"", "\"rootNode\":\"Avatar\",\"unknown\":true"),
                "{\"version\":2,\"presets\":[" + preset("campus-rowan", "Rowan") + "," + preset("campus-rowan", "Mira") + "]}")) {
            Files.writeString(file, invalid);
            Files.setLastModifiedTime(file, java.nio.file.attribute.FileTime.fromMillis(System.nanoTime()));
            org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class,
                    () -> new PublishedAvatars(file).current(), invalid);
            String next = rooms.createRoom().getRoomId();
            http.perform(get("/rooms/" + next + "/avatars?version=2"))
                    .andExpect(status().isOk())
                    .andExpect(result -> org.junit.jupiter.api.Assertions.assertEquals(expected, result.getResponse().getContentAsString()));
        }
    }

    @Test
    void aDualRepresentationKeepsTheExistingSpriteContractAndNativeIdentity(@TempDir Path directory) throws Exception {
        String sprite = "data:image/png;base64,iVBORw0KGgo=";
        String dual = preset("campus-rowan", "Rowan").replace("\"native\":", "\"sprite\":\"" + sprite
                + "\",\"seatedSprite\":\"" + sprite + "\",\"native\":");
        Path file = publish(directory.resolve("collection.json"), dual);
        RoomManager rooms = new RoomManager(() -> 0L, new PublishedAvatars(file));
        String code = rooms.createRoom().getRoomId();
        MockMvc http = MockMvcBuilders.standaloneSetup(new AvatarCollectionController(rooms)).build();
        http.perform(get("/rooms/" + code + "/avatars"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.presets[0].sprite").value(sprite))
                .andExpect(jsonPath("$.presets[0].native").doesNotExist())
                .andExpect(jsonPath("$.presets[0].nativeRepresentation").doesNotExist());
        http.perform(get("/rooms/" + code + "/avatars?version=2"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.presets[0].id").value("campus-rowan"))
                .andExpect(jsonPath("$.presets[0].sprite").doesNotExist())
                .andExpect(jsonPath("$.presets[0].native.masterId").value("campus-base"));
        http.perform(get("/rooms/" + code + "/avatars?version=3")).andExpect(status().isBadRequest());

        Path legacy = directory.resolve("legacy.json");
        java.nio.file.Files.writeString(legacy, "{\"version\":1,\"presets\":[{\"id\":\"legacy\",\"name\":\"Legacy\",\"sprite\":\"" + sprite
                + "\",\"seatedSprite\":\"" + sprite + "\"}]}");
        RoomManager old = new RoomManager(() -> 0L, new PublishedAvatars(legacy));
        String oldCode = old.createRoom().getRoomId();
        MockMvc oldHttp = MockMvcBuilders.standaloneSetup(new AvatarCollectionController(old)).build();
        oldHttp.perform(get("/rooms/" + oldCode + "/avatars")).andExpect(status().isOk());
        oldHttp.perform(get("/rooms/" + oldCode + "/avatars?version=2")).andExpect(status().isConflict());
    }

    @Test
    void theAuthoredKayKitPublicationLoadsAllFiveDesignsThroughTheRoomCollectionBoundary() throws Exception {
        assumeTrue("1".equals(System.getenv("PU_TOWN_NATIVE_AVATAR_E2E")),
                "Set PU_TOWN_NATIVE_AVATAR_E2E=1 after restoring or generating the local native Avatar publication.");
        RoomManager rooms = new RoomManager(() -> 0L,
                new PublishedAvatars(Path.of("../towns/assets/avatars/publication.json")));
        String code = rooms.createRoom().getRoomId();
        MockMvc http = MockMvcBuilders.standaloneSetup(new AvatarCollectionController(rooms)).build();
        String body = http.perform(get("/rooms/" + code + "/avatars?version=2"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        var collection = new tools.jackson.databind.ObjectMapper().readTree(body);
        assertEquals(2, collection.path("version").asInt());
        var ids = java.util.List.of("kaykit-barbarian", "kaykit-knight", "kaykit-mage", "kaykit-ranger", "kaykit-rogue");
        assertEquals(ids, collection.path("presets").valueStream().map(preset -> preset.path("id").asText()).toList());
        for (var preset : collection.path("presets")) {
            var representation = preset.path("native");
            assertEquals("avatar", representation.path("model").path("rootNode").asText());
            assertEquals("humanoid", representation.path("rig").path("type").asText());
            assertEquals("hips", representation.path("rig").path("hipsBone").asText());
            assertEquals("Standing", representation.path("animations").path("standing").path("clipName").asText());
            assertEquals("Walking", representation.path("animations").path("walking").path("clipName").asText());
            assertEquals("Seated", representation.path("animations").path("seated").path("clipName").asText());
        }
    }
}
