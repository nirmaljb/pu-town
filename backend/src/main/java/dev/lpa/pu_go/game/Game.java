package dev.lpa.pu_go.game;

import dev.lpa.pu_go.room.RoomRules;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static dev.lpa.pu_go.game.FieldRules.*;

/**
 * The server-owned contest inside one started Room. Every transition here runs under that
 * Room's serialization, so deadlines, movement, abilities, Forfeits and recovery share one order.
 */
public final class Game {
    /** A refused submission, reported to its sender only. */
    public record Rejection(String code, String message) {}

    /**
     * The public result of the phase being presented. A Meeting Call names its kind, caller,
     * the reported Body and every death since the last Meeting; a Meeting names its verdict.
     */
    public record Outcome(String kind, String callerPlayerId, String bodyPlayerId, List<String> deaths,
                          String eliminatedPlayerId, Boolean eliminatedMafia) {}

    /** One disclosed Meeting ballot. A null target is an explicit Skip. */
    public record Ballot(String voterPlayerId, String targetPlayerId) {}

    /** A Body left by a Roam kill, lying where the victim fell until a Meeting is called. */
    public record Body(String playerId, double x, double y) {}

    /** What an accepted ability changed, so the caller tells exactly the recipients it concerns. */
    public enum Effect { KILLED, SHIELD_ABSORBED, VANISHED, SHIELDED, SCANNED, MEETING_CALLED, GAME_WON }

    /** An ability's result: either a rejection or an effect, with the Player it touched. */
    public record AbilityResult(Rejection rejection, Effect effect, String targetPlayerId) {
        static AbilityResult rejected(Rejection rejection) { return new AbilityResult(rejection, null, null); }
        static AbilityResult of(Effect effect, String target) { return new AbilityResult(null, effect, target); }
    }

    /** One Avatar a recipient is allowed to see on the field. */
    public record FieldPlayer(String playerId, double x, double y, String facing, boolean ghost, boolean vanished) {}

    private static final Rejection WRONG_PHASE = new Rejection("invalid_phase", "That action does not belong to this phase.");
    private static final Rejection NOT_ALLOWED = new Rejection("invalid_action", "You cannot take that action.");
    private static final Rejection COOLING = new Rejection("cooling_down", "That ability is not ready yet.");
    private static final Rejection OUT_OF_REACH = new Rejection("invalid_target", "No such Player within reach.");
    private static final Rejection SHIELD_BLOCKED = new Rejection("target_shielded", "Your target was shielded. The kill failed.");

    private final Map<String, Participant> participants = new LinkedHashMap<>();
    private final Map<String, String> ballots = new LinkedHashMap<>();
    private final List<ChatEntry> chat = new ArrayList<>();
    private final List<Body> bodies = new ArrayList<>();
    private final List<String> deaths = new ArrayList<>();
    private GamePhase phase = GamePhase.ROLE_REVEAL;
    private int round;
    private long phaseEndsAt;
    private long lastTickAt;
    private Faction winner;
    private List<Ballot> revealedBallots;
    private Outcome outcome;

    public Game(List<Participant> roster, long startedAt) {
        for (Participant participant : roster) {
            participants.put(participant.playerId(), participant);
            placeAtSeat(participant, startedAt);
        }
        phaseEndsAt = startedAt + GamePhase.ROLE_REVEAL.durationMillis();
    }

    public GamePhase phase() { return phase; }
    public int round() { return round; }
    public Faction winner() { return winner; }
    public Outcome outcome() { return outcome; }
    public List<Ballot> revealedBallots() { return revealedBallots == null ? null : List.copyOf(revealedBallots); }
    public List<Participant> roster() { return List.copyOf(participants.values()); }
    public Participant participant(String playerId) { return participants.get(playerId); }
    public boolean isFinished() { return phase == GamePhase.FINISHED; }
    public boolean isRoaming() { return phase == GamePhase.ROAM; }

    public Long remainingMillis(long now) {
        return phase == GamePhase.FINISHED ? null : Math.max(0, phaseEndsAt - now);
    }

    /** The deadline of the phase awaiting its transition, or null once the Game is finished. */
    public Long phaseDeadline() { return phase == GamePhase.FINISHED ? null : phaseEndsAt; }

    /** Advances exactly one expired phase. Callers repeat while a deadline remains due. */
    public void advance() {
        if (phase == GamePhase.FINISHED) return;
        long boundary = phaseEndsAt;
        switch (phase) {
            case ROLE_REVEAL -> beginRoam(boundary);
            case ROAM -> callMeeting("timeout", null, null, boundary);
            case MEETING_CALL -> enter(GamePhase.DISCUSSION, boundary);
            case DISCUSSION -> enter(GamePhase.VOTING, boundary);
            case VOTING -> {
                resolveMeeting();
                enter(GamePhase.VOTING_RESULT, boundary);
            }
            case VOTING_RESULT -> {
                if (winner != null) finish();
                else beginRoam(boundary);
            }
            case FINISHED -> { }
        }
    }

