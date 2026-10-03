package dev.lpa.pu_go.game;

import dev.lpa.pu_go.room.RoomRules;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static dev.lpa.pu_go.game.FieldRules.*;

/**
 * The server-owned contest inside one started Room. Every transition here runs under that
 * Room's serialization, so deadlines, movement, Forfeits and recovery share one order.
 */
public final class Game {
    /** A refused submission, reported to its sender only. */
    public record Rejection(String code, String message) {}

    /**
     * The public result of the phase being presented. Townhall names Night deaths or a Meeting verdict.
     * Caller and Body fields remain null in this coordinated v1 release.
     */
    public record Outcome(String kind, String callerPlayerId, String bodyPlayerId, List<String> deaths,
                          String eliminatedPlayerId, Role eliminatedRole) {}

    /** One disclosed Meeting ballot. A null target is an explicit Skip. */
    public record Ballot(String voterPlayerId, String targetPlayerId) {}

    /** One Avatar a recipient is allowed to see on the field. */
    public record FieldPlayer(String playerId, double x, double y, String facing, boolean ghost) {}

    private static final Rejection WRONG_PHASE = new Rejection("invalid_phase", "That action does not belong to this phase.");
    private static final Rejection NOT_ALLOWED = new Rejection("invalid_action", "You cannot take that action.");

    private final boolean practice;
    private final TaskBoard tasks;
    private final Map<String, Participant> participants = new LinkedHashMap<>();
    private final Map<String, String> ballots = new LinkedHashMap<>();
    private final Map<String, String> nightChoices = new LinkedHashMap<>();
    private final List<ChatEntry> chat = new ArrayList<>();
    private GamePhase phase = GamePhase.ROLE_REVEAL;
    private int round;
    private long phaseEndsAt;
    private Faction winner;
    private List<Ballot> revealedBallots;
    private Outcome outcome;

    public Game(List<Participant> roster, long startedAt) {
        this(roster, startedAt, false);
    }

    public static Game soloPractice(Participant host, long startedAt) {
        return new Game(List.of(host), startedAt, true);
    }

    private Game(List<Participant> roster, long startedAt, boolean practice) {
        this.practice = practice;
        tasks = new TaskBoard(roster, practice);
        for (Participant participant : roster) {
            participants.put(participant.playerId(), participant);
            placeAtSeat(participant, startedAt);
        }
        phaseEndsAt = startedAt + GamePhase.ROLE_REVEAL.durationMillis();
        if (practice) beginDay(startedAt);
    }

    public record PracticeTarget(String targetId, String displayName, Role role) {}
    private static final List<PracticeTarget> PRACTICE_TARGETS = List.of(
            new PracticeTarget("practice-mafia", "Practice Mafia", Role.MAFIA),
            new PracticeTarget("practice-villager", "Practice Villager", Role.VILLAGER),
            new PracticeTarget("practice-doctor", "Practice Doctor", Role.DOCTOR));
    public List<PracticeTarget> practiceTargets() { return PRACTICE_TARGETS; }
    private PracticeTarget practiceTarget(String id) {
        return PRACTICE_TARGETS.stream().filter(target -> target.targetId().equals(id)).findFirst().orElse(null);
    }
    public Rejection previewRole(String playerId, Role role) {
        if (!practice) return NOT_ALLOWED;
        participants.get(playerId).previewRole(role);
        nightChoices.clear(); ballots.clear(); tasks.closeAll();
        return null;
    }

    public boolean isPractice() { return practice; }

    public GamePhase phase() { return phase; }
    public int round() { return round; }
    public Faction winner() { return winner; }
    public Outcome outcome() { return outcome; }
    public List<Ballot> revealedBallots() { return revealedBallots == null ? null : List.copyOf(revealedBallots); }
    public List<Participant> roster() { return List.copyOf(participants.values()); }
    public Participant participant(String playerId) { return participants.get(playerId); }
    public boolean isFinished() { return phase == GamePhase.FINISHED; }
    public boolean hasField() { return phase == GamePhase.DAY || phase == GamePhase.NIGHT; }

    public Long remainingMillis(long now) {
        return practice || phase == GamePhase.FINISHED ? null : Math.max(0, phaseEndsAt - now);
    }

