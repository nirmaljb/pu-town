package dev.lpa.pu_go.game;

import dev.lpa.pu_go.room.RoomRules;

/** One original assignment; completed repair steps survive interrupted work and later Days. */
public final class RepairTask {
    public static final int TOTAL_STEPS = 24;
    public static final long STEP_MILLIS = 20_000;
    public static final double REACH = 48;
    private final String taskId;
    private final RoomRules.TaskLocation location;
    private int completedSteps;
    private Long workEndsAt;

    public RepairTask(String taskId, RoomRules.TaskLocation location) {
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
                workEndsAt = now + STEP_MILLIS;
            }
            case "complete" -> {
                if (workEndsAt == null || now < workEndsAt) return false;
                completedSteps++;
                interrupt();
            }
            case "cancel" -> interrupt();
            default -> { return false; }
        }
        return true;
    }

    public record View(String taskId, String name, String kind, double x, double y,
                       int completedSteps, int totalSteps, boolean active, Long workRemainingMs) {}

    public View view(long now) {
        return new View(taskId, location.name(), "repair", location.x(), location.y(), completedSteps,
                TOTAL_STEPS, active(), workEndsAt == null ? null : Math.max(0, workEndsAt - now));
    }
}
