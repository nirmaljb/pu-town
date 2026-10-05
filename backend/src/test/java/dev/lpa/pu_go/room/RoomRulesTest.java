package dev.lpa.pu_go.room;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
}
