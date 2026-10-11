package dev.lpa.pu_go.developer;

/** Every bypass is independent; ordinary rules are the initial settings. */
public final class DeveloperSettings {
    public boolean automatic = true;
    public boolean factionVictory = true;
    public boolean taskVictory = true;
    public boolean taskRange = true;
    public boolean taskDuration = true;
    public boolean nightMovement = false;
    public void set(String name, boolean enabled) {
        switch (name) {
            case "automatic" -> automatic = enabled;
            case "factionVictory" -> factionVictory = enabled;
            case "taskVictory" -> taskVictory = enabled;
            case "taskRange" -> taskRange = enabled;
            case "taskDuration" -> taskDuration = enabled;
            case "nightMovement" -> nightMovement = enabled;
            default -> throw new IllegalArgumentException("Unknown developer setting");
        }
    }
    public DeveloperSettings copy() {
        DeveloperSettings copy = new DeveloperSettings();
        copy.automatic = automatic; copy.factionVictory = factionVictory; copy.taskVictory = taskVictory;
        copy.taskRange = taskRange; copy.taskDuration = taskDuration; copy.nightMovement = nightMovement;
        return copy;
    }
}
