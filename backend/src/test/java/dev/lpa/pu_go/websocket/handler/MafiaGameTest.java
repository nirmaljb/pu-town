package dev.lpa.pu_go.websocket.handler;

import dev.lpa.pu_go.avatar.AvatarCollection;
import dev.lpa.pu_go.avatar.AvatarPreset;
import dev.lpa.pu_go.game.Role;
import dev.lpa.pu_go.room.RoomManager;
import dev.lpa.pu_go.room.RoomRules;
import dev.lpa.pu_go.websocket.support.RecordingWebSocketSession;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.UnaryOperator;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The ten-Player Mafia Game, exercised through real protocol requests and a controlled clock.
 * Seats 0–2 are Mafia, 3–7 Villagers, 8 the Doctor and 9 the Sheriff unless a test says otherwise.
 */
class MafiaGameTest {
    private static final long REVEAL = 8_000;
    private static final long NIGHT = 90_000;
    private static final long NIGHT_RESULT = 6_000;
    private static final long DISCUSSION = 120_000;
    private static final long VOTING = 30_000;
    private static final long VOTING_RESULT = 6_000;

    private static final AvatarCollection COLLECTION = new AvatarCollection("test0001",
            java.util.stream.IntStream.rangeClosed(1, 10)
                    .mapToObj(number -> new AvatarPreset("townsperson-" + number, "Name " + number,
                            "data:image/png;base64,iVBORw0KGgo=", "data:image/png;base64,iVBORw0KGgo="))
                    .toList());

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AtomicInteger playerIds = new AtomicInteger();
    private final AtomicLong milliseconds = new AtomicLong();
    private final AtomicReference<UnaryOperator<List<Role>>> assignment = new AtomicReference<>(UnaryOperator.identity());
    private final GameWebSocketHandler handler = new GameWebSocketHandler(
            new RoomManager(milliseconds::get, () -> COLLECTION), Runnable::run,
            () -> "player-" + playerIds.incrementAndGet(), roles -> assignment.get().apply(roles));

    private final List<RecordingWebSocketSession> table = new ArrayList<>();
    private String code;

    // ----- ticket 13: Start, Roles and the private reveal -------------------------------

    @Test
    void startNeedsTenConnectedReadyPlayersAndTheHostAndNeverStartsPartially() throws Exception {
        var host = connect("gate-0");
        send(host, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Host\"}");
        code = latest(host).path("roomId").asText();
        table.add(host);
        send(host, "{\"version\":1,\"type\":\"start_game\"}");
        assertEquals("start_blocked", latest(host).path("code").asText());
        assertTrue(latest(host).path("message").asText().contains("10 Players"));
        for (int seat = 1; seat < RoomRules.CAPACITY; seat++) {
            var guest = connect("gate-" + seat);
            join(guest, code);
            table.add(guest);
        }
        send(table.get(3), "{\"version\":1,\"type\":\"start_game\"}");
        assertEquals("not_host", latest(table.get(3)).path("code").asText());
        send(host, "{\"version\":1,\"type\":\"start_game\"}");
        assertEquals("Every Player must be Ready to start.", latest(host).path("message").asText());
        for (var member : table) send(member, "{\"version\":1,\"type\":\"set_ready\",\"ready\":true}");
        handler.afterConnectionClosed(table.get(7), CloseStatus.NORMAL);
        send(host, "{\"version\":1,\"type\":\"start_game\"}");
        assertEquals("Every Player must be connected to start.", latest(host).path("message").asText());
        // No rejection left a partially started Room behind.
        assertEquals("lobby", latestOfType(host, "room_state").path("phase").asText());
        assertTrue(table.get(0).payloads().stream().noneMatch(payload -> payload.contains("\"game_state\"")));
    }

    @Test
    void startDealsTheFixedDistributionIndependentlyOfSeatsAndCannotDealAgain() throws Exception {
        var seenBySeat = new java.util.HashSet<String>();
        var seed = new AtomicLong();
        // Shuffling is real; only the exact distribution is asserted, never a probability.
        assignment.set(roles -> {
            var shuffled = new ArrayList<>(roles);
            java.util.Collections.shuffle(shuffled, new java.util.Random(seed.getAndIncrement()));
            return shuffled;
        });
        for (int attempt = 0; attempt < 6; attempt++) {
            table.clear();
            startTable("deal-" + attempt);
            var counts = new java.util.EnumMap<Role, Integer>(Role.class);
            var bySeat = new StringBuilder();
            for (int seat = 0; seat < RoomRules.CAPACITY; seat++) {
                Role role = Role.valueOf(game(seat).path("self").path("role").asText().toUpperCase());
                counts.merge(role, 1, Integer::sum);
                bySeat.append(role.wireValue()).append(',');
                assertEquals(role.faction().wireValue(), game(seat).path("self").path("faction").asText());
            }
            assertEquals(3, counts.get(Role.MAFIA));
            assertEquals(5, counts.get(Role.VILLAGER));
            assertEquals(1, counts.get(Role.DOCTOR));
            assertEquals(1, counts.get(Role.SHERIFF));
            seenBySeat.add(bySeat.toString());
            send(table.get(0), "{\"version\":1,\"type\":\"start_game\"}");
            assertEquals("invalid_phase", latest(table.get(0)).path("code").asText());
        }
        // Seat order does not decide the deal.
        assertTrue(seenBySeat.size() > 1, "assignment repeated the same Seat-to-Role mapping every time");
    }

