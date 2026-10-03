package dev.lpa.pu_go.game;

import dev.lpa.pu_go.room.RoomRules;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Persistent original assignments. Only their owner receives their stage and location. */
public final class TaskBoard {
    public record Location(String name, double x, double y) {}
    /** Coordinates are the task points in the existing served Tiled map. */
    public static final List<Location> LOCATIONS = List.of(
            new Location("Sign the town ledger", 1280, 544),
            new Location("Feed the sheep", 280, 600), new Location("Harvest pumpkins", 300, 460),
            new Location("Pick apples", 840, 420), new Location("Pray at the altar", 2016, 300),
            new Location("Restock the shelves", 560, 1000), new Location("Fish from the dock", 288, 1110),
            new Location("Stoke the forge", 800, 1030), new Location("Chop firewood", 1570, 1110),
            new Location("Mine gold", 1760, 300), new Location("Practice archery", 1690, 560),
            new Location("Serve drinks at the inn", 2190, 980), new Location("Tidy the graves", 2260, 380),
            new Location("Keep watch from the tower", 1540, 420));
    public record TaskView(String taskId, String name, String kind, double x, double y,
                           int step, int steps, boolean fake, List<Integer> sequence) {}
    public record View(List<TaskView> tasks, int completed, int total, String activeTaskId, Long remainingMs) {}
    private static final double RANGE = 64;
    private static final long REPAIR_MS = 4000;
    private static final int REPAIR_STEPS = 3;
    private static final Game.Rejection INVALID = new Game.Rejection("invalid_task", "Choose your current nearby Task step and finish its interaction first.");
    private static final class Assignment {
        final String id;
        String owner;
        final Location location;
        int step;
        Assignment(String id, String owner, Location location) {
            this.id = id; this.owner = owner; this.location = location;
        }
        TaskView view() { return new TaskView(id, location.name(), "repair", location.x(), location.y(), step, REPAIR_STEPS, false, List.of()); }
    }
    private record Interaction(String taskId, int step, long readyAt) {}
    private final List<Assignment> assignments = new ArrayList<>();
    private final Map<String, Interaction> interactions = new LinkedHashMap<>();

    public TaskBoard(List<Participant> roster) {
        for (Participant member : roster) {
            if (member.role() == Role.MAFIA) continue;
            for (int slot = 0; slot < 3; slot++) {
                Location location = LOCATIONS.get(slot == 0 ? 0 : (member.seat() * 3 + slot) % LOCATIONS.size());
                assignments.add(new Assignment("task-" + member.seat() + "-" + slot, member.playerId(), location));
            }
        }
    }
    public int completed() { return (int) assignments.stream().filter(task -> task.step == REPAIR_STEPS).count(); }
    public int total() { return assignments.size(); }
    private Assignment owned(String playerId, String taskId) {
        return assignments.stream().filter(task -> task.owner.equals(playerId) && task.id.equals(taskId)).findFirst().orElse(null);
    }
    private boolean nearby(Participant actor, Assignment task) {
        return Math.hypot(actor.x() - task.location.x(), actor.y() - task.location.y()) <= RANGE
                && RoomRules.areaAt(actor.x(), actor.y()).equals(RoomRules.areaAt(task.location.x(), task.location.y()));
    }
    public Game.Rejection open(Participant actor, String taskId, long now) {
        Assignment task = owned(actor.playerId(), taskId);
        if (task == null || task.step == REPAIR_STEPS || !nearby(actor, task)) return INVALID;
        interactions.put(actor.playerId(), new Interaction(task.id, task.step, now + REPAIR_MS));
        return null;
    }
    public Game.Rejection step(Participant actor, String taskId, int step, int value, long now) {
        Assignment task = owned(actor.playerId(), taskId);
        Interaction interaction = interactions.get(actor.playerId());
        if (task == null || task.step != step || value != 0 || !nearby(actor, task)
                || interaction == null || !interaction.taskId().equals(taskId) || interaction.step() != step
                || now < interaction.readyAt()) return INVALID;
        task.step++;
        interactions.remove(actor.playerId());
        return null;
    }
    public void close(String playerId) { interactions.remove(playerId); }
    public void closeAll() { interactions.clear(); }
    public void moved(Participant actor) {
        Interaction interaction = interactions.get(actor.playerId());
        if (interaction != null) {
            Assignment task = owned(actor.playerId(), interaction.taskId());
            if (task == null || !nearby(actor, task)) close(actor.playerId());
        }
    }
    public View view(String playerId, long now) {
        Interaction active = interactions.get(playerId);
        return new View(assignments.stream().filter(task -> task.owner.equals(playerId)).map(Assignment::view).toList(),
                completed(), total(), active == null ? null : active.taskId(), active == null ? null : Math.max(0, active.readyAt() - now));
    }
}