    private void beginRoam(long at) {
        round++;
        ballots.clear();
        revealedBallots = null;
        outcome = null;
        lastTickAt = at;
        for (Participant member : participants.values()) {
            placeAtSeat(member, at);
            member.crowdedMs = 0;
            member.primaryReadyAt = at + OPENING_COOLDOWN;
            member.vanishReadyAt = at + OPENING_COOLDOWN;
            member.vanishedUntil = 0;
            member.shieldTarget = null;
            member.shieldUntil = 0;
        }
        enter(GamePhase.ROAM, at);
    }

    /** Everyone stands up from their own Seat, so a Roam always begins in the Town Hall. */
    private static void placeAtSeat(Participant member, long at) {
        member.x = RoomRules.seatX(member.seat());
        member.y = RoomRules.seatY(member.seat());
        member.facing = RoomRules.seatFacing(member.seat());
        member.lastMoveAt = at;
        member.correction++;
    }

    private void callMeeting(String kind, String callerId, String bodyId, long at) {
        outcome = new Outcome(kind, callerId, bodyId, List.copyOf(deaths), null, null);
        revealDeaths();
        for (Participant member : participants.values()) {
            member.vanishedUntil = 0;
            member.shieldTarget = null;
            member.shieldUntil = 0;
        }
        enter(GamePhase.MEETING_CALL, at);
    }

    private void revealDeaths() {
        for (Participant member : participants.values()) member.setDeathRevealed(true);
        deaths.clear();
        bodies.clear();
    }

    private void enter(GamePhase next, long boundary) {
        phase = next;
        phaseEndsAt = boundary + next.durationMillis();
    }

    private void finish() {
        phase = GamePhase.FINISHED;
        revealDeaths();
    }

    // ----- the Roam ----------------------------------------------------------------------

    /**
     * Accepts a client-walked position when it is reachable from the last accepted one. A
     * refused move is not an error: the Player's correction counter moves on instead, and
     * their next field state carries the position the server kept.
     */
    public boolean move(String playerId, double x, double y, String facing, long now) {
        Participant walker = participants.get(playerId);
        if (phase != GamePhase.ROAM || walker == null || walker.status() == ParticipantStatus.LEFT) return false;
        double elapsed = Math.min(1_000, Math.max(50, now - walker.lastMoveAt));
        double allowance = SPEED * elapsed / 1_000 * 1.4 + 24;
        boolean reachable = walker.distanceTo(x, y) <= allowance
                && RoomRules.walkable(x, y) && RoomRules.walkable((walker.x + x) / 2, (walker.y + y) / 2);
        if (!reachable) {
            walker.correction++;
            return false;
        }
        walker.x = x;
        walker.y = y;
        walker.facing = facing;
        walker.lastMoveAt = now;
        return true;
    }

    /** Crowding for Villagers; everything else in the Roam is derived from its timestamps. */
    public void tick(long now) {
        if (phase != GamePhase.ROAM) return;
        long elapsed = Math.min(500, Math.max(0, now - lastTickAt));
        lastTickAt = now;
        for (Participant villager : participants.values()) {
            if (!villager.isLiving() || villager.role() != Role.VILLAGER) continue;
            Participant nearest = null;
            for (Participant other : participants.values()) {
                if (other == villager || !other.isLiving() || !canSee(villager, other, now)) continue;
                if (villager.distanceTo(other) <= CROWD_RADIUS
                        && (nearest == null || villager.distanceTo(other) < villager.distanceTo(nearest))) nearest = other;
            }
            if (nearest == null) {
                villager.crowdedMs = Math.max(0, villager.crowdedMs - elapsed * 3 / 2);
                continue;
            }
            villager.crowdedMs += elapsed;
            if (villager.crowdedMs >= CROWD_LIMIT) pushAway(villager, nearest, now);
        }
    }