    @Test
    void theRoleRevealIsPrivateAndOnlyMafiaLearnTheirTeam() throws Exception {
        startTable("reveal");
        assertEquals("role_reveal", game(0).path("phase").asText());
        assertEquals(REVEAL, game(0).path("remainingMs").asLong());
        assertEquals(List.of("player-1", "player-2", "player-3"),
                names(game(1).path("self").path("mafiaTeam")));
        for (int seat = 3; seat < RoomRules.CAPACITY; seat++) {
            assertTrue(game(seat).path("self").path("mafiaTeam").isNull());
            assertNoHiddenRolesLeaked(table.get(seat));
        }
        assertEquals("villager", game(5).path("self").path("role").asText());
        assertEquals("doctor", game(8).path("self").path("role").asText());
        assertEquals("sheriff", game(9).path("self").path("role").asText());
    }

    @Test
    void startKeepsIdentityAppearanceAndSeatInTheGameRosterAndRejectsMovement() throws Exception {
        var host = connect("roster-0");
        send(host, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Host\"}");
        code = latest(host).path("roomId").asText();
        table.add(host);
        for (int seat = 1; seat < RoomRules.CAPACITY; seat++) {
            var guest = connect("roster-" + seat);
            join(guest, code);
            table.add(guest);
        }
        send(host, "{\"version\":1,\"type\":\"select_avatar\",\"avatarPreset\":\"townsperson-4\"}");
        JsonNode lobby = latestOfType(host, "room_state").path("players");
        for (var member : table) send(member, "{\"version\":1,\"type\":\"set_ready\",\"ready\":true}");
        send(host, "{\"version\":1,\"type\":\"start_game\"}");
        JsonNode roster = game(0).path("players");
        assertEquals(RoomRules.CAPACITY, roster.size());
        for (int seat = 0; seat < RoomRules.CAPACITY; seat++) {
            assertEquals(lobby.get(seat).path("playerId"), roster.get(seat).path("playerId"));
            assertEquals(lobby.get(seat).path("displayName"), roster.get(seat).path("displayName"));
            assertEquals(lobby.get(seat).path("colour"), roster.get(seat).path("colour"));
            assertEquals(lobby.get(seat).path("avatarPreset"), roster.get(seat).path("avatarPreset"));
            assertEquals(seat, roster.get(seat).path("seat").asInt());
            assertEquals("living", roster.get(seat).path("status").asText());
        }
        assertEquals("townsperson-4", roster.get(0).path("avatarPreset").asText());
        // Nothing in the Game moves an Avatar, so the request that used to do it is now unknown.
        send(host, "{\"version\":1,\"type\":\"move_player\",\"x\":640,\"y\":360,\"facing\":\"up\"}");
        assertEquals("unknown_message_type", latest(host).path("code").asText());
        assertEquals(RoomRules.seatX(0), latestOfType(host, "room_state").path("players").get(0).path("x").asDouble());
    }

    @Test
    void recoveryRestoresTheCurrentRolePhaseAndSeatPrivatelyAndFreshJoinStaysForbidden() throws Exception {
        startTable("recover");
        advance(REVEAL + 20_000);
        handler.afterConnectionClosed(table.get(9), CloseStatus.NORMAL);
        var returning = connect("recover-return");
        recover(returning, code, tokens.get(9));
        JsonNode snapshot = json(returning.payloads().get(0));
        assertEquals("playing", snapshot.path("phase").asText());
        assertEquals("player-10", snapshot.path("selfPlayerId").asText());
        assertEquals(9, snapshot.path("players").get(9).path("seat").asInt());
        JsonNode state = json(returning.payloads().get(1));
        assertEquals("game_state", state.path("type").asText());
        assertEquals("sheriff", state.path("self").path("role").asText());
        assertEquals("night", state.path("phase").asText());
        assertEquals(1, state.path("round").asInt());
        assertEquals(NIGHT - 20_000, state.path("remainingMs").asLong());
        assertNoHiddenRolesLeaked(returning);
        var newcomer = connect("recover-newcomer");
        join(newcomer, code);
        assertEquals("invalid_phase", latest(newcomer).path("code").asText());
    }

    // ----- ticket 14: the automatic phase cycle ------------------------------------------

    @Test
    void theTimedCycleRepeatsWithoutActionsAndAnnouncesNoDeathAndNoElimination() throws Exception {
        startTable("cycle");
        advance(REVEAL);
        assertEquals("night", game(4).path("phase").asText());
        assertEquals(1, game(4).path("round").asInt());
        assertEquals(NIGHT, game(4).path("remainingMs").asLong());
        advance(NIGHT);
        assertEquals("night_result", game(4).path("phase").asText());
        assertEquals("night", game(4).path("outcome").path("kind").asText());
        assertTrue(game(4).path("outcome").path("victimPlayerId").isNull());
        advance(NIGHT_RESULT);
        assertEquals("discussion", game(4).path("phase").asText());
        advance(DISCUSSION);
        assertEquals("voting", game(4).path("phase").asText());
        assertEquals(VOTING, game(4).path("remainingMs").asLong());
        advance(VOTING);
        assertEquals("voting_result", game(4).path("phase").asText());
        assertEquals("meeting", game(4).path("outcome").path("kind").asText());
        assertTrue(game(4).path("outcome").path("eliminatedPlayerId").isNull());
        assertEquals(0, game(4).path("ballots").size());
        advance(VOTING_RESULT);
        assertEquals("night", game(4).path("phase").asText());
        assertEquals(2, game(4).path("round").asInt());
        for (int seat = 0; seat < RoomRules.CAPACITY; seat++) {
            assertEquals("living", game(seat).path("players").get(seat).path("status").asText());
        }
    }