    /** The competitive phase deadline; null throughout practice and after the Game finishes. */
    public Long phaseDeadline() { return practice || phase == GamePhase.FINISHED ? null : phaseEndsAt; }

    /** Advances exactly one expired phase. Callers repeat while a deadline remains due. */
    public void advance() {
        advanceAt(phaseEndsAt);
    }

    /** Practice resets movement timing at the actual preview transition, without a deadline. */
    public void advancePractice(long now) {
        if (!practice) throw new IllegalStateException("Only practice can advance manually");
        advanceAt(now);
    }

    private void advanceAt(long boundary) {
        if (phase == GamePhase.FINISHED) return;
        switch (phase) {
            case ROLE_REVEAL -> beginDay(boundary);
            case DAY -> enter(GamePhase.NIGHT, boundary);
            case NIGHT -> beginTownhall(boundary);
            case DISCUSSION -> enter(GamePhase.VOTING, boundary);
            case VOTING -> {
                resolveMeeting();
                enter(GamePhase.VOTING_RESULT, boundary);
            }
            case VOTING_RESULT -> {
                if (winner != null) finish();
                else beginDay(boundary);
            }
            case FINISHED -> { }
        }
    }

    private void beginDay(long at) {
        round++;
        ballots.clear();
        nightChoices.clear();
        revealedBallots = null;
        outcome = null;
        for (Participant member : participants.values()) placeAtSeat(member, at);
        enter(GamePhase.DAY, at);
    }

    /** Everyone stands up at their own Seat, so a Day always begins in the Town Square. */
    private static void placeAtSeat(Participant member, long at) {
        member.x = RoomRules.seatX(member.seat());
        member.y = RoomRules.seatY(member.seat());
        member.facing = RoomRules.seatFacing(member.seat());
        member.lastMoveAt = at;
        member.correction++;
    }


    private void beginTownhall(long at) {
        if (practice) {
            Participant host = roster().get(0);
            PracticeTarget target = practiceTarget(nightChoices.get(host.playerId()));
            if (host.role() == Role.SHERIFF && target != null)
                host.addInvestigation(new Participant.Investigation(round, target.targetId(), target.role() == Role.MAFIA));
            outcome = new Outcome("night", null, null, host.role() == Role.MAFIA && target != null ? List.of(target.targetId()) : List.of(), null, null);
            nightChoices.clear();
            placeAtSeat(host, at); enter(GamePhase.DISCUSSION, at);
            return;
        }
        // Resolve every timely investigation before changing any Participant's living status.
        for (Participant sheriff : participants.values()) {
            if (!sheriff.isLiving() || sheriff.role() != Role.SHERIFF) continue;
            Participant target = participants.get(nightChoices.get(sheriff.playerId()));
            if (target != null && target.isLiving())
                sheriff.addInvestigation(new Participant.Investigation(round, target.playerId(), target.role() == Role.MAFIA));
        }
        Map<String, Integer> tally = new LinkedHashMap<>();
        livingMafia().forEach(member -> {
            Participant target = participants.get(nightChoices.get(member.playerId()));
            if (target != null && target.isLiving() && target.role() != Role.MAFIA)
                tally.merge(target.playerId(), 1, Integer::sum);
        });
        long mafia = livingMafia().count();
        String chosenVictimId = tally.entrySet().stream().filter(entry -> entry.getValue() * 2L > mafia)
                .map(Map.Entry::getKey).findFirst().orElse(null);
        boolean protectedVictim = chosenVictimId != null && participants.values().stream()
                .anyMatch(member -> member.isLiving() && member.role() == Role.DOCTOR
                        && chosenVictimId.equals(nightChoices.get(member.playerId())));
        String victimId = protectedVictim ? null : chosenVictimId;
        if (victimId != null) {
            Participant victim = participants.get(victimId);
            victim.setStatus(ParticipantStatus.ELIMINATED);
            victim.setKilledByMafia(true);
        }
        outcome = new Outcome("night", null, null, victimId == null ? List.of() : List.of(victimId), null, null);
        nightChoices.clear();
        for (Participant member : participants.values()) placeAtSeat(member, at);
        enter(GamePhase.DISCUSSION, at);
        checkVictory();
        if (winner != null) finish();
    }

