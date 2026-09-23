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