    @Test
    void severalDeadlinesCrossedWhileDisconnectedResumeInTheCurrentPhaseWithoutReplay() throws Exception {
        startTable("sleep");
        handler.afterConnectionClosed(table.get(4), CloseStatus.NORMAL);
        // Well inside the 120-second reservation, but across four phase boundaries.
        advance(REVEAL + NIGHT + NIGHT_RESULT + 10);
        var returning = connect("sleep-return");
        recover(returning, code, tokens.get(4));
        JsonNode state = json(returning.payloads().get(1));
        assertEquals("discussion", state.path("phase").asText());
        assertEquals(1, state.path("round").asInt());
        assertEquals(DISCUSSION - 10, state.path("remainingMs").asLong());
        advance(DISCUSSION - 10);
        assertEquals("voting", latestOfType(returning, "game_state").path("phase").asText());
    }

    @Test
    void anActionCarriesItsRoundSoADelayedRequestCannotChooseForALaterPhase() throws Exception {
        startTable("stale");
        advance(REVEAL);
        act(0, "mafia_vote", 2, 4);
        assertEquals("invalid_phase", latest(table.get(0)).path("code").asText());
        act(0, "mafia_vote", 1, 4);
        assertEquals("game_state", latest(table.get(0)).path("type").asText());
        advance(NIGHT + NIGHT_RESULT + DISCUSSION + VOTING + VOTING_RESULT);
        assertEquals(2, game(0).path("round").asInt());
        // The Night 1 request is stale now, and the fresh Night accepted no choice from it.
        act(0, "mafia_vote", 1, 5);
        assertEquals("invalid_phase", latest(table.get(0)).path("code").asText());
        assertTrue(game(0).path("self").path("mafiaVote").isNull());
    }

    // ----- ticket 15: Mafia Night votes ---------------------------------------------------

    @Test
    void aMafiaMajorityKillsItsTargetAndOnlyLivingMafiaSeeAcceptedVotes() throws Exception {
        startTable("attack");
        advance(REVEAL);
        act(0, "mafia_vote", 1, 4);
        assertEquals(List.of("player-1"), voters(game(1).path("self").path("mafiaVotes")));
        assertEquals("player-5", game(0).path("self").path("mafiaVote").asText());
        assertTrue(game(4).path("self").path("mafiaVotes").isNull());
        act(0, "mafia_vote", 1, 5);
        assertEquals("already_submitted", latest(table.get(0)).path("code").asText());
        act(4, "mafia_vote", 1, 5);
        assertEquals("invalid_action", latest(table.get(4)).path("code").asText());
        act(2, "mafia_vote", 1, 1);
        assertEquals("invalid_target", latest(table.get(2)).path("code").asText());
        act(1, "mafia_vote", 1, 4);
        advance(NIGHT);
        assertEquals("player-5", game(6).path("outcome").path("victimPlayerId").asText());
        assertEquals("eliminated", game(6).path("players").get(4).path("status").asText());
        assertEquals(4, game(6).path("players").get(4).path("seat").asInt());
        assertTrue(game(4).path("self").path("killedByMafia").asBoolean());
        assertFalse(game(6).path("self").path("killedByMafia").asBoolean(true));
        // The victim never learns who attacked, and no Role is published with the death.
        assertNoHiddenRolesLeaked(table.get(4));
        assertTrue(game(6).path("outcome").path("eliminatedMafia").isNull());
        advance(NIGHT_RESULT + DISCUSSION);
        ballot(4, 1, 6);
        assertEquals("invalid_action", latest(table.get(4)).path("code").asText());
        chat(4, "public", "let me back in");
        assertEquals("invalid_action", latest(table.get(4)).path("code").asText());
    }

    @Test
    void aSplitMafiaVoteKillsNobodyAndAnAcceptedVoteLocksOnlyForItsOwnNight() throws Exception {
        startTable("split");
        advance(REVEAL);
        act(0, "mafia_vote", 1, 4);
        act(1, "mafia_vote", 1, 5);
        act(2, "mafia_vote", 1, 6);
        advance(NIGHT);
        assertTrue(game(0).path("outcome").path("victimPlayerId").isNull());
        advance(NIGHT_RESULT + DISCUSSION + VOTING + VOTING_RESULT);
        assertEquals(2, game(0).path("round").asInt());
        assertTrue(game(0).path("self").path("mafiaVote").isNull());
        act(0, "mafia_vote", 2, 4);
        assertEquals("player-5", game(0).path("self").path("mafiaVote").asText());
    }

    @Test
    void disconnectedLivingMafiaStillCountTowardTheStrictMajority() throws Exception {
        startTable("absent");
        advance(REVEAL);
        handler.afterConnectionClosed(table.get(2), CloseStatus.NORMAL);
        act(0, "mafia_vote", 1, 4);
        advance(NIGHT);
        // One of three living Mafia is not more than half, even though only two can answer.
        assertTrue(game(0).path("outcome").path("victimPlayerId").isNull());
        advance(NIGHT_RESULT + DISCUSSION + VOTING + VOTING_RESULT);
        act(0, "mafia_vote", 2, 4);
        act(1, "mafia_vote", 2, 4);
        advance(NIGHT);
        assertEquals("player-5", game(0).path("outcome").path("victimPlayerId").asText());
    }

