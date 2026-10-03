package dev.lpa.pu_go.game;

import dev.lpa.pu_go.room.RoomRules;

/** One original assignment; completed Task steps survive interrupted work and later Days. */
public final class TaskAssignment {
    public static final int TOTAL_STEPS = 24;
    public static final long STEP_MILLIS = 20_000;
    public static final double REACH = 48;
    private static final java.util.List<Integer> SEQUENCE = java.util.List.of(2, 4, 1, 3);
    private final String kind;
    private final String taskId;
    private final RoomRules.TaskLocation location;
    private int completedSteps;
    private Long workEndsAt;

    public TaskAssignment(String taskId, RoomRules.TaskLocation location, String kind) {
        this.kind = kind;
        this.taskId = taskId;
        this.location = location;
    }

    public String taskId() { return taskId; }
    public RoomRules.TaskLocation location() { return location; }
    public int completedSteps() { return completedSteps; }
    public boolean active() { return workEndsAt != null; }
    public void interrupt() { workEndsAt = null; }

    public boolean act(int step, String action, long now) {
        if (step != completedSteps || completedSteps == TOTAL_STEPS) return false;
        switch (action) {
            case "start" -> {
                if (active()) return false;
                workEndsAt = now + stepMillis();
            }
            case "complete" -> {
                if (!kind.equals("repair") || workEndsAt == null || now < workEndsAt) return false;
                completedSteps++;
                interrupt();
            }
            case "press_1", "press_2", "press_3", "press_4" -> {
                if (!kind.equals("sequence") || workEndsAt == null || now < workEndsAt
                        || !action.equals("press_" + SEQUENCE.get(completedSteps % SEQUENCE.size()))) return false;
                completedSteps++;
                workEndsAt = completedSteps == TOTAL_STEPS ? null : now + stepMillis();
            }
            case "cancel" -> interrupt();
            default -> { return false; }
        }
        return true;
    }

    private long stepMillis() { return kind.equals("sequence") ? 5_000 : STEP_MILLIS; }

    public record View(String taskId, String name, String kind, double x, double y,
                       int completedSteps, int totalSteps, boolean active, Long workRemainingMs, java.util.List<Integer> sequence) {}

    public View view(long now) {
        return new View(taskId, location.name(), kind, location.x(), location.y(), completedSteps,
                TOTAL_STEPS, active(), workEndsAt == null ? null : Math.max(0, workEndsAt - now), kind.equals("sequence") ? SEQUENCE : null);
    }
}
