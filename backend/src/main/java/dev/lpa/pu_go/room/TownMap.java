package dev.lpa.pu_go.room;

import dev.lpa.pu_go.game.TaskBoard;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Immutable, packaged geometry for one playable town. Each Room pins its own choice. */
public final class TownMap {
    private static final Map<String, TownMap> MAPS = Map.of(
            "village", load("village"), "horror", load("horror"), "cyberpunk", load("cyberpunk"),
            "campus", load("campus"));
    private final String id;
    private final double width, height, centreX, centreY;
    private final List<RoomRules.Interior> interiors;
    private final List<TaskBoard.Location> tasks;
    private final Map<Long, List<RoomRules.Obstacle>> cells;

    private TownMap(String id, JsonNode data) {
        this.id = id;
        width = data.path("width").asDouble();
        height = data.path("height").asDouble();
        centreX = data.path("emergencyButton").path("x").asDouble();
        centreY = data.path("emergencyButton").path("y").asDouble();
        if (!Double.isFinite(width) || !Double.isFinite(height) || width <= 0 || height <= 0
                || !Double.isFinite(centreX) || !Double.isFinite(centreY))
            throw new IllegalStateException("Invalid town bounds or Seat centre: " + id);
        var rooms = new ArrayList<RoomRules.Interior>();
        for (JsonNode room : data.path("interiors")) rooms.add(new RoomRules.Interior(room.path("name").asText(),
                room.path("x").asDouble(), room.path("y").asDouble(), room.path("width").asDouble(), room.path("height").asDouble()));
        interiors = List.copyOf(rooms);
        var locations = new ArrayList<TaskBoard.Location>();
        for (JsonNode task : data.path("tasks")) locations.add(new TaskBoard.Location(task.path("name").asText(),
                task.path("x").asDouble(), task.path("y").asDouble()));
        tasks = List.copyOf(locations);
        var indexed = new HashMap<Long, List<RoomRules.Obstacle>>();
        for (JsonNode rect : data.path("obstacles")) {
            var obstacle = new RoomRules.Obstacle(rect.path("x").asDouble(), rect.path("y").asDouble(),
                    rect.path("width").asDouble(), rect.path("height").asDouble());
            int left = (int) Math.floor((obstacle.x() - RoomRules.FOOT_RADIUS) / 64);
            int right = (int) Math.floor((obstacle.x() + obstacle.width() + RoomRules.FOOT_RADIUS) / 64);
            int top = (int) Math.floor((obstacle.y() - RoomRules.FOOT_RADIUS) / 64);
            int bottom = (int) Math.floor((obstacle.y() + obstacle.height() + RoomRules.FOOT_RADIUS) / 64);
            for (int y = top; y <= bottom; y++) for (int x = left; x <= right; x++)
                indexed.computeIfAbsent(cellKey(x, y), ignored -> new ArrayList<>()).add(obstacle);
        }
        indexed.replaceAll((key, value) -> List.copyOf(value));
        cells = Map.copyOf(indexed);
        if (tasks.isEmpty() || tasks.stream().anyMatch(task -> !walkable(task.x(), task.y())))
            throw new IllegalStateException("Town has unreachable Tasks: " + id);
        for (int seat = 0; seat < RoomRules.CAPACITY; seat++)
            if (!walkable(seatX(seat), seatY(seat))) throw new IllegalStateException("Blocked Seat: " + id);
    }

    private static TownMap load(String id) {
        try (var input = TownMap.class.getResourceAsStream("/maps/" + id + ".json")) {
            if (input == null) throw new IllegalStateException("Missing town: " + id);
            return new TownMap(id, new ObjectMapper().readTree(input));
        } catch (java.io.IOException exception) { throw new IllegalStateException("Could not load town: " + id, exception); }
    }

    public static TownMap find(String id) { return MAPS.get(id); }
    public static TownMap village() { return MAPS.get("village"); }
    public String id() { return id; }
    public double seatX(int seat) { return centreX + Math.round(330 * Math.sin(seat * 2 * Math.PI / RoomRules.CAPACITY)); }
    public double seatY(int seat) { return centreY + Math.round(-205 * Math.cos(seat * 2 * Math.PI / RoomRules.CAPACITY)); }
    public List<TaskBoard.Location> tasks() { return tasks; }
    public String areaAt(double x, double y) {
        return interiors.stream().filter(room -> room.contains(x, y)).map(RoomRules.Interior::name).findFirst().orElse("Outdoors");
    }
    private static long cellKey(int x, int y) { return ((long) x << 32) ^ (y & 0xffffffffL); }
    public boolean walkable(double x, double y) {
        if (!Double.isFinite(x) || !Double.isFinite(y) || x < RoomRules.FOOT_RADIUS || y < RoomRules.FOOT_RADIUS
                || x > width - RoomRules.FOOT_RADIUS || y > height - RoomRules.FOOT_RADIUS) return false;
        return cells.getOrDefault(cellKey((int) Math.floor(x / 64), (int) Math.floor(y / 64)), List.of()).stream()
                .noneMatch(obstacle -> obstacle.blocks(x, y, RoomRules.FOOT_RADIUS));
    }
}