    @Test
    void anAcceptedMafiaVoteSurvivesReconnectWithoutAllowingASecondChoice() throws Exception {
        startTable("lock");
        advance(REVEAL);
        act(0, "mafia_vote", 1, 4);
        handler.afterConnectionClosed(table.get(0), CloseStatus.NORMAL);
        var returning = connect("lock-return");
        recover(returning, code, tokens.get(0));
        JsonNode state = json(returning.payloads().get(1));
        assertEquals("player-5", state.path("self").path("mafiaVote").asText());
        table.set(0, returning);
        act(0, "mafia_vote", 1, 5);
        assertEquals("already_submitted", latest(returning).path("code").asText());
    }

    // ----- ticket 16: the Doctor ----------------------------------------------------------

    @Test
    void protectionStopsTheMatchingAttackAndBlocksThatTargetTheNextNight() throws Exception {
        startTable("protect");
        advance(REVEAL);
        act(0, "mafia_vote", 1, 4);
        act(1, "mafia_vote", 1, 4);
        act(8, "protect", 1, 4);
        assertEquals("player-5", game(8).path("self").path("protect").asText());
        advance(NIGHT);
        assertTrue(game(6).path("outcome").path("victimPlayerId").isNull());
        assertEquals("living", game(6).path("players").get(4).path("status").asText());
        // The Doctor is told nothing about the save beyond the public announcement.
        assertEquals(game(6).path("outcome"), game(8).path("outcome"));
        for (int seat : new int[] {4, 5, 6, 7, 9}) {
            for (String payload : table.get(seat).payloads()) {
                assertFalse(payload.contains("\"protect\":\"player-"), "Doctor choice leaked: " + payload);
            }
        }
        advance(NIGHT_RESULT + DISCUSSION + VOTING + VOTING_RESULT);
        assertEquals("player-5", game(8).path("self").path("protectBlockedPlayerId").asText());
        act(8, "protect", 2, 4);
        assertEquals("invalid_target", latest(table.get(8)).path("code").asText());
        act(8, "protect", 2, 5);
        assertEquals("player-6", game(8).path("self").path("protect").asText());
        advance(NIGHT + NIGHT_RESULT + DISCUSSION + VOTING + VOTING_RESULT);
        act(8, "protect", 3, 4);
        assertEquals("player-5", game(8).path("self").path("protect").asText());
    }

    @Test
    void anIdleNightBreaksTheConsecutiveProtectionRestriction() throws Exception {
        startTable("idle");
        advance(REVEAL);
        act(8, "protect", 1, 4);
        advance(NIGHT + NIGHT_RESULT + DISCUSSION + VOTING + VOTING_RESULT);
        // Night two passes without a protection, which clears the restriction.
        advance(NIGHT + NIGHT_RESULT + DISCUSSION + VOTING + VOTING_RESULT);
        assertEquals(3, game(8).path("round").asInt());
        assertTrue(game(8).path("self").path("protectBlockedPlayerId").isNull());
        act(8, "protect", 3, 4);
        assertEquals("player-5", game(8).path("self").path("protect").asText());
    }

    @Test
    void selfProtectionSavesTheDoctorAndKillingThemCreatesNoSecondDeath() throws Exception {
        startTable("self");
        advance(REVEAL);
        act(0, "mafia_vote", 1, 8);
        act(1, "mafia_vote", 1, 8);
        act(8, "protect", 1, 8);
        advance(NIGHT);
        assertTrue(game(3).path("outcome").path("victimPlayerId").isNull());
        assertEquals("living", game(3).path("players").get(8).path("status").asText());
        advance(NIGHT_RESULT + DISCUSSION + VOTING + VOTING_RESULT);
        act(0, "mafia_vote", 2, 8);
        act(1, "mafia_vote", 2, 8);
        act(8, "protect", 2, 4);
        advance(NIGHT);
        assertEquals("player-9", game(3).path("outcome").path("victimPlayerId").asText());
        assertEquals("living", game(3).path("players").get(4).path("status").asText());
        assertEquals(1, eliminatedCount(game(3)));
    }

    @Test
    void anAbsentAttackAndAPreventedAttackAnnounceTheSameOutcome() throws Exception {
        startTable("silent");
        advance(REVEAL + NIGHT);
        JsonNode idle = game(5).path("outcome");
        advance(NIGHT_RESULT + DISCUSSION + VOTING + VOTING_RESULT);
        act(0, "mafia_vote", 2, 5);
        act(1, "mafia_vote", 2, 5);
        act(8, "protect", 2, 5);
        advance(NIGHT);
        assertEquals(idle, game(5).path("outcome"));
    }

    // ----- ticket 17: the Sheriff ---------------------------------------------------------

