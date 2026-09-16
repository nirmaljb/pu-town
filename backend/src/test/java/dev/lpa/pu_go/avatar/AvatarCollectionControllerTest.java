package dev.lpa.pu_go.avatar;

import dev.lpa.pu_go.room.Room;
import dev.lpa.pu_go.room.RoomManager;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AvatarCollectionControllerTest {
    private final AtomicReference<AvatarCollection> published =
            new AtomicReference<>(collection("aaaa1111", "townsperson-1", "townsperson-2"));
    private final RoomManager roomManager = new RoomManager(() -> 0L, published::get);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new AvatarCollectionController(roomManager)).build();

    static AvatarCollection collection(String collectionId, String... presetIds) {
        String artwork = "data:image/png;base64,iVBORw0KGgo=";
        return new AvatarCollection(collectionId, java.util.Arrays.stream(presetIds)
                .map(id -> new AvatarPreset(id, "Name " + id, artwork, artwork)).toList());
    }

    @Test
    void servesTheCollectionARoomPinnedRatherThanTheCurrentPublication() throws Exception {
        Room pinnedFirst = roomManager.createRoom();
        published.set(collection("bbbb2222", "townsperson-3"));
        Room pinnedSecond = roomManager.createRoom();

        mvc.perform(get("/rooms/" + pinnedFirst.getRoomId() + "/avatars"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.collectionId").value("aaaa1111"))
                .andExpect(jsonPath("$.presets.length()").value(2))
                .andExpect(jsonPath("$.presets[0].id").value("townsperson-1"))
                .andExpect(jsonPath("$.presets[0].name").value("Name townsperson-1"))
                .andExpect(jsonPath("$.presets[0].sprite").value("data:image/png;base64,iVBORw0KGgo="))
                .andExpect(jsonPath("$.presets[0].seatedSprite").value("data:image/png;base64,iVBORw0KGgo="));
        mvc.perform(get("/rooms/" + pinnedSecond.getRoomId() + "/avatars"))
                .andExpect(jsonPath("$.collectionId").value("bbbb2222"))
                .andExpect(jsonPath("$.presets[0].id").value("townsperson-3"));
    }

    @Test
    void unknownAndExpiredRoomCodesCarryNoCollection() throws Exception {
        mvc.perform(get("/rooms/ZZZZZZ/avatars")).andExpect(status().isNotFound());
        AtomicReference<Long> clock = new AtomicReference<>(0L);
        RoomManager expiring = new RoomManager(clock::get, published::get);
        MockMvc expiringMvc = MockMvcBuilders.standaloneSetup(new AvatarCollectionController(expiring)).build();
        String code = expiring.createRoom().getRoomId();
        expiringMvc.perform(get("/rooms/" + code + "/avatars")).andExpect(status().isOk());
        clock.set(300_000L);
        expiringMvc.perform(get("/rooms/" + code + "/avatars")).andExpect(status().isNotFound());
    }

    @Test
    void roomCodesAreMatchedTheWayJoinMatchesThem() throws Exception {
        String code = roomManager.createRoom().getRoomId();
        mvc.perform(get("/rooms/" + code.toLowerCase() + "/avatars"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.presets.length()").value(2));
    }

}
