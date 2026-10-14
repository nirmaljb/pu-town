package dev.lpa.pu_go.room;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

class RoomRulesTest {
    /** The map the client draws; its collision layer is the one the server enforces. */
    private static final Path COLLISION = Path.of("..", "frontend", "public", "maps", "pu-town", "pu-town.collision.json");

    @Test
    void theTownMatchesTheMapTheClientDraws() {
        JsonNode map = new ObjectMapper().readTree(COLLISION.toFile());
        assertEquals(RoomRules.WIDTH, map.path("world").path("width").asDouble());
        assertEquals(RoomRules.HEIGHT, map.path("world").path("height").asDouble());
        assertEquals(RoomRules.BUTTON_X, map.path("emergencyButton").path("x").asDouble());
        assertEquals(RoomRules.BUTTON_Y, map.path("emergencyButton").path("y").asDouble());
        List<RoomRules.Obstacle> obstacles = new ArrayList<>();
        for (JsonNode o : map.path("obstacles")) {
            obstacles.add(new RoomRules.Obstacle(o.path("x").asDouble(), o.path("y").asDouble(),
                    o.path("width").asDouble(), o.path("height").asDouble()));
        }
        assertEquals(obstacles, RoomRules.OBSTACLES);
        JsonNode town = new ObjectMapper().readTree(Path.of("..", "frontend", "public", "maps", "pu-town", "pu-town.json").toFile());
        List<RoomRules.Interior> interiors = new ArrayList<>();
        for (JsonNode layer : town.path("layers")) if (layer.path("name").asText().equals("zones")) {
            for (JsonNode room : layer.path("objects")) if (room.path("type").asText().equals("room"))
                interiors.add(new RoomRules.Interior(room.path("name").asText(), room.path("x").asDouble(),
                        room.path("y").asDouble(), room.path("width").asDouble(), room.path("height").asDouble()));
        }
        assertEquals(interiors, RoomRules.INTERIORS);
    }

    @Test
    void indexedCollisionMatchesTheCompleteGeometryAtEdgesAndAcrossTheTown() {
        var random = new java.util.Random(42);
        for (int sample = 0; sample < 3000; sample++) {
            double x = random.nextDouble() * RoomRules.WIDTH;
            double y = random.nextDouble() * RoomRules.HEIGHT;
            boolean expected = x >= RoomRules.FOOT_RADIUS && y >= RoomRules.FOOT_RADIUS
                    && x <= RoomRules.WIDTH - RoomRules.FOOT_RADIUS && y <= RoomRules.HEIGHT - RoomRules.FOOT_RADIUS
                    && RoomRules.OBSTACLES.stream().noneMatch(o -> o.blocks(x, y, RoomRules.FOOT_RADIUS));
            assertEquals(expected, RoomRules.walkable(x, y), "point " + x + "," + y);
        }
        for (RoomRules.Obstacle o : RoomRules.OBSTACLES) {
            for (double x : new double[] {o.x() - RoomRules.FOOT_RADIUS, o.x() - RoomRules.FOOT_RADIUS + 0.01}) {
                double y = o.y() + o.height() / 2;
                boolean expected = x >= RoomRules.FOOT_RADIUS && y >= RoomRules.FOOT_RADIUS
                        && x <= RoomRules.WIDTH - RoomRules.FOOT_RADIUS && y <= RoomRules.HEIGHT - RoomRules.FOOT_RADIUS
                        && RoomRules.OBSTACLES.stream().noneMatch(other -> other.blocks(x, y, RoomRules.FOOT_RADIUS));
                assertEquals(expected, RoomRules.walkable(x, y));
            }
        }
    }

    @Test
    void everySeatIsOpenGroundAndNobodyStandsUpCrowded() {
        for (int seat = 0; seat < RoomRules.CAPACITY; seat++) {
            double x = RoomRules.seatX(seat);
            double y = RoomRules.seatY(seat);
            assertTrue(RoomRules.walkable(x, y), "seat " + seat);
            for (int other = 0; other < seat; other++) {
                double apart = Math.hypot(x - RoomRules.seatX(other), y - RoomRules.seatY(other));
                assertTrue(apart > 100, "seats " + other + " and " + seat + " start crowded");
            }
        }
        assertTrue(RoomRules.walkable(RoomRules.BUTTON_X, RoomRules.BUTTON_Y + 50));
    }