    @Test
    void theSheriffLearnsOnlyAFactionAndKeepsResultsPrivatelyAcrossRecovery() throws Exception {
        startTable("sheriff");
        advance(REVEAL);
        act(9, "investigate", 1, 9);
        assertEquals("invalid_target", latest(table.get(9)).path("code").asText());
        act(9, "investigate", 1, 0);
        assertEquals("player-1", game(9).path("self").path("investigate").asText());
        act(9, "investigate", 1, 4);
        assertEquals("already_submitted", latest(table.get(9)).path("code").asText());
        act(4, "investigate", 1, 0);
        assertEquals("invalid_action", latest(table.get(4)).path("code").asText());
        advance(NIGHT);
        JsonNode results = game(9).path("self").path("investigations");
        assertEquals(1, results.size());
        assertEquals("player-1", results.get(0).path("targetPlayerId").asText());
        assertTrue(results.get(0).path("mafia").asBoolean());
        assertEquals(1, results.get(0).path("round").asInt());
        for (int seat = 0; seat < 9; seat++) {
            for (String payload : table.get(seat).payloads()) {
                assertFalse(payload.contains("\"investigations\":[{"), "Sheriff results leaked: " + payload);
                assertFalse(payload.contains("\"investigate\":\"player-"), "Sheriff target leaked: " + payload);
            }
        }
        advance(NIGHT_RESULT + DISCUSSION + VOTING + VOTING_RESULT);
        // Repeating a previous target on a later Night is allowed.
        act(9, "investigate", 2, 0);
        act(9, "investigate", 2, 5);
        assertEquals("already_submitted", latest(table.get(9)).path("code").asText());
        advance(NIGHT);
        handler.afterConnectionClosed(table.get(9), CloseStatus.NORMAL);
        var returning = connect("sheriff-return");
        recover(returning, code, tokens.get(9));
        JsonNode restored = json(returning.payloads().get(1)).path("self").path("investigations");
        assertEquals(2, restored.size());
        assertEquals("player-1", restored.get(1).path("targetPlayerId").asText());
    }

    @Test
    void aSheriffKilledThatNightReceivesNoResultForIt() throws Exception {
        startTable("dead-sheriff");
        advance(REVEAL);
        act(0, "mafia_vote", 1, 9);
        act(1, "mafia_vote", 1, 9);
        act(9, "investigate", 1, 3);
        advance(NIGHT);
        assertEquals("player-10", game(3).path("outcome").path("victimPlayerId").asText());
        assertEquals(0, game(9).path("self").path("investigations").size());
    }

    // ----- ticket 18: Meeting ballots -----------------------------------------------------

    @Test
    void aMeetingMajorityEliminatesRevealsOnlyTheFactionAndRemovesLivingPermissions() throws Exception {
        startTable("meeting");
        advance(REVEAL + NIGHT + NIGHT_RESULT + DISCUSSION);
        assertEquals("voting", game(0).path("phase").asText());
        for (int seat = 3; seat <= 8; seat++) ballot(seat, 1, 0);
        assertTrue(game(3).path("self").path("meetingVoted").asBoolean());
        assertEquals("player-1", game(3).path("self").path("meetingVote").asText());
        // Nobody, including the voters, sees an attributed ballot before the deadline.
        for (var member : table) {
            for (String payload : member.payloads()) {
                assertFalse(payload.contains("\"ballots\":[{"), "Ballots disclosed early: " + payload);
            }
        }
        advance(VOTING);
        JsonNode outcome = game(9).path("outcome");
        assertEquals("meeting", outcome.path("kind").asText());
        assertEquals("player-1", outcome.path("eliminatedPlayerId").asText());
        assertTrue(outcome.path("eliminatedMafia").asBoolean());
        assertEquals("eliminated", game(9).path("players").get(0).path("status").asText());
        assertEquals(6, game(9).path("ballots").size());
        assertEquals("player-4", game(9).path("ballots").get(0).path("voterPlayerId").asText());
        assertEquals("player-1", game(9).path("ballots").get(0).path("targetPlayerId").asText());
        // A voted-out Mafia keeps nothing but a seat in the Meeting Area.
        advance(VOTING_RESULT);
        act(0, "mafia_vote", 2, 4);
        assertEquals("invalid_action", latest(table.get(0)).path("code").asText());
        chat(0, "mafia", "still here");
        assertEquals("invalid_action", latest(table.get(0)).path("code").asText());
        assertTrue(game(0).path("self").path("mafiaVotes").isNull());
    }

    @Test
    void selfVotesSkipsAndPluralityWithoutAMajorityEliminateNobodyAndEveryBallotIsFinal() throws Exception {
        startTable("plurality");
        advance(REVEAL + NIGHT + NIGHT_RESULT + DISCUSSION);
        ballot(3, 1, 3);
        assertEquals("player-4", game(3).path("self").path("meetingVote").asText());
        ballot(3, 1, 4);
        assertEquals("already_submitted", latest(table.get(3)).path("code").asText());
        ballot(4, 1, null);
        assertTrue(game(4).path("self").path("meetingVoted").asBoolean());
        assertTrue(game(4).path("self").path("meetingVote").isNull());
        ballot(4, 1, 5);
        assertEquals("already_submitted", latest(table.get(4)).path("code").asText());
        for (int seat : new int[] {0, 1, 2, 5, 6}) ballot(seat, 1, 7);
        advance(VOTING);
        // Five of ten is not more than half, so the plurality eliminates nobody.
        assertTrue(game(9).path("outcome").path("eliminatedPlayerId").isNull());
        assertTrue(game(9).path("outcome").path("eliminatedMafia").isNull());
        assertEquals(7, game(9).path("ballots").size());
        assertEquals(10, livingCount(game(9)));
    }

