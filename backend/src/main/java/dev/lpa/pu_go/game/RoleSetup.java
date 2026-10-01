package dev.lpa.pu_go.game;

import java.util.ArrayList;
import java.util.List;

/**
 * How many of each special Role the Host deals. Every Role is dealt at least once, and every
 * Player the special Roles leave over is a Villager, so a table always has at least one.
 */
public record RoleSetup(int mafia, int doctors, int sheriffs) {
    public static final int MAX_MAFIA = 2;
    public static final int MAX_SHERIFFS = 2;
    /** The deal a new Room offers until its Host changes it. */
    public static final RoleSetup DEFAULT = new RoleSetup(1, 1, 1);

    /** Why this setup can never be dealt, whatever the table, or null when it can. */
    public String invalidReason(int capacity) {
        if (mafia < 1 || mafia > MAX_MAFIA) return "Deal one or two Mafia.";
        if (sheriffs < 1 || sheriffs > MAX_SHERIFFS) return "Deal one or two Sheriffs.";
        if (doctors < 1) return "Deal at least one Doctor.";
        if (specialRoles() > capacity - 1) return "Leave room for at least one Villager.";
        return null;
    }

    public int specialRoles() { return mafia + doctors + sheriffs; }

    /** The smallest table this setup leaves a Villager at. */
    public int minimumPlayers() { return specialRoles() + 1; }

    /** Mafia first, then Doctors, then Sheriffs, then Villagers; the caller shuffles the deal. */
    public List<Role> deal(int players) {
        if (players < minimumPlayers()) throw new IllegalArgumentException("Too few Players for this Role Setup");
        List<Role> roles = new ArrayList<>();
        for (int index = 0; index < players; index++) {
            roles.add(index < mafia ? Role.MAFIA
                    : index < mafia + doctors ? Role.DOCTOR
                    : index < specialRoles() ? Role.SHERIFF : Role.VILLAGER);
        }
        return List.copyOf(roles);
    }
}