    @ParameterizedTest
    @ValueSource(strings = {"woodland", "market"})
    void nativeTownPublicationMatchesUnitySolidBuildingsAndRetainedSeats(String mapId) throws Exception {
        var mapper = new ObjectMapper();
        Path source = Path.of("..", "towns", mapId, "layout.json");
        Path nativeRules = Path.of("..", "native", "Assets", "PUtown", "Resources", "Towns", mapId + ".json");
        JsonNode authored = mapper.readTree(source.toFile());
        JsonNode rendered = mapper.readTree(nativeRules.toFile());
        assertEquals(mapId, rendered.path("mapId").asText());
        try (var stream = getClass().getResourceAsStream("/maps/" + mapId + ".json")) {
            assertNotNull(stream);
            assertEquals(rendered, mapper.readTree(stream), "Unity and Java must load the same publication");
        }
        assertEquals(100, rendered.path("coordinates").path("serverUnitsPerUnityUnit").asInt());
        assertEquals(1, rendered.path("coordinates").path("unityZSign").asInt());
        assertEquals(authored.path("buildings"), rendered.path("buildings"));
        assertFalse(rendered.path("tasksEnabled").asBoolean(true));
        assertEquals(0, rendered.path("tasks").size());
        assertEquals(0, rendered.path("interiors").size());
        var map = TownMap.find(mapId);
        assertNotNull(map); assertFalse(map.tasksEnabled());
        assertTrue(map.tasks().isEmpty());
        assertEquals(10, rendered.path("meeting").path("seats").size());
        for (JsonNode seat : rendered.path("meeting").path("seats")) {
            int index = seat.path("seat").asInt();
            assertEquals(seat.path("x").asDouble(), map.seatX(index));
            assertEquals(seat.path("y").asDouble(), map.seatY(index));
            assertEquals(seat.path("facing").asText(), RoomRules.seatFacing(index));
            assertTrue(map.walkable(map.seatX(index), map.seatY(index)));
            assertEquals("Outdoors", map.areaAt(map.seatX(index), map.seatY(index)));
        }
        assertTrue(rendered.path("buildings").size() > 0);
        for (JsonNode building : rendered.path("buildings")) {
            double x = building.path("x").asDouble() + building.path("width").asDouble() / 2;
            double y = building.path("y").asDouble() + building.path("height").asDouble() / 2;
            assertFalse(map.walkable(x, y), "Non-enterable building must be solid: " + building.path("id").asText());
        }
        double width = rendered.path("width").asDouble(), height = rendered.path("height").asDouble();
        var random = new java.util.Random(62);
        for (int sample = 0; sample < 2000; sample++) {
            double x = random.nextDouble() * width, y = random.nextDouble() * height;
            boolean expected = x >= 14 && y >= 14 && x <= width - 14 && y <= height - 14
                    && rendered.path("obstacles").valueStream().noneMatch(rect ->
                    x > rect.path("x").asDouble() - 14 && x < rect.path("x").asDouble() + rect.path("width").asDouble() + 14
                            && y > rect.path("y").asDouble() - 14 && y < rect.path("y").asDouble() + rect.path("height").asDouble() + 14);
            assertEquals(expected, map.walkable(x, y), "Native collision at " + x + "," + y);
        }
    }

    @Test
    void activeCatalogueRetainsLegacyRulesAndRetiresTheNativeCampus() {
        assertNull(TownMap.find("campus"));
        for (String mapId : List.of("village", "horror", "cyberpunk")) {
            assertTrue(TownMap.find(mapId).tasksEnabled());
            assertTrue(TownMap.find(mapId).tasks().size() >= 3);
        }
    }
}