    @Test
    void disconnectedLivingPlayersStayInTheMeetingDenominator() throws Exception {
        startTable("denominator");
        advance(REVEAL + NIGHT + NIGHT_RESULT + DISCUSSION);
        handler.afterConnectionClosed(table.get(9), CloseStatus.NORMAL);
        for (int seat = 0; seat <= 4; seat++) ballot(seat, 1, 7);
        advance(VOTING);
        // Five of ten living Players is not a majority, even though only nine can answer.
        assertTrue(game(0).path("outcome").path("eliminatedPlayerId").isNull());
        assertEquals(10, livingCount(game(0)));
        var returning = connect("denominator-return");
        recover(returning, code, tokens.get(9));
        table.set(9, returning);
        advance(VOTING_RESULT + NIGHT + NIGHT_RESULT + DISCUSSION);
        for (int seat = 0; seat <= 5; seat++) ballot(seat, 2, 7);
        advance(VOTING);
        assertEquals("player-8", game(0).path("outcome").path("eliminatedPlayerId").asText());
        assertFalse(game(0).path("outcome").path("eliminatedMafia").asBoolean(true));
    }

    // ----- ticket 19: public and private chat ---------------------------------------------

    @Test
    void publicChatReachesTheRoomWhileMafiaChatReachesOnlyLivingMafia() throws Exception {
        startTable("chat");
        advance(REVEAL);
        chat(4, "mafia", "let me in");
        assertEquals("invalid_action", latest(table.get(4)).path("code").asText());
        chat(4, "public", "anyone awake");
        assertEquals("invalid_phase", latest(table.get(4)).path("code").asText());
        chat(0, "mafia", "<b>seat five</b>");
        for (int seat : new int[] {0, 1, 2}) {
            JsonNode received = latestOfType(table.get(seat), "chat_message");
            assertEquals("mafia", received.path("channel").asText());
            assertEquals("<b>seat five</b>", received.path("text").asText());
            assertEquals("player-1", received.path("senderPlayerId").asText());
            assertEquals("Player 0", received.path("senderName").asText());
        }
        for (int seat = 3; seat < RoomRules.CAPACITY; seat++) {
            assertTrue(table.get(seat).payloads().stream().noneMatch(payload -> payload.contains("chat_message")));
        }
        advance(NIGHT + NIGHT_RESULT);
        chat(0, "mafia", "too late");
        assertEquals("invalid_phase", latest(table.get(0)).path("code").asText());
        chat(4, "public", "good morning");
        for (var member : table) {
            assertEquals("good morning", latestOfType(member, "chat_message").path("text").asText());
        }
        advance(DISCUSSION);
        chat(6, "public", "still talking");
        assertEquals("still talking", latestOfType(table.get(0), "chat_message").path("text").asText());
    }

    @Test
    void recoveryRestoresOnlyTheHistoryItsRecipientWasEntitledToRead() throws Exception {
        startTable("history");
        advance(REVEAL);
        chat(1, "mafia", "we take seat five");
        advance(NIGHT + NIGHT_RESULT);
        chat(5, "public", "who was awake");
        handler.afterConnectionClosed(table.get(4), CloseStatus.NORMAL);
        handler.afterConnectionClosed(table.get(2), CloseStatus.NORMAL);
        var villager = connect("history-villager");
        recover(villager, code, tokens.get(4));
        JsonNode villagerHistory = json(villager.payloads().get(2)).path("messages");
        assertEquals(1, villagerHistory.size());
        assertEquals("who was awake", villagerHistory.get(0).path("text").asText());
        var mafia = connect("history-mafia");
        recover(mafia, code, tokens.get(2));
        JsonNode mafiaHistory = json(mafia.payloads().get(2)).path("messages");
        assertEquals(2, mafiaHistory.size());
        assertEquals("we take seat five", mafiaHistory.get(0).path("text").asText());
        assertTrue(villager.payloads().stream().noneMatch(payload -> payload.contains("we take seat five")));
    }

    @Test
    void anEliminatedMafiaKeepsEarlierMessagesAndReceivesNoLaterOnes() throws Exception {
        startTable("ghost");
        advance(REVEAL);
        chat(0, "mafia", "first plan");
        advance(NIGHT + NIGHT_RESULT + DISCUSSION);
        for (int seat = 3; seat <= 8; seat++) ballot(seat, 1, 2);
        advance(VOTING + VOTING_RESULT);
        assertEquals("eliminated", game(0).path("players").get(2).path("status").asText());
        chat(0, "mafia", "second plan");
        assertTrue(table.get(2).payloads().stream().noneMatch(payload -> payload.contains("second plan")));
        handler.afterConnectionClosed(table.get(2), CloseStatus.NORMAL);
        var returning = connect("ghost-return");
        recover(returning, code, tokens.get(2));
        JsonNode history = json(returning.payloads().get(2)).path("messages");
        assertEquals(List.of("first plan"), texts(history));
    }

    // ----- ticket 20: Forfeit --------------------------------------------------------------

    @Test
    void leaveForfeitsALivingPlayerAndDropsOnlyTheirOwnPendingChoice() throws Exception {
        startTable("forfeit");
        advance(REVEAL);
        act(0, "mafia_vote", 1, 4);
        act(1, "mafia_vote", 1, 4);
        send(table.get(1), "{\"version\":1,\"type\":\"leave_room\"}");
        assertEquals("left", game(0).path("players").get(1).path("status").asText());
        assertEquals(1, game(0).path("players").get(1).path("seat").asInt());
        assertEquals("Player 1", game(0).path("players").get(1).path("displayName").asText());
        act(0, "mafia_vote", 1, 5);
        assertEquals("already_submitted", latest(table.get(0)).path("code").asText());
        advance(NIGHT);
        // One of the two remaining living Mafia is not a strict majority.
        assertTrue(game(0).path("outcome").path("victimPlayerId").isNull());
        assertEquals(9, livingCount(game(0)));
    }

