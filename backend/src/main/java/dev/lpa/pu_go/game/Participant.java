package dev.lpa.pu_go.game;

import java.util.ArrayList;
import java.util.List;

/**
 * One entry in the Game Roster. It records original participation and survives the end of
 * the Room Membership that created it, so history and final results stay intelligible.
 */
public final class Participant {
    private final String playerId;
    private final String displayName;
    private final String colour;
    private final String avatarPreset;
    private final int seat;
    private final Role role;
    private final List<Investigation> investigations = new ArrayList<>();
    private ParticipantStatus status = ParticipantStatus.LIVING;
    private boolean killedByMafia;
    // A Roam kill stays secret from the living Village until the next Meeting is called.
    private boolean deathRevealed = true;

    // ----- the Roam: position and ability timers, all owned by the server -----
    double x;
    double y;
    String facing = "down";
    long lastMoveAt;
    /** Incremented whenever the server overrides the client's own idea of its position. */
    int correction;
    long crowdedMs;
    long primaryReadyAt;
    long vanishReadyAt;
    long vanishedUntil;
    String shieldTarget;
    long shieldUntil;
    boolean emergencyUsed;

    public Participant(String playerId, String displayName, String colour, String avatarPreset, int seat, Role role) {
        this.playerId = playerId;
        this.displayName = displayName;
        this.colour = colour;
        this.avatarPreset = avatarPreset;
        this.seat = seat;
        this.role = role;
    }

    public String playerId() { return playerId; }
    public String displayName() { return displayName; }
    public String colour() { return colour; }
    public String avatarPreset() { return avatarPreset; }
    public int seat() { return seat; }
    public Role role() { return role; }
    public ParticipantStatus status() { return status; }
    public void setStatus(ParticipantStatus value) { status = value; }
    public boolean isLiving() { return status == ParticipantStatus.LIVING; }
    public boolean killedByMafia() { return killedByMafia; }
    public void setKilledByMafia(boolean value) { killedByMafia = value; }
    public boolean deathRevealed() { return deathRevealed; }
    void setDeathRevealed(boolean value) { deathRevealed = value; }
    public List<Investigation> investigations() { return List.copyOf(investigations); }
    public void addInvestigation(Investigation investigation) { investigations.add(investigation); }

    public double x() { return x; }
    public double y() { return y; }
    public String facing() { return facing; }
    public int correction() { return correction; }
    public boolean emergencyUsed() { return emergencyUsed; }
    public boolean vanished(long now) { return now < vanishedUntil; }

    double distanceTo(double otherX, double otherY) { return Math.hypot(x - otherX, y - otherY); }
    double distanceTo(Participant other) { return distanceTo(other.x, other.y); }

    /** One Sheriff Scan result: a Faction answer about a target, never its exact Role. */
    public record Investigation(int round, String targetPlayerId, boolean mafia) {}
}