    /** Moves a crowding Villager to the nearest open spot away from who they crowded. */
    private static void pushAway(Participant villager, Participant from, long now) {
        double away = Math.atan2(villager.y - from.y, villager.x - from.x);
        if (villager.distanceTo(from) < 1) away = -Math.PI / 2;
        for (int step = 0; step < 12; step++) {
            double turn = (step + 1) / 2 * (Math.PI / 6) * (step % 2 == 0 ? 1 : -1);
            double x = villager.x + Math.cos(away + turn) * PUSH_DISTANCE;
            double y = villager.y + Math.sin(away + turn) * PUSH_DISTANCE;
            if (RoomRules.walkable(x, y)) {
                villager.x = x;
                villager.y = y;
                break;
            }
        }
        villager.crowdedMs = 0;
        villager.lastMoveAt = now;
        villager.correction++;
    }

    public AbilityResult useAbility(String playerId, Ability ability, int submittedRound, String targetId, long now) {
        Participant actor = participants.get(playerId);
        if (phase != GamePhase.ROAM || submittedRound != round) return AbilityResult.rejected(WRONG_PHASE);
        if (actor == null || !actor.isLiving()) return AbilityResult.rejected(NOT_ALLOWED);
        // The Role comes first, so an ability that is not yours is refused wherever you aim it.
        Role needed = switch (ability) {
            case KILL, VANISH -> Role.MAFIA;
            case SHIELD -> Role.DOCTOR;
            case SCAN -> Role.SHERIFF;
            case REPORT, EMERGENCY -> actor.role();
        };
        if (actor.role() != needed) return AbilityResult.rejected(NOT_ALLOWED);
        Participant target = targetId == null ? null : participants.get(targetId);
        if (ability.targeted() && (target == null || target == actor || !target.isLiving() || !canSee(actor, target, now)))
            return AbilityResult.rejected(OUT_OF_REACH);
        return switch (ability) {
            case KILL -> kill(actor, target, now);
            case VANISH -> vanish(actor, now);
            case SHIELD -> shield(actor, target, now);
            case SCAN -> scan(actor, target, now);
            case REPORT -> report(actor, now);
            case EMERGENCY -> emergency(actor, now);
        };
    }

    private AbilityResult kill(Participant killer, Participant victim, long now) {
        if (now < killer.primaryReadyAt) return AbilityResult.rejected(COOLING);
        if (victim.role() == Role.MAFIA || killer.distanceTo(victim) > KILL_RANGE) return AbilityResult.rejected(OUT_OF_REACH);
        killer.primaryReadyAt = now + KILL_COOLDOWN;
        for (Participant doctor : participants.values()) {
            if (doctor.isLiving() && victim.playerId().equals(doctor.shieldTarget) && now < doctor.shieldUntil) {
                doctor.shieldTarget = null;
                doctor.shieldUntil = 0;
                return new AbilityResult(SHIELD_BLOCKED, Effect.SHIELD_ABSORBED, victim.playerId());
            }
        }
        victim.setStatus(ParticipantStatus.ELIMINATED);
        victim.setKilledByMafia(true);
        victim.setDeathRevealed(false);
        victim.vanishedUntil = 0;
        victim.shieldTarget = null;
        deaths.add(victim.playerId());
        bodies.add(new Body(victim.playerId(), victim.x, victim.y));
        checkVictory();
        if (winner != null) {
            finish();
            return AbilityResult.of(Effect.GAME_WON, victim.playerId());
        }
        return AbilityResult.of(Effect.KILLED, victim.playerId());
    }

    private static AbilityResult vanish(Participant mafia, long now) {
        if (now < mafia.vanishReadyAt) return AbilityResult.rejected(COOLING);
        mafia.vanishedUntil = now + VANISH_DURATION;
        mafia.vanishReadyAt = now + VANISH_DURATION + VANISH_COOLDOWN;
        return AbilityResult.of(Effect.VANISHED, null);
    }

    private static AbilityResult shield(Participant doctor, Participant target, long now) {
        if (now < doctor.primaryReadyAt) return AbilityResult.rejected(COOLING);
        if (doctor.distanceTo(target) > SHIELD_RANGE) return AbilityResult.rejected(OUT_OF_REACH);
        doctor.shieldTarget = target.playerId();
        doctor.shieldUntil = now + SHIELD_DURATION;
        doctor.primaryReadyAt = now + SHIELD_COOLDOWN;
        return AbilityResult.of(Effect.SHIELDED, target.playerId());
    }

    private AbilityResult scan(Participant sheriff, Participant target, long now) {
        if (now < sheriff.primaryReadyAt) return AbilityResult.rejected(COOLING);
        if (sheriff.distanceTo(target) > SCAN_RANGE) return AbilityResult.rejected(OUT_OF_REACH);
        sheriff.primaryReadyAt = now + SCAN_COOLDOWN;
        sheriff.addInvestigation(new Participant.Investigation(round, target.playerId(), target.role() == Role.MAFIA));
        return AbilityResult.of(Effect.SCANNED, target.playerId());
    }