    @Test
    void aForfeitedTargetMakesAChoiceIneffectiveWithoutAllowingAReplacement() throws Exception {
        startTable("target-left");
        advance(REVEAL);
        act(0, "mafia_vote", 1, 4);
        act(1, "mafia_vote", 1, 4);
        send(table.get(4), "{\"version\":1,\"type\":\"leave_room\"}");
        act(0, "mafia_vote", 1, 5);
        assertEquals("already_submitted", latest(table.get(0)).path("code").asText());
        advance(NIGHT);
        assertTrue(game(0).path("outcome").path("victimPlayerId").isNull());
        assertEquals("left", game(0).path("players").get(4).path("status").asText());
    }

    @Test
    void disconnectKeepsALivingPlayerWhileRecoveryExpiryForfeitsThem() throws Exception {
        startTable("expiry");
        advance(REVEAL);
        handler.afterConnectionClosed(table.get(4), CloseStatus.NORMAL);
        advance(119_999);
        assertEquals("living", game(0).path("players").get(4).path("status").asText());
        advance(1);
        assertEquals("left", game(0).path("players").get(4).path("status").asText());
        assertEquals(9, livingCount(game(0)));
    }

    @Test
    void leavingAfterEliminationDoesNotReduceTheLivingCountAgain() throws Exception {
        startTable("dead-leave");
        advance(REVEAL);
        act(0, "mafia_vote", 1, 4);
        act(1, "mafia_vote", 1, 4);
        advance(NIGHT);
        assertEquals(9, livingCount(game(0)));
        send(table.get(4), "{\"version\":1,\"type\":\"leave_room\"}");
        assertEquals("eliminated", game(0).path("players").get(4).path("status").asText());
        assertEquals(9, livingCount(game(0)));
    }

    // ----- ticket 21: victory and the final reveal -----------------------------------------

    @Test
    void villageWinsWhenNoMafiaRemainAndEveryOriginalRoleIsRevealed() throws Exception {
        startTable("village-win");
        advance(REVEAL + NIGHT + NIGHT_RESULT + DISCUSSION);
        for (int seat = 3; seat <= 8; seat++) ballot(seat, 1, 0);
        advance(VOTING + VOTING_RESULT + NIGHT + NIGHT_RESULT + DISCUSSION);
        for (int seat = 3; seat <= 7; seat++) ballot(seat, 2, 1);
        advance(VOTING + VOTING_RESULT + NIGHT + NIGHT_RESULT + DISCUSSION);
        for (int seat = 3; seat <= 7; seat++) ballot(seat, 3, 2);
        assertTrue(game(3).path("winner").isNull(), "victory decided before the Meeting closed");
        advance(VOTING);
        assertEquals("village", game(3).path("winner").asText());
        assertEquals("voting_result", game(3).path("phase").asText());
        advance(VOTING_RESULT);
        JsonNode finished = game(3);
        assertEquals("finished", finished.path("phase").asText());
        assertTrue(finished.path("remainingMs").isNull());
        assertEquals(RoomRules.CAPACITY, finished.path("roles").size());
        assertEquals(List.of("mafia", "mafia", "mafia", "villager", "villager", "villager", "villager",
                "villager", "doctor", "sheriff"), revealedRoles(finished));
        // Results stop the contest and survive later time, actions and departures.
        int round = finished.path("round").asInt();
        advance(NIGHT + DISCUSSION + VOTING);
        assertEquals("finished", game(3).path("phase").asText());
        assertEquals(round, game(3).path("round").asInt());
        ballot(3, round, 4);
        assertEquals("invalid_phase", latest(table.get(3)).path("code").asText());
        send(table.get(5), "{\"version\":1,\"type\":\"leave_room\"}");
        assertEquals("village", game(3).path("winner").asText());
        handler.afterConnectionClosed(table.get(6), CloseStatus.NORMAL);
        var returning = connect("village-win-return");
        recover(returning, code, tokens.get(6));
        assertEquals("village", json(returning.payloads().get(1)).path("winner").asText());
    }

    @Test
    void mafiaWinAtParityReachedThroughNightAttacks() throws Exception {
        startTable("mafia-win");
        advance(REVEAL);
        for (int round = 1; round <= 4; round++) {
            act(0, "mafia_vote", round, 2 + round);
            act(1, "mafia_vote", round, 2 + round);
            if (round < 4) advance(NIGHT + NIGHT_RESULT + DISCUSSION + VOTING + VOTING_RESULT);
        }
        assertTrue(game(0).path("winner").isNull(), "victory decided before the Night resolved");
        advance(NIGHT);
        assertEquals("mafia", game(0).path("winner").asText());
        assertEquals("night_result", game(0).path("phase").asText());
        assertEquals("player-7", game(0).path("outcome").path("victimPlayerId").asText());
        advance(NIGHT_RESULT);
        assertEquals("finished", game(0).path("phase").asText());
        assertEquals(RoomRules.CAPACITY, game(9).path("roles").size());
    }

    @Test
    void forfeitsCanDecideVictoryWithoutAbortingTheGame() throws Exception {
        startTable("forfeit-win");
        advance(REVEAL);
        for (int seat = 3; seat <= 5; seat++) {
            send(table.get(seat), "{\"version\":1,\"type\":\"leave_room\"}");
            assertTrue(game(0).path("winner").isNull());
        }
        send(table.get(6), "{\"version\":1,\"type\":\"leave_room\"}");
        assertEquals("mafia", game(0).path("winner").asText());
        assertEquals("finished", game(0).path("phase").asText());
        assertEquals("left", game(0).path("players").get(3).path("status").asText());
        assertEquals(RoomRules.CAPACITY, game(0).path("roles").size());
    }

