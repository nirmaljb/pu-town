package dev.lpa.pu_go.game;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The server-owned contest inside one started Room. Every transition here runs under that
 * Room's serialization, so deadlines, submissions, Forfeits and recovery share one order.
 */
public final class Game {
    /** A refused submission, reported to its sender only. */
    public record Rejection(String code, String message) {}

    /** The public result of the phase currently being presented. */
    public record Outcome(String kind, String victimPlayerId, String eliminatedPlayerId, Boolean eliminatedMafia) {}

    /** One disclosed Meeting ballot. A null target is an explicit Skip. */
    public record Ballot(String voterPlayerId, String targetPlayerId) {}

    private static final Rejection WRONG_PHASE = new Rejection("invalid_phase", "That action does not belong to this phase.");
    private static final Rejection NOT_ALLOWED = new Rejection("invalid_action", "You cannot take that action.");
    private static final Rejection LOCKED = new Rejection("already_submitted", "Your choice for this phase is already final.");

    private final Map<String, Participant> participants = new LinkedHashMap<>();
    private final Map<String, String> mafiaVotes = new LinkedHashMap<>();
    private final Map<String, String> ballots = new LinkedHashMap<>();
    private final List<ChatEntry> chat = new ArrayList<>();
    private GamePhase phase = GamePhase.ROLE_REVEAL;
    private int round;
    private long phaseEndsAt;
    private Faction winner;
    private String protection;
    private String previousProtection;
    private String investigation;
    private List<Ballot> revealedBallots;
    private Outcome outcome;