    private AbilityResult report(Participant reporter, long now) {
        Body found = bodies.stream().filter(body -> reporter.distanceTo(body.x(), body.y()) <= REPORT_RANGE)
                .findFirst().orElse(null);
        if (found == null) return AbilityResult.rejected(new Rejection("invalid_target", "There is no Body within reach."));
        callMeeting("report", reporter.playerId(), found.playerId(), now);
        return AbilityResult.of(Effect.MEETING_CALLED, found.playerId());
    }

    private AbilityResult emergency(Participant caller, long now) {
        if (caller.emergencyUsed) return AbilityResult.rejected(new Rejection("invalid_action", "You have already called your Emergency Meeting."));
        if (caller.distanceTo(RoomRules.BUTTON_X, RoomRules.BUTTON_Y) > EMERGENCY_RANGE)
            return AbilityResult.rejected(new Rejection("invalid_target", "Stand by the button in the Town Hall."));
        caller.emergencyUsed = true;
        callMeeting("emergency", caller.playerId(), null, now);
        return AbilityResult.of(Effect.MEETING_CALLED, null);
    }

    /**
     * What a Player's eyes allow. The living see living Players within their vision, except a
     * Vanished Mafia, whom only the Mafia still see. The dead see the whole town.
     */
    private static boolean canSee(Participant viewer, Participant other, long now) {
        if (other.status() == ParticipantStatus.LEFT) return false;
        if (other == viewer || !viewer.isLiving()) return true;
        if (!other.isLiving()) return false;
        if (other.vanished(now) && viewer.role() != Role.MAFIA) return false;
        return viewer.distanceTo(other) <= VISION;
    }

    /** Every Avatar this recipient may see right now, themselves included. */
    public List<FieldPlayer> fieldPlayersFor(String viewerId, long now) {
        Participant viewer = participants.get(viewerId);
        return participants.values().stream().filter(other -> canSee(viewer, other, now))
                .map(other -> new FieldPlayer(other.playerId(), other.x, other.y, other.facing,
                        !other.isLiving(), other.vanished(now)))
                .toList();
    }

    public List<Body> bodiesFor(String viewerId) {
        Participant viewer = participants.get(viewerId);
        return bodies.stream().filter(body -> !viewer.isLiving() || viewer.distanceTo(body.x(), body.y()) <= VISION).toList();
    }

    /**
     * A Roam death stays hidden from the living Village until a Meeting reveals it. The
     * victim, the Mafia and the dead already know.
     */
    public ParticipantStatus statusSeenBy(Participant member, String viewerId) {
        Participant viewer = participants.get(viewerId);
        if (member.deathRevealed() || member == viewer || viewer == null) return member.status();
        if (!viewer.isLiving() || viewer.role() == Role.MAFIA) return member.status();
        return ParticipantStatus.LIVING;
    }

    // ----- Meetings and chat -------------------------------------------------------------

    /** A null target is an explicit Skip, which locks exactly like a ballot for a Player. */
    public Rejection submitBallot(String voterId, int submittedRound, String targetPlayerId) {
        Participant voter = participants.get(voterId);
        if (phase != GamePhase.VOTING || submittedRound != round) return WRONG_PHASE;
        if (voter == null || !voter.isLiving()) return NOT_ALLOWED;
        if (ballots.containsKey(voterId)) return new Rejection("already_submitted", "Your ballot is already final.");
        if (targetPlayerId != null) {
            Participant target = participants.get(targetPlayerId);
            if (target == null || !target.isLiving()) return new Rejection("invalid_target", "Choose a living Player.");
        }
        ballots.put(voterId, targetPlayerId);
        return null;
    }

    public Rejection submitChat(String senderId, ChatChannel channel, String text) {
        Participant sender = participants.get(senderId);
        if (sender == null || !sender.isLiving()) return NOT_ALLOWED;
        if (channel == ChatChannel.MAFIA) {
            if (sender.role() != Role.MAFIA) return NOT_ALLOWED;
            if (phase != GamePhase.ROAM) return WRONG_PHASE;
            chat.add(new ChatEntry(ChatChannel.MAFIA, round, senderId, sender.displayName(), text, livingMafiaIds()));
            return null;
        }
        if (phase != GamePhase.DISCUSSION && phase != GamePhase.VOTING) return WRONG_PHASE;
        chat.add(new ChatEntry(ChatChannel.PUBLIC, round, senderId, sender.displayName(), text, null));
        return null;
    }

    /** The entry just accepted, for delivery to exactly the recipients it records. */
    public ChatEntry lastChatEntry() { return chat.get(chat.size() - 1); }

