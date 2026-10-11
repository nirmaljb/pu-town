package dev.lpa.pu_go.developer;

import dev.lpa.pu_go.game.Game;
import dev.lpa.pu_go.game.Role;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/** Room-owned testing authority, never inferred from Host transfers. */
public final class DeveloperRoom {
    public String controllerId;
    public int revision;
    public final Set<String> simulated = new LinkedHashSet<>();
    public final Map<String, Role> roles = new LinkedHashMap<>();
    public DeveloperSettings settings = new DeveloperSettings();
    public Game startingState;
    public String scenario = "custom";
    public DeveloperRoom(String controllerId) { this.controllerId = controllerId; }
}