    private void enter(GamePhase next, long boundary) {
        tasks.closeAll();
        phase = next;
        phaseEndsAt = boundary + next.durationMillis();
    }

    private void finish() {
        tasks.closeAll();
        phase = GamePhase.FINISHED;
    }

    // ----- the Day ----------------------------------------------------------------------

    /**
     * Accepts a client-walked position when it is reachable from the last accepted one. A
     * refused move is not an error: the Player's correction counter moves on instead, and
     * their next field state carries the position the server kept.
     */
    public boolean move(String playerId, double x, double y, String facing, long now) {
        Participant walker = participants.get(playerId);
        if (phase != GamePhase.DAY || walker == null || walker.status() == ParticipantStatus.LEFT) return false;
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
        tasks.moved(walker);
        return true;
    }

    /** The living see living Participants within Vision; the eliminated see the town. */
    private static boolean canSee(Participant viewer, Participant other) {
        if (other.status() == ParticipantStatus.LEFT) return false;
        if (other == viewer || !viewer.isLiving()) return true;
        return other.isLiving() && RoomRules.areaAt(viewer.x, viewer.y).equals(RoomRules.areaAt(other.x, other.y))
                && viewer.distanceTo(other) <= DAY_VISION;
    }

    /** Every Avatar this recipient may see right now, themselves included. */
    public List<FieldPlayer> fieldPlayersFor(String viewerId) {
        Participant viewer = participants.get(viewerId);
        return participants.values().stream().filter(other -> canSee(viewer, other))
                .map(other -> new FieldPlayer(other.playerId(), other.x, other.y, other.facing,
                        !other.isLiving()))
                .toList();
    }

    public TaskBoard.View tasksFor(String playerId, long now) { return tasks.view(playerId, participant(playerId).role(), now); }

    public Rejection openTask(String playerId, int submittedRound, String taskId, long now) {
        if (phase != GamePhase.DAY || submittedRound != round) return WRONG_PHASE;
        Participant actor = participants.get(playerId);
        if (actor == null || actor.status() == ParticipantStatus.LEFT) return NOT_ALLOWED;
        return tasks.open(actor, taskId, now);
    }

    public Rejection taskStep(String playerId, int submittedRound, String taskId, int step, int value, long now) {
        if (phase != GamePhase.DAY || submittedRound != round) return WRONG_PHASE;
        Participant actor = participants.get(playerId);
        if (actor == null || actor.status() == ParticipantStatus.LEFT) return NOT_ALLOWED;
        Rejection rejection = tasks.step(actor, taskId, step, value, now);
        if (rejection == null) {
            checkVictory();
            if (winner != null) finish();
        }
        return rejection;
    }

    public void closeTask(String playerId) { tasks.close(playerId); }

    // ----- Meetings and chat -------------------------------------------------------------

    /** Editable private choices never advance Night's fixed deadline. Null withdraws a choice. */
    public Rejection submitNightChoice(String playerId, int submittedRound, String targetPlayerId) {
        if (phase != GamePhase.NIGHT || submittedRound != round) return WRONG_PHASE;
        Participant actor = participants.get(playerId);
        if (actor == null || !actor.isLiving() || actor.role() == Role.VILLAGER) return NOT_ALLOWED;
        if (targetPlayerId != null && practice) {
            PracticeTarget target = practiceTarget(targetPlayerId);
            boolean selfProtection = actor.role() == Role.DOCTOR && targetPlayerId.equals(playerId);
            if (!selfProtection && (target == null || actor.role() == Role.MAFIA && target.role() == Role.MAFIA))
                return new Rejection("invalid_target", "Choose an eligible practice target.");
            nightChoices.put(playerId, targetPlayerId);
            return null;
        }
        if (targetPlayerId != null) {
            Participant target = participants.get(targetPlayerId);
            if (target == null || !target.isLiving() || actor.role() == Role.MAFIA && target.role() == Role.MAFIA
                    || actor.role() == Role.SHERIFF && target == actor)
                return new Rejection("invalid_target", actor.role() == Role.MAFIA
                        ? "Choose a living Village Player." : actor.role() == Role.SHERIFF
                        ? "Choose another living Player." : "Choose a living Player.");
            nightChoices.put(playerId, targetPlayerId);
        } else nightChoices.remove(playerId);
        return null;
    }