    // ----- helpers ------------------------------------------------------------------------

    private final List<String> tokens = new ArrayList<>();

    private void startTable(String label) throws Exception {
        tokens.clear();
        var host = connect(label + "-0");
        send(host, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Player 0\"}");
        code = latest(host).path("roomId").asText();
        tokens.add(latest(host).path("recoveryToken").asText());
        table.add(host);
        for (int seat = 1; seat < RoomRules.CAPACITY; seat++) {
            var guest = connect(label + "-" + seat);
            send(guest, "{\"version\":1,\"type\":\"join_room\",\"roomId\":\"" + code + "\",\"displayName\":\"Player " + seat + "\"}");
            tokens.add(json(guest.payloads().get(0)).path("recoveryToken").asText());
            table.add(guest);
        }
        for (var member : table) send(member, "{\"version\":1,\"type\":\"set_ready\",\"ready\":true}");
        send(host, "{\"version\":1,\"type\":\"start_game\"}");
    }

    private void advance(long millis) {
        milliseconds.addAndGet(millis);
        handler.settleRooms();
    }

    private static String playerId(int seat) { return "player-" + (seat + 1); }

    private void act(int seat, String type, int round, int targetSeat) throws Exception {
        send(table.get(seat), "{\"version\":1,\"type\":\"" + type + "\",\"round\":" + round
                + ",\"targetPlayerId\":\"" + playerId(targetSeat) + "\"}");
    }

    private void ballot(int seat, int round, Integer targetSeat) throws Exception {
        send(table.get(seat), "{\"version\":1,\"type\":\"meeting_vote\",\"round\":" + round + ",\"targetPlayerId\":"
                + (targetSeat == null ? "null" : "\"" + playerId(targetSeat) + "\"") + "}");
    }

    private void chat(int seat, String channel, String text) throws Exception {
        send(table.get(seat), "{\"version\":1,\"type\":\"send_chat\",\"channel\":\"" + channel + "\",\"text\":\"" + text + "\"}");
    }

    private JsonNode game(int seat) { return latestOfType(table.get(seat), "game_state"); }

    private static List<String> voters(JsonNode ballots) {
        var values = new ArrayList<String>();
        ballots.forEach(node -> values.add(node.path("voterPlayerId").asText()));
        return values;
    }

    private static int livingCount(JsonNode state) {
        int living = 0;
        for (JsonNode member : state.path("players")) {
            if (member.path("status").asText().equals("living")) living++;
        }
        return living;
    }

    private static List<String> texts(JsonNode messages) {
        var values = new ArrayList<String>();
        messages.forEach(node -> values.add(node.path("text").asText()));
        return values;
    }

    private static List<String> revealedRoles(JsonNode state) {
        var values = new ArrayList<String>();
        state.path("roles").forEach(node -> values.add(node.path("role").asText()));
        return values;
    }

    private static int eliminatedCount(JsonNode state) {
        int eliminated = 0;
        for (JsonNode member : state.path("players")) {
            if (member.path("status").asText().equals("eliminated")) eliminated++;
        }
        return eliminated;
    }

    private static List<String> names(JsonNode array) {
        var values = new ArrayList<String>();
        array.forEach(node -> values.add(node.asText()));
        return values;
    }

    /** Client-side concealment is not a passing privacy test; the whole stream must be clean. */
    private static void assertNoHiddenRolesLeaked(RecordingWebSocketSession session) {
        for (String payload : session.payloads()) {
            assertFalse(payload.contains("\"mafiaTeam\":[\""), "Mafia team leaked: " + payload);
            assertFalse(payload.contains("\"roles\":[{"), "Roles leaked before the result: " + payload);
            assertFalse(payload.contains("\"mafiaVotes\":[{"), "Mafia votes leaked: " + payload);
        }
    }

    private JsonNode latest(RecordingWebSocketSession session) {
        return jsonUnchecked(session.payloads().get(session.payloads().size() - 1));
    }

    private JsonNode latestOfType(RecordingWebSocketSession session, String type) {
        return session.payloads().stream().map(this::jsonUnchecked)
                .filter(node -> node.path("type").asText().equals(type))
                .reduce((first, second) -> second).orElseThrow();
    }

    private void join(RecordingWebSocketSession session, String roomCode) throws Exception {
        send(session, "{\"version\":1,\"type\":\"join_room\",\"roomId\":\"" + roomCode + "\",\"displayName\":\"Guest\"}");
    }

    private void recover(RecordingWebSocketSession session, String roomCode, String token) throws Exception {
        send(session, "{\"version\":1,\"type\":\"recover_room\",\"roomId\":\"" + roomCode + "\",\"recoveryToken\":\"" + token + "\"}");
    }

    private RecordingWebSocketSession connect(String sessionId) {
        RecordingWebSocketSession session = new RecordingWebSocketSession(sessionId);
        handler.afterConnectionEstablished(session);
        return session;
    }

    private void send(RecordingWebSocketSession session, String payload) throws Exception {
        handler.handleMessage(session, new TextMessage(payload));
    }

    private JsonNode json(String payload) throws Exception {
        return objectMapper.readTree(payload);
    }

    private JsonNode jsonUnchecked(String payload) {
        try { return json(payload); }
        catch (Exception exception) { throw new AssertionError(exception); }
    }
}
