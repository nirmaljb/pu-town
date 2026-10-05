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
            new Location("Sign the town ledger", 3824, 1968),
            new Location("Feed the sheep", 2832, 2032),
            new Location("Harvest pumpkins", 2864, 1904),
            new Location("Pick apples", 3408, 1872),
            new Location("Pray at the altar", 4560, 1744),
            new Location("Restock the shelves", 3120, 2448),
            new Location("Fish from the dock", 2832, 2544),
            new Location("Stoke the forge", 3344, 2480),
            new Location("Chop firewood", 4144, 2544),
            new Location("Mine gold", 4336, 1744),
            new Location("Practice archery", 4240, 2000),
            new Location("Serve drinks at the inn", 4752, 2416),
            new Location("Tidy the graves", 4816, 1808),
            new Location("Keep watch from the tower", 4112, 1872),
            new Location("Orchard & mill", 1424, 912),
            new Location("Riverside farm", 5904, 880),
            new Location("Market green", 1552, 2064),
            new Location("Woodland lodge", 1456, 3408),
            new Location("Harbor & fishery", 6064, 3472),
            new Location("Workshop lane", 6032, 2192));
    public record TaskView(String taskId, String name, String kind, double x, double y,
                           int step, int steps, boolean fake, List<Integer> sequence) {}
    public record View(List<TaskView> tasks, int completed, int total, String activeTaskId, Long remainingMs) {}
    private static final double RANGE = 64;
    private static final long INTERACTION_MS = 120_000;
    private static final int REPAIR_STEPS = 3;
    private static final Game.Rejection INVALID = new Game.Rejection("invalid_task", "Choose your current nearby Task step and finish its interaction first.");
    private static final class Assignment {
        final String id;
        String owner;
        final Location location;
        final String kind;
        final boolean fake;
        final Location destination;
        final List<Integer> sequence;
        int step;
        Assignment(String id, String owner, Location location, String kind, boolean fake) {
            this.id = id; this.owner = owner; this.location = location; this.kind = kind; this.fake = fake;
            this.destination = LOCATIONS.get(0);
            this.sequence = kind.equals("sequence") ? List.of(2, 0, 3, 1) : List.of();
        }
        Location currentLocation() { return kind.equals("delivery") && step % 2 == 1 ? destination : location; }
        int steps() { return kind.equals("sequence") ? sequence.size() : kind.equals("delivery") ? 2 : REPAIR_STEPS; }
        long duration() { return INTERACTION_MS; }
        TaskView view() { Location current = currentLocation(); return new TaskView(id, kind.equals("delivery") ? (step % 2 == 1 ? "Deliver " : "Collect ") + location.name() : location.name(), kind, current.x(), current.y(), step, steps(), fake, sequence); }
    }
    private record Interaction(String taskId, int step, long readyAt) {}
    private final List<Assignment> assignments = new ArrayList<>();
    private final Map<String, Interaction> interactions = new LinkedHashMap<>();

    public TaskBoard(List<Participant> roster, boolean practice) {
        for (Participant member : roster) {
            List<Boolean> banks = practice ? List.of(false, true) : List.of(member.role() == Role.MAFIA);
            for (boolean fake : banks) for (int slot = 0; slot < 3; slot++) {
                Location location = LOCATIONS.get(slot == 0 ? 0 : (member.seat() * 3 + slot) % LOCATIONS.size());
                assignments.add(new Assignment((fake ? "fake-" : "task-") + member.seat() + "-" + slot,
                        member.playerId(), location, slot == 1 ? "sequence" : slot == 2 ? "delivery" : "repair", fake));
            }
        }
    }
    public int completed() { return (int) assignments.stream().filter(task -> !task.fake && task.step == task.steps()).count(); }
    public int total() { return (int) assignments.stream().filter(task -> !task.fake).count(); }
    private Assignment owned(String playerId, String taskId) {
        return assignments.stream().filter(task -> task.owner.equals(playerId) && task.id.equals(taskId)).findFirst().orElse(null);
    }
    private boolean nearby(Participant actor, Assignment task) {
        return Math.hypot(actor.x() - task.currentLocation().x(), actor.y() - task.currentLocation().y()) <= RANGE
                && RoomRules.areaAt(actor.x(), actor.y()).equals(RoomRules.areaAt(task.currentLocation().x(), task.currentLocation().y()));
    }
    public Game.Rejection open(Participant actor, String taskId, long now) {
        Assignment task = owned(actor.playerId(), taskId);
        if (task == null || task.fake != (actor.role() == Role.MAFIA) || task.step == task.steps() || !nearby(actor, task)) return INVALID;
        interactions.put(actor.playerId(), new Interaction(task.id, task.step, now + task.duration()));
        return null;
    }
    public Game.Rejection step(Participant actor, String taskId, int step, int value, long now) {
        Assignment task = owned(actor.playerId(), taskId);
        Interaction interaction = interactions.get(actor.playerId());
        if (task == null || task.fake != (actor.role() == Role.MAFIA) || task.step != step || step >= task.steps() || !nearby(actor, task)
                || value != (task.kind.equals("sequence") ? task.sequence.get(step) : 0)
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
    public void transfer(String departingId, List<Participant> roster) {
        close(departingId);
        List<Participant> recipients = roster.stream().filter(Participant::isLiving)
                .filter(member -> member.role() != Role.MAFIA && !member.playerId().equals(departingId)).toList();
        if (recipients.isEmpty()) return;
        for (Assignment task : assignments) {
            if (task.fake || !task.owner.equals(departingId) || task.step == task.steps()) continue;
            Participant recipient = recipients.stream().min(java.util.Comparator.comparingLong(member ->
                    assignments.stream().filter(owned -> !owned.fake && owned.owner.equals(member.playerId())
                            && owned.step < owned.steps()).count())).orElseThrow();
            task.owner = recipient.playerId();
        }
    }

    public View view(String playerId, Role role, long now) {
        Interaction active = interactions.get(playerId);
        return new View(assignments.stream().filter(task -> task.owner.equals(playerId) && task.fake == (role == Role.MAFIA)).map(Assignment::view).toList(),
                completed(), total(), active == null ? null : active.taskId(), active == null ? null : Math.max(0, active.readyAt() - now));
    }
}