    public List<ChatEntry> historyFor(String playerId) {
        return chat.stream().filter(entry -> entry.isReadableBy(playerId)).toList();
    }

    // ----- lifecycle transitions ---------------------------------------------------------

    /**
     * Leave or recovery expiry. A living participant stops counting toward the Game; an
     * already eliminated one only stops being a current Room Member.
     */
    public void forfeit(String playerId) {
        // A finished Game is final: later departures end Memberships, never the result.
        if (phase == GamePhase.FINISHED) return;
        Participant participant = participants.get(playerId);
        if (participant == null || participant.status() != ParticipantStatus.LIVING) return;
        // An Elimination may already have decided the Game; its result phase still runs in full.
        boolean undecided = winner == null;
        participant.setStatus(ParticipantStatus.LEFT);
        ballots.remove(playerId);
        participant.shieldTarget = null;
        checkVictory();
        if (undecided && winner != null) finish();
    }

    private void resolveMeeting() {
        long living = livingCount();
        Map<String, Integer> tally = new LinkedHashMap<>();
        List<Ballot> disclosed = new ArrayList<>();
        for (Map.Entry<String, String> ballot : ballots.entrySet()) {
            // Every ballot is disclosed, Skips included, whether or not it can still count.
            disclosed.add(new Ballot(ballot.getKey(), ballot.getValue()));
            Participant target = ballot.getValue() == null ? null : participants.get(ballot.getValue());
            if (target != null && target.isLiving()) tally.merge(ballot.getValue(), 1, Integer::sum);
        }
        revealedBallots = disclosed;
        // Strictly more than half of the living. A plurality is never enough.
        String eliminatedId = tally.entrySet().stream().filter(entry -> entry.getValue() * 2L > living)
                .map(Map.Entry::getKey).findFirst().orElse(null);
        Boolean eliminatedMafia = null;
        if (eliminatedId != null) {
            Participant eliminated = participants.get(eliminatedId);
            eliminated.setStatus(ParticipantStatus.ELIMINATED);
            eliminatedMafia = eliminated.role() == Role.MAFIA;
        }
        outcome = new Outcome("meeting", null, null, List.of(), eliminatedId, eliminatedMafia);
        checkVictory();
    }

    private void checkVictory() {
        if (winner != null) return;
        long livingMafia = livingMafia().count();
        long livingVillage = livingCount() - livingMafia;
        if (livingMafia == 0) winner = Faction.VILLAGE;
        else if (livingMafia >= livingVillage) winner = Faction.MAFIA;
    }

    private long livingCount() {
        return participants.values().stream().filter(Participant::isLiving).count();
    }

    private Set<String> livingMafiaIds() {
        return livingMafia().map(Participant::playerId)
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
    }

    private java.util.stream.Stream<Participant> livingMafia() {
        return participants.values().stream().filter(member -> member.isLiving() && member.role() == Role.MAFIA);
    }

    // ----- authorized views --------------------------------------------------------------

    public List<String> mafiaTeam() {
        return participants.values().stream().filter(member -> member.role() == Role.MAFIA)
                .map(Participant::playerId).toList();
    }

    public boolean hasBallot(String playerId) { return ballots.containsKey(playerId); }
    public String acceptedBallot(String playerId) { return ballots.get(playerId); }

    /** Private timers for one Participant's own ability bar; null where the Role has none. */
    public record OwnField(double x, double y, String facing, int correction, Double crowding,
                           Long primaryCooldownMs, Long vanishCooldownMs, Long vanishedMs,
                           String shieldTargetPlayerId, Long shieldMs, boolean emergencyAvailable) {}

    public OwnField ownFieldOf(String playerId, long now) {
        Participant self = participants.get(playerId);
        boolean living = self.isLiving();
        boolean mafia = living && self.role() == Role.MAFIA;
        boolean doctor = living && self.role() == Role.DOCTOR;
        boolean hasPrimary = living && self.role() != Role.VILLAGER;
        boolean shielding = doctor && self.shieldTarget != null && now < self.shieldUntil;
        return new OwnField(self.x, self.y, self.facing, self.correction,
                living && self.role() == Role.VILLAGER ? Math.min(1.0, self.crowdedMs / (double) CROWD_LIMIT) : null,
                hasPrimary ? Math.max(0, self.primaryReadyAt - now) : null,
                mafia ? Math.max(0, self.vanishReadyAt - now) : null,
                mafia ? Math.max(0, self.vanishedUntil - now) : null,
                shielding ? self.shieldTarget : null,
                doctor ? (shielding ? self.shieldUntil - now : 0L) : null,
                living && !self.emergencyUsed);
    }
}