    public Game(List<Participant> roster, long startedAt) {
        for (Participant participant : roster) participants.put(participant.playerId(), participant);
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
            case ROLE_REVEAL -> beginNight(boundary);
            case NIGHT -> {
                resolveNight();
                enter(GamePhase.NIGHT_RESULT, boundary);
            }
            case NIGHT_RESULT -> {
                if (winner != null) finish();
                else enter(GamePhase.DISCUSSION, boundary);
            }
            case DISCUSSION -> enter(GamePhase.VOTING, boundary);
            case VOTING -> {
                resolveMeeting();
                enter(GamePhase.VOTING_RESULT, boundary);
            }
            case VOTING_RESULT -> {
                if (winner != null) finish();
                else beginNight(boundary);
            }
            case FINISHED -> { }
        }
    }

    private void beginNight(long boundary) {
        round++;
        mafiaVotes.clear();
        ballots.clear();
        revealedBallots = null;
        protection = null;
        investigation = null;
        outcome = null;
        enter(GamePhase.NIGHT, boundary);
    }

    private void enter(GamePhase next, long boundary) {
        phase = next;
        phaseEndsAt = boundary + next.durationMillis();
    }

    private void finish() {
        phase = GamePhase.FINISHED;
        outcome = null;
    }

    // ----- submissions -------------------------------------------------------------------

    public Rejection submitMafiaVote(String voterId, int submittedRound, String targetPlayerId) {
        Participant voter = participants.get(voterId);
        if (phase != GamePhase.NIGHT || submittedRound != round) return WRONG_PHASE;
        if (voter == null || !voter.isLiving() || voter.role() != Role.MAFIA) return NOT_ALLOWED;
        if (mafiaVotes.containsKey(voterId)) return LOCKED;
        Participant target = participants.get(targetPlayerId);
        if (target == null || !target.isLiving() || target.role() == Role.MAFIA) {
            return new Rejection("invalid_target", "Choose a living Village Player.");
        }
        mafiaVotes.put(voterId, targetPlayerId);
        return null;
    }

    public Rejection submitProtection(String doctorId, int submittedRound, String targetPlayerId) {
        Participant doctor = participants.get(doctorId);
        if (phase != GamePhase.NIGHT || submittedRound != round) return WRONG_PHASE;
        if (doctor == null || !doctor.isLiving() || doctor.role() != Role.DOCTOR) return NOT_ALLOWED;
        if (protection != null) return LOCKED;
        Participant target = participants.get(targetPlayerId);
        if (target == null || !target.isLiving()) return new Rejection("invalid_target", "Choose a living Player.");
        if (targetPlayerId.equals(previousProtection)) {
            return new Rejection("invalid_target", "You protected that Player last Night.");
        }
        protection = targetPlayerId;
        return null;
    }

    public Rejection submitInvestigation(String sheriffId, int submittedRound, String targetPlayerId) {
        Participant sheriff = participants.get(sheriffId);
        if (phase != GamePhase.NIGHT || submittedRound != round) return WRONG_PHASE;
        if (sheriff == null || !sheriff.isLiving() || sheriff.role() != Role.SHERIFF) return NOT_ALLOWED;
        if (investigation != null) return LOCKED;
        Participant target = participants.get(targetPlayerId);
        if (target == null || !target.isLiving() || targetPlayerId.equals(sheriffId)) {
            return new Rejection("invalid_target", "Choose another living Player.");
        }
        investigation = targetPlayerId;
        return null;
    }

    /** A null target is an explicit Skip, which locks exactly like a ballot for a Player. */
    public Rejection submitBallot(String voterId, int submittedRound, String targetPlayerId) {
        Participant voter = participants.get(voterId);
        if (phase != GamePhase.VOTING || submittedRound != round) return WRONG_PHASE;
        if (voter == null || !voter.isLiving()) return NOT_ALLOWED;
        if (ballots.containsKey(voterId)) return LOCKED;
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
            if (phase != GamePhase.NIGHT) return WRONG_PHASE;
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
        // The departing actor's own pending choices go; choices aimed at them stay locked
        // and simply become ineffective at resolution.
        mafiaVotes.remove(playerId);
        ballots.remove(playerId);
        if (participant.role() == Role.DOCTOR) protection = null;
        if (participant.role() == Role.SHERIFF) investigation = null;
        checkVictory();
        if (undecided && winner != null) finish();
    }

    // ----- resolution --------------------------------------------------------------------

    private void resolveNight() {
        String attacked = mafiaMajorityTarget();
        boolean prevented = attacked != null && attacked.equals(protection);
        String victimId = prevented ? null : attacked;
        Participant sheriff = livingWithRole(Role.SHERIFF);
        Participant investigated = investigation == null ? null : participants.get(investigation);
        if (sheriff != null && investigated != null && investigated.isLiving()
                && !sheriff.playerId().equals(victimId)) {
            sheriff.addInvestigation(new Participant.Investigation(round, investigation, investigated.role() == Role.MAFIA));
        }
        if (victimId != null) {
            Participant victim = participants.get(victimId);
            victim.setStatus(ParticipantStatus.ELIMINATED);
            victim.setKilledByMafia(true);
        }
        previousProtection = protection;
        outcome = new Outcome("night", victimId, null, null);
        checkVictory();
    }

    private String mafiaMajorityTarget() {
        long livingMafia = livingMafiaCount();
        if (livingMafia == 0) return null;
        Map<String, Integer> tally = new LinkedHashMap<>();
        for (Map.Entry<String, String> vote : mafiaVotes.entrySet()) {
            Participant voter = participants.get(vote.getKey());
            // A Forfeited voter's vote no longer counts, as their own voice has gone.
            if (voter != null && voter.isLiving()) countIfLiving(tally, vote.getValue());
        }
        return majorityOf(tally, livingMafia);
    }

    /** A choice aimed at a Player who is no longer living cannot take effect. */
    private void countIfLiving(Map<String, Integer> tally, String targetPlayerId) {
        Participant target = targetPlayerId == null ? null : participants.get(targetPlayerId);
        if (target != null && target.isLiving()) tally.merge(targetPlayerId, 1, Integer::sum);
    }

    /** Strictly more than half of the given electorate. A plurality is never enough. */
    private static String majorityOf(Map<String, Integer> tally, long electorate) {
        return tally.entrySet().stream().filter(entry -> entry.getValue() * 2L > electorate)
                .map(Map.Entry::getKey).findFirst().orElse(null);
    }

    private void resolveMeeting() {
        long living = livingCount();
        Map<String, Integer> tally = new LinkedHashMap<>();
        List<Ballot> disclosed = new ArrayList<>();
        for (Map.Entry<String, String> ballot : ballots.entrySet()) {
            // Every ballot is disclosed, Skips included, whether or not it can still count.
            disclosed.add(new Ballot(ballot.getKey(), ballot.getValue()));
            countIfLiving(tally, ballot.getValue());
        }
        revealedBallots = disclosed;
        String eliminatedId = majorityOf(tally, living);
        Boolean eliminatedMafia = null;
        if (eliminatedId != null) {
            Participant eliminated = participants.get(eliminatedId);
            eliminated.setStatus(ParticipantStatus.ELIMINATED);
            eliminatedMafia = eliminated.role() == Role.MAFIA;
        }
        outcome = new Outcome("meeting", null, eliminatedId, eliminatedMafia);
        checkVictory();
    }

    private void checkVictory() {
        if (winner != null) return;
        long livingMafia = livingMafiaCount();
        long livingVillage = livingCount() - livingMafia;
        if (livingMafia == 0) winner = Faction.VILLAGE;
        else if (livingMafia >= livingVillage) winner = Faction.MAFIA;
    }

    private long livingCount() {
        return participants.values().stream().filter(Participant::isLiving).count();
    }

    private Participant livingWithRole(Role role) {
        return participants.values().stream().filter(member -> member.isLiving() && member.role() == role)
                .findFirst().orElse(null);
    }

    private Set<String> livingMafiaIds() {
        return livingMafia().map(Participant::playerId)
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
    }

    private long livingMafiaCount() { return livingMafia().count(); }

    private java.util.stream.Stream<Participant> livingMafia() {
        return participants.values().stream().filter(member -> member.isLiving() && member.role() == Role.MAFIA);
    }

    // ----- authorized views --------------------------------------------------------------

    public List<String> mafiaTeam() {
        return participants.values().stream().filter(member -> member.role() == Role.MAFIA)
                .map(Participant::playerId).toList();
    }

    /** Accepted Mafia votes, shared only with living Mafia. */
    public List<Ballot> mafiaVotesView() {
        return mafiaVotes.entrySet().stream().map(entry -> new Ballot(entry.getKey(), entry.getValue())).toList();
    }

    public String acceptedMafiaVote(String playerId) { return mafiaVotes.get(playerId); }
    public String acceptedProtection() { return protection; }
    public String blockedProtection() { return previousProtection; }
    public String acceptedInvestigation() { return investigation; }
    public boolean hasBallot(String playerId) { return ballots.containsKey(playerId); }
    public String acceptedBallot(String playerId) { return ballots.get(playerId); }
}