    public String nightChoiceFor(String playerId) { return nightChoices.get(playerId); }

    /** A null target is an explicit Skip, which locks exactly like a ballot for a Player. */
    public Rejection submitBallot(String voterId, int submittedRound, String targetPlayerId) {
        Participant voter = participants.get(voterId);
        if (phase != GamePhase.VOTING || submittedRound != round) return WRONG_PHASE;
        if (voter == null || !voter.isLiving()) return NOT_ALLOWED;
        if (ballots.containsKey(voterId)) return new Rejection("already_submitted", "Your ballot is already final.");
        if (targetPlayerId != null && practice) {
            if (practiceTarget(targetPlayerId) == null) return new Rejection("invalid_target", "Choose a practice target.");
        } else if (targetPlayerId != null) {
            Participant target = participants.get(targetPlayerId);
            if (target == null || !target.isLiving()) return new Rejection("invalid_target", "Choose a living Player.");
        }
        ballots.put(voterId, targetPlayerId);
        return null;
    }

    public Rejection submitChat(String senderId, ChatChannel channel, String text) {
        Participant sender = participants.get(senderId);
        if (sender == null || !sender.isLiving()) return NOT_ALLOWED;
        if (phase != GamePhase.DAY && phase != GamePhase.DISCUSSION && phase != GamePhase.VOTING) return WRONG_PHASE;
        if (channel != ChatChannel.PUBLIC) return NOT_ALLOWED;
        java.util.Set<String> recipients = participants.values().stream()
                .filter(member -> member.status() != ParticipantStatus.LEFT)
                .filter(member -> phase != GamePhase.DAY || member.isLiving()
                        && sender.distanceTo(member) <= HEARING_RANGE
                        && RoomRules.areaAt(sender.x, sender.y).equals(RoomRules.areaAt(member.x, member.y)))
                .map(Participant::playerId).collect(java.util.stream.Collectors.toSet());
        chat.add(new ChatEntry(ChatChannel.PUBLIC, round, senderId, sender.displayName(), text, recipients));
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
        if (participant == null || participant.status() == ParticipantStatus.LEFT) return;
        // An Elimination may already have decided the Game; its result phase still runs in full.
        boolean undecided = winner == null;
        participant.setStatus(ParticipantStatus.LEFT);
        tasks.transfer(playerId, roster());
        ballots.remove(playerId);
        nightChoices.remove(playerId);
        checkVictory();
        if (undecided && winner != null) finish();
    }

    private void resolveMeeting() {
        if (practice) {
            Participant host = roster().get(0);
            PracticeTarget target = practiceTarget(ballots.get(host.playerId()));
            revealedBallots = hasBallot(host.playerId()) ? List.of(new Ballot(host.playerId(), acceptedBallot(host.playerId()))) : List.of();
            outcome = new Outcome("meeting", null, null, List.of(), target == null ? null : target.targetId(), target == null ? null : target.role());
            return;
        }
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
        Role eliminatedRole = null;
        if (eliminatedId != null) {
            Participant eliminated = participants.get(eliminatedId);
            eliminated.setStatus(ParticipantStatus.ELIMINATED);
            eliminatedRole = eliminated.role();
        }
        outcome = new Outcome("meeting", null, null, List.of(), eliminatedId, eliminatedRole);
        checkVictory();
    }

    private void checkVictory() {
        if (practice || winner != null) return;
        long livingMafia = livingMafia().count();
        long livingVillage = livingCount() - livingMafia;
        if (tasks.total() > 0 && tasks.completed() == tasks.total() || livingMafia == 0) winner = Faction.VILLAGE;
        else if (livingMafia >= livingVillage) winner = Faction.MAFIA;
    }

    private long livingCount() {
        return participants.values().stream().filter(Participant::isLiving).count();
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

    /** The recipient's authoritative position and correction counter. */
    public record OwnField(double x, double y, String facing, int correction) {}

    public OwnField ownFieldOf(String playerId) {
        Participant self = participants.get(playerId);
        return new OwnField(self.x, self.y, self.facing, self.correction);
    }
}
