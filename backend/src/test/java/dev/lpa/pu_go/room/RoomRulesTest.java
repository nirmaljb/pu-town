package dev.lpa.pu_go.room;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
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

    @Test
    void nativeCampusPublicationMatchesUnityAndAuthoritativeCollisionAndRetainedSeats() throws Exception {
        var mapper = new ObjectMapper();
        Path source = Path.of("..", "campus", "layout.json");
        Path nativeRules = Path.of("..", "native", "Assets", "PUtown", "Resources", "Campus", "campus.json");
        JsonNode authored = mapper.readTree(source.toFile());
        JsonNode rendered = mapper.readTree(nativeRules.toFile());
        try (var stream = getClass().getResourceAsStream("/maps/campus.json")) {
            assertNotNull(stream);
            assertEquals(rendered, mapper.readTree(stream), "Unity and Java must load the same publication");
        }
        assertEquals(4800, rendered.path("width").asInt());
        assertEquals(3600, rendered.path("height").asInt());
        assertEquals(100, rendered.path("coordinates").path("serverUnitsPerUnityUnit").asInt());
        assertEquals(1, rendered.path("coordinates").path("unityZSign").asInt());
        assertEquals(authored.path("buildings"), rendered.path("buildings"));
        assertEquals(authored.path("tasks"), rendered.path("tasks"));
        assertEquals(12, rendered.path("interiors").size());
        TownMap campus = TownMap.find("campus");
        assertNotNull(campus);
        for (JsonNode seat : rendered.path("meeting").path("seats")) {
            int index = seat.path("seat").asInt();
            assertEquals(seat.path("x").asDouble(), campus.seatX(index));
            assertEquals(seat.path("y").asDouble(), campus.seatY(index));
            assertEquals(seat.path("facing").asText(), RoomRules.seatFacing(index));
            assertTrue(campus.walkable(campus.seatX(index), campus.seatY(index)));
        }
        assertEquals("Ananda Rangapillai Library", campus.areaAt(2992, 2272));
        assertEquals("Outdoors", campus.areaAt(2992, 2160));
        assertTrue(campus.walkable(2992, 2208), "The library doorway must be open");
        assertFalse(campus.walkable(2752, 2208), "The wall beside the doorway must block feet");
        var random = new java.util.Random(62);
        for (int sample = 0; sample < 2000; sample++) {
            double x = random.nextDouble() * 4800, y = random.nextDouble() * 3600;
            boolean expected = x >= 14 && y >= 14 && x <= 4786 && y <= 3586
                    && rendered.path("obstacles").valueStream().noneMatch(rect ->
                    x > rect.path("x").asDouble() - 14 && x < rect.path("x").asDouble() + rect.path("width").asDouble() + 14
                            && y > rect.path("y").asDouble() - 14 && y < rect.path("y").asDouble() + rect.path("height").asDouble() + 14);
            assertEquals(expected, campus.walkable(x, y), "Native collision at " + x + "," + y);
        }
    }
}
