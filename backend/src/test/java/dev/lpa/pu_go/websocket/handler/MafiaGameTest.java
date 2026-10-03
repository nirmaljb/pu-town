package dev.lpa.pu_go.websocket.handler;

import dev.lpa.pu_go.avatar.AvatarCollection;
import dev.lpa.pu_go.avatar.AvatarPreset;
import dev.lpa.pu_go.game.FieldRules;
import dev.lpa.pu_go.game.Role;
import dev.lpa.pu_go.room.RoomManager;
import dev.lpa.pu_go.room.RoomRules;
import dev.lpa.pu_go.websocket.support.RecordingWebSocketSession;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.UnaryOperator;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The Game played through real protocol requests and a controlled clock. With the identity
 * deal a ten-Player table seats Mafia at 0–2, the Doctor at 3, the Sheriff at 4 and Villagers
 * at 5–9; a four-Player table seats the Mafia at 0, Doctor 1, Sheriff 2 and a Villager at 3.
 */
class MafiaGameTest {
    private static final long REVEAL = 8_000;
    private static final long DAY = 180_000;
    private static final long NIGHT = 20_000;
    private static final long DISCUSSION = 90_000;
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
    /**
     * Tables of five or more deal two Mafia, a Doctor and a Sheriff (see startTable). The deal
     * [M, M, D, S, V...] is laid out as Mafia in seats 0 and 2, a Villager in seat 1, the Doctor
     * in seat 3 and the Sheriff in seat 4, so the tests can place each Role by its Seat.
     */
    private static final UnaryOperator<List<Role>> SEAT_LAYOUT = roles -> {
        if (roles.size() < 5) return roles;
        List<Role> laidOut = new ArrayList<>(List.of(roles.get(0), roles.get(4), roles.get(1), roles.get(2), roles.get(3)));
        laidOut.addAll(roles.subList(5, roles.size()));
        return laidOut;
    };

    private final AtomicReference<UnaryOperator<List<Role>>> assignment = new AtomicReference<>(SEAT_LAYOUT);
    private final GameWebSocketHandler handler = new GameWebSocketHandler(
            new RoomManager(milliseconds::get, () -> COLLECTION), Runnable::run,
            () -> "player-" + playerIds.incrementAndGet(), roles -> assignment.get().apply(roles));

    private final List<RecordingWebSocketSession> table = new ArrayList<>();
    private final List<String> tokens = new ArrayList<>();
    private String code;

    @Test
    void soloPracticeStartsWithoutReadyAndWalksWithoutACompetitiveRoster() throws Exception {
        var host = connect("practice-host");
        send(host, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Host\"}");
        code = latest(host).path("roomId").asText();
        table.add(host);
        send(host, "{\"version\":1,\"type\":\"start_game\"}");
        assertEquals("start_blocked", latest(host).path("code").asText());
        send(host, "{\"version\":1,\"type\":\"start_practice\"}");
        assertEquals("practice", game(0).path("mode").asText());
        assertEquals("day", game(0).path("phase").asText());
        assertEquals(1, game(0).path("players").size());
        assertEquals(playerId(0), game(0).path("players").get(0).path("playerId").asText());
        assertTrue(game(0).path("remainingMs").isNull());
        handler.tickFields();
        double x = field(0).path("self").path("x").asDouble();
        double y = field(0).path("self").path("y").asDouble();
        move(0, x + 10, y);
        handler.tickFields();
        assertEquals(x + 10, field(0).path("self").path("x").asDouble());
        advance(DAY + NIGHT + DISCUSSION + VOTING + VOTING_RESULT);
        assertEquals("day", game(0).path("phase").asText());
        assertTrue(game(0).path("winner").isNull());
    }

    @Test
    void practicePreviewsCycleWithoutEliminationAndRecoverTheirPositionAndPhase() throws Exception {
        var host = connect("preview-host");
        send(host, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Host\"}");
        code = latest(host).path("roomId").asText();
        String token = latest(host).path("recoveryToken").asText();
        table.add(host);
        send(host, "{\"version\":1,\"type\":\"start_practice\"}");
        handler.tickFields();
        double x = field(0).path("self").path("x").asDouble() + 10;
        double y = field(0).path("self").path("y").asDouble();
        move(0, x, y);
        nextPractice(host, 1, "day");
        assertEquals("night", game(0).path("phase").asText());
        assertEquals(x, field(0).path("self").path("x").asDouble());
        nextPractice(host, 1, "day");
        assertEquals("invalid_phase", latest(host).path("code").asText());
        nextPractice(host, 2, "night");
        assertEquals("invalid_phase", latest(host).path("code").asText());
        move(0, x + 10, y);
        handler.tickFields();
        assertEquals(x, field(0).path("self").path("x").asDouble(), "Night keeps the sleeping position");
        handler.afterConnectionClosed(host, CloseStatus.NORMAL);
        advance(15_000);
        var returned = connect("preview-returned");
        recover(returned, code, token);
        assertEquals(playerId(0), latestOfType(returned, "room_snapshot").path("selfPlayerId").asText());
        assertEquals("practice", latestOfType(returned, "game_state").path("mode").asText());
        assertEquals("night", latestOfType(returned, "game_state").path("phase").asText());
        assertEquals(x, latestOfType(returned, "field_state").path("self").path("x").asDouble());
        nextPractice(returned, 1, "night");
        assertEquals("discussion", latestOfType(returned, "game_state").path("phase").asText());
        nextPractice(returned, 1, "discussion");
        send(returned, "{\"version\":1,\"type\":\"meeting_vote\",\"round\":1,\"targetPlayerId\":\"player-1\"}");
        assertEquals("invalid_target", latest(returned).path("code").asText());
        nextPractice(returned, 1, "voting");
        assertEquals("voting_result", latestOfType(returned, "game_state").path("phase").asText());
        assertTrue(latestOfType(returned, "game_state").path("outcome").path("eliminatedPlayerId").isNull());
        nextPractice(returned, 1, "voting_result");
        var day = latestOfType(returned, "game_state");
        assertEquals("day", day.path("phase").asText());
        assertEquals(2, day.path("round").asInt());
        assertTrue(day.path("winner").isNull());
        assertEquals("living", day.path("self").path("status").asText());
        var outsider = connect("practice-outsider");
        join(outsider, code);
        assertEquals("invalid_phase", latest(outsider).path("code").asText());
        send(returned, "{\"version\":1,\"type\":\"leave_room\"}");
        assertEquals("room_left", latest(returned).path("type").asText());
        recover(outsider, code, token);
        assertEquals("room_not_found", latest(outsider).path("code").asText());
    }

    @Test
    void practiceEntryRequiresTheHostAloneAndCannotAdvanceACompetitiveGame() throws Exception {
        var host = connect("practice-gates-host");
        send(host, "{\"version\":1,\"type\":\"start_practice\"}");
        assertEquals("not_in_room", latest(host).path("code").asText());
        send(host, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Host\"}");
        code = latest(host).path("roomId").asText();
        var guest = connect("practice-gates-guest");
        join(guest, code);
        send(guest, "{\"version\":1,\"type\":\"start_practice\"}");
        assertEquals("not_host", latest(guest).path("code").asText());
        send(host, "{\"version\":1,\"type\":\"start_practice\"}");
        assertEquals("practice_blocked", latest(host).path("code").asText());
        handler.afterConnectionClosed(guest, CloseStatus.NORMAL);
        send(host, "{\"version\":1,\"type\":\"start_practice\"}");
        assertEquals("practice_blocked", latest(host).path("code").asText(), "Disconnected Membership still occupies the Room");
        startTable("competitive-preview", 4, 1, 1, 1);
        assertEquals("competitive", game(0).path("mode").asText());
        nextPractice(table.get(0), 1, "day");
        assertEquals("invalid_action", latest(table.get(0)).path("code").asText());
        send(table.get(0), "{\"version\":1,\"type\":\"start_practice\"}");
        assertEquals("invalid_phase", latest(table.get(0)).path("code").asText());
        send(table.get(0), "{\"version\":1,\"type\":\"start_practice\",\"ready\":true}");
        assertEquals("malformed_message", latest(table.get(0)).path("code").asText());
        send(table.get(0), "{\"version\":1,\"type\":\"advance_practice\",\"round\":1,\"phase\":\"roam\"}");
        assertEquals("malformed_message", latest(table.get(0)).path("code").asText());
    }

    private void nextPractice(RecordingWebSocketSession host, int round, String phase) throws Exception {
        send(host, "{\"version\":1,\"type\":\"advance_practice\",\"round\":" + round + ",\"phase\":\"" + phase + "\"}");
    }

    // ----- Start and the deal ------------------------------------------------------------

    @Test
    void startNeedsFourConnectedReadyPlayersAndNeverStartsPartially() throws Exception {
        var host = connect("gate-0");
        send(host, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Host\"}");
        code = latest(host).path("roomId").asText();
        table.add(host);
        for (int seat = 1; seat < 3; seat++) {
            var guest = connect("gate-" + seat);
            join(guest, code);
            table.add(guest);
        }
        for (var member : table) send(member, "{\"version\":1,\"type\":\"set_ready\",\"ready\":true}");
        send(host, "{\"version\":1,\"type\":\"move\",\"x\":1280,\"y\":600,\"facing\":\"up\"}");
        assertEquals("invalid_phase", latest(host).path("code").asText());
        send(host, "{\"version\":1,\"type\":\"start_game\"}");
        assertEquals("At least 4 Players must be in the Room to start.", latest(host).path("message").asText());
        var fourth = connect("gate-3");
        join(fourth, code);
        table.add(fourth);
        send(table.get(2), "{\"version\":1,\"type\":\"start_game\"}");
        assertEquals("not_host", latest(table.get(2)).path("code").asText());
        send(host, "{\"version\":1,\"type\":\"start_game\"}");
        assertEquals("Every Player must be Ready to start.", latest(host).path("message").asText());
        send(fourth, "{\"version\":1,\"type\":\"set_ready\",\"ready\":true}");
        handler.afterConnectionClosed(table.get(1), CloseStatus.NORMAL);
        send(host, "{\"version\":1,\"type\":\"start_game\"}");
        assertEquals("Every Player must be connected to start.", latest(host).path("message").asText());
        assertEquals("lobby", latestOfType(host, "room_state").path("phase").asText());
        assertTrue(host.payloads().stream().noneMatch(payload -> payload.contains("\"game_state\"")));
    }

    @Test
    void theDealFollowsTheHostsRoleSetupAndIsIndependentOfSeats() throws Exception {
        for (int players = 4; players <= 10; players++) {
            table.clear();
            startTable("deal-" + players, players);
            int mafia = players >= 5 ? 2 : 1;
            var counts = roleCounts(players);
            assertEquals(mafia, counts.get(Role.MAFIA));
            assertEquals(1, counts.get(Role.DOCTOR));
            assertEquals(1, counts.get(Role.SHERIFF));
            assertEquals(players - mafia - 2, counts.getOrDefault(Role.VILLAGER, 0));
            send(table.get(0), "{\"version\":1,\"type\":\"start_game\"}");
            assertEquals("invalid_phase", latest(table.get(0)).path("code").asText());
            roleSetup(0, 1, 1, 1);
            assertEquals("invalid_phase", latest(table.get(0)).path("code").asText());
        }
        table.clear();
        startTable("deal-many", 10, 2, 3, 2);
        var counts = roleCounts(10);
        assertEquals(2, counts.get(Role.MAFIA));
        assertEquals(3, counts.get(Role.DOCTOR));
        assertEquals(2, counts.get(Role.SHERIFF));
        assertEquals(3, counts.get(Role.VILLAGER));
        var seed = new AtomicLong();
        var seenBySeat = new HashSet<String>();
        assignment.set(roles -> {
            var shuffled = new ArrayList<>(roles);
            java.util.Collections.shuffle(shuffled, new java.util.Random(seed.getAndIncrement()));
            return shuffled;
        });
        for (int attempt = 0; attempt < 4; attempt++) {
            table.clear();
            startTable("shuffle-" + attempt, 10);
            var bySeat = new StringBuilder();
            for (int seat = 0; seat < 10; seat++) bySeat.append(game(seat).path("self").path("role").asText()).append(',');
            seenBySeat.add(bySeat.toString());
        }
        assertTrue(seenBySeat.size() > 1, "the deal repeated the same Seat-to-Role mapping every time");
    }

    @Test
    void onlyTheHostChoosesTheRolesWithinTheLimitsAndEveryoneSeesTheChoice() throws Exception {
        var host = connect("setup-0");
        send(host, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Host\"}");
        code = latest(host).path("roomId").asText();
        assertEquals(1, latest(host).path("roleSetup").path("mafia").asInt());
        table.add(host);
        for (int seat = 1; seat < 5; seat++) {
            var guest = connect("setup-" + seat);
            join(guest, code);
            table.add(guest);
        }
        roleSetup(1, 2, 1, 1);
        assertEquals("not_host", latest(table.get(1)).path("code").asText());
        for (int[] invalid : new int[][] {{3, 1, 1}, {0, 1, 1}, {1, 0, 1}, {1, 1, 0}, {1, 1, 3}, {2, 6, 2}}) {
            roleSetup(0, invalid[0], invalid[1], invalid[2]);
            assertEquals("invalid_role_setup", latest(host).path("code").asText(), java.util.Arrays.toString(invalid));
        }
        send(host, "{\"version\":1,\"type\":\"set_role_setup\",\"mafia\":1.5,\"doctors\":1,\"sheriffs\":1}");
        assertEquals("malformed_message", latest(host).path("code").asText());
        send(host, "{\"version\":1,\"type\":\"set_role_setup\",\"mafia\":1,\"doctors\":1}");
        assertEquals("malformed_message", latest(host).path("code").asText());
        // Two Mafia, two Doctors and two Sheriffs leave nobody a Villager at five.
        roleSetup(0, 2, 2, 2);
        for (var member : table) {
            JsonNode setup = latestOfType(member, "room_state").path("roleSetup");
            assertEquals(List.of(2, 2, 2), List.of(setup.path("mafia").asInt(), setup.path("doctors").asInt(), setup.path("sheriffs").asInt()));
        }
        for (var member : table) send(member, "{\"version\":1,\"type\":\"set_ready\",\"ready\":true}");
        send(host, "{\"version\":1,\"type\":\"start_game\"}");
        assertEquals("This deal of 2 Mafia, 2 Doctors and 2 Sheriffs needs at least 7 Players, so one is left a Villager.",
                latest(host).path("message").asText());
        // A late arrival learns the setup from their snapshot.
        var sixth = connect("setup-5");
        join(sixth, code);
        assertEquals(2, latestOfType(sixth, "room_snapshot").path("roleSetup").path("sheriffs").asInt());
        table.add(sixth);
        var seventh = connect("setup-6");
        join(seventh, code);
        table.add(seventh);
        for (var member : table) send(member, "{\"version\":1,\"type\":\"set_ready\",\"ready\":true}");
        send(host, "{\"version\":1,\"type\":\"start_game\"}");
        var counts = roleCounts(7);
        assertEquals(List.of(2, 2, 2, 1), List.of(counts.get(Role.MAFIA), counts.get(Role.DOCTOR), counts.get(Role.SHERIFF), counts.get(Role.VILLAGER)));
    }

    @Test
    void theRoleRevealIsPrivateAndOnlyMafiaLearnTheirTeam() throws Exception {
        startTable("reveal", 10);
        assertEquals("role_reveal", game(0).path("phase").asText());
        assertEquals(REVEAL, game(0).path("remainingMs").asLong());
        assertEquals(List.of("player-1", "player-3"), names(game(2).path("self").path("mafiaTeam")));
        for (int seat = 1; seat < 10; seat++) {
            if (seat == 2) continue;
            assertTrue(game(seat).path("self").path("mafiaTeam").isNull());
            assertNoHiddenRolesLeaked(table.get(seat));
        }
        assertEquals("doctor", game(3).path("self").path("role").asText());
        assertEquals("sheriff", game(4).path("self").path("role").asText());
        assertEquals("villager", game(1).path("self").path("role").asText());
        assertEquals("villager", game(7).path("self").path("role").asText());
    }

    // ----- the Roam: movement and sight ---------------------------------------------------

    @Test
    void theDayBeginsAtTheSeatsAndStreamsOnlyWhatEachPlayerCanSee() throws Exception {
        startTable("sight", 10);
        advance(REVEAL);
        assertEquals("day", game(5).path("phase").asText());
        assertEquals(1, game(5).path("round").asInt());
        assertEquals(DAY, game(5).path("remainingMs").asLong());
        handler.tickFields();
        for (int seat = 0; seat < 10; seat++) {
            JsonNode self = field(seat).path("self");
            assertEquals(RoomRules.seatX(seat), self.path("x").asDouble());
            assertEquals(RoomRules.seatY(seat), self.path("y").asDouble());
            Set<String> expected = new HashSet<>();
            for (int other = 0; other < 10; other++) {
                double distance = Math.hypot(RoomRules.seatX(other) - RoomRules.seatX(seat), RoomRules.seatY(other) - RoomRules.seatY(seat));
                if (distance <= visionOf(seat)) expected.add(playerId(other));
            }
            assertEquals(expected, fieldIds(seat), "seat " + seat);
        }
        // Opposite sides of the Town Square are out of each other's sight.
        assertFalse(fieldIds(2).contains(playerId(7)));
        // Nobody's field ever names a Role.
        for (var member : table) assertTrue(member.payloads().stream().filter(p -> p.contains("field_state")).noneMatch(p -> p.contains("\"role\"")));
    }

    @Test
    void movementIsCheckedAndARefusedStepIsCorrected() throws Exception {
        startTable("walk", 10);
        advance(REVEAL);
        handler.tickFields();
        int correction = field(5).path("self").path("correction").asInt();
        // A teleport across the town is not a step.
        milliseconds.addAndGet(100);
        move(5, 2_300, 1_300);
        handler.tickFields();
        assertEquals(RoomRules.seatX(5), field(5).path("self").path("x").asDouble());
        assertEquals(correction + 1, field(5).path("self").path("correction").asInt());
        // Walking into the Town Hall's wall is refused too.
        walk(5, 1_280, 545);
        milliseconds.addAndGet(100);
        move(5, 1_280, 505);
        handler.tickFields();
        assertEquals(545, field(5).path("self").path("y").asDouble(), 0.5);
        // A reachable step is accepted and seen by others.
        milliseconds.addAndGet(100);
        move(5, 1_280, 530);
        handler.tickFields();
        assertEquals(530, field(5).path("self").path("y").asDouble(), 0.5);
        send(table.get(5), "{\"version\":1,\"type\":\"move\",\"x\":\"far\",\"y\":1,\"facing\":\"up\"}");
        assertEquals("malformed_message", latest(table.get(5)).path("code").asText());
    }

    @Test
    void everyLivingRoleSeesOnlyWithinTheSharedVisionBoundary() throws Exception {
        startTable("vision", 10);
        advance(REVEAL);
        // Seat 1, a Villager, walks just inside and then just outside each watcher's Vision,
        // heading from that watcher toward the button across the open square.
        for (int watcher : new int[] {0, 3, 4, 6}) {
            double reach = visionOf(watcher);
            double toX = RoomRules.BUTTON_X - RoomRules.seatX(watcher);
            double toY = RoomRules.BUTTON_Y - RoomRules.seatY(watcher);
            double length = Math.hypot(toX, toY);
            for (double offset : new double[] {-20, 20}) {
                walk(1, Math.round(RoomRules.seatX(watcher) + toX / length * (reach + offset)),
                        Math.round(RoomRules.seatY(watcher) + toY / length * (reach + offset)));
                assertEquals(offset < 0, fieldIds(watcher).contains(playerId(1)),
                        game(watcher).path("self").path("role").asText() + " at " + (reach + offset));
            }
        }
    }

    // ----- kills, Bodies and Meetings -----------------------------------------------------

    @Test
    void dayNightAndTownhallKeepExactDeadlinesAndRetainedSeats() throws Exception {
        startTable("cycle", 10);
        advance(REVEAL);
        assertEquals("day", game(5).path("phase").asText());
        assertEquals(180_000, game(5).path("remainingMs").asLong());
        walk(5, 1_280, 1_000);
        advance(REVEAL + 180_000 - milliseconds.get() - 1);
        assertEquals("day", game(5).path("phase").asText());
        advance(1);
        assertEquals("night", game(5).path("phase").asText());
        assertEquals(20_000, game(5).path("remainingMs").asLong());
        handler.tickFields();
        assertEquals(1_000, field(5).path("self").path("y").asDouble());
        move(5, 1_280, 1_020);
        handler.tickFields();
        assertEquals(1_000, field(5).path("self").path("y").asDouble(), "Night freezes accepted positions");
        chat(0, "mafia", "No Night whispers");
        assertEquals("malformed_message", latest(table.get(0)).path("code").asText());
        chat(5, "public", "No Night text");
        assertEquals("invalid_phase", latest(table.get(5)).path("code").asText());
        advance(19_999);
        assertEquals("night", game(5).path("phase").asText());
        advance(1);
        assertEquals("discussion", game(5).path("phase").asText());
        assertEquals(DISCUSSION, game(5).path("remainingMs").asLong());
        int ticks = countOfType(table.get(5), "field_state");
        handler.tickFields();
        assertEquals(ticks, countOfType(table.get(5), "field_state"));
        advance(DISCUSSION);
        assertEquals("voting", game(5).path("phase").asText());
        advance(VOTING);
        assertEquals("voting_result", game(5).path("phase").asText());
        assertTrue(game(5).path("outcome").path("eliminatedPlayerId").isNull());
        advance(VOTING_RESULT + 700);
        assertEquals("day", game(5).path("phase").asText());
        assertEquals(2, game(5).path("round").asInt());
        assertEquals(179_300, game(5).path("remainingMs").asLong(), "deadlines do not drift after a delayed sweep");
        handler.tickFields();
        assertEquals(RoomRules.seatY(5), field(5).path("self").path("y").asDouble());
    }

    @Test
    void dayHasNoPrivateMafiaChannelAndTownhallKeepsPublicDiscussion() throws Exception {
        startTable("chat", 10);
        advance(REVEAL);
        chat(0, "mafia", "No private channel");
        assertEquals("malformed_message", latest(table.get(0)).path("code").asText());
        chat(5, "public", "Hello?");
        assertEquals("chat_message", latest(table.get(5)).path("type").asText());
        advance(DAY + NIGHT);
        chat(0, "mafia", "Still no private channel");
        assertEquals("malformed_message", latest(table.get(0)).path("code").asText());
        chat(5, "public", "It was Player 0.");
        for (var member : table) assertTrue(member.payloads().stream().anyMatch(p -> p.contains("It was Player 0.")));
    }

    @Test
    void leavingDuringDayForfeitsAndRemovesTheAvatarFromTheField() throws Exception {
        startTable("leave", 10);
        advance(REVEAL);
        send(table.get(7), "{\"version\":1,\"type\":\"leave_room\"}");
        assertEquals("left", game(5).path("players").get(7).path("status").asText());
        handler.tickFields();
        assertFalse(fieldIds(6).contains(playerId(7)));
    }

    @Test
    void theVillageWinsByVotingOutTheMafia() throws Exception {
        startTable("vote", 4);
        advance(REVEAL + DAY + NIGHT + DISCUSSION);
        assertEquals("voting", game(1).path("phase").asText());
        for (int seat = 1; seat < 4; seat++) ballot(seat, 1, 0);
        ballot(0, 1, null);
        ballot(1, 1, 2);
        assertEquals("already_submitted", latest(table.get(1)).path("code").asText());
        advance(VOTING);
        assertEquals("voting_result", game(1).path("phase").asText());
        assertEquals(playerId(0), game(1).path("outcome").path("eliminatedPlayerId").asText());
        assertEquals("mafia", game(1).path("outcome").path("eliminatedRole").asText());
        assertEquals(4, game(1).path("ballots").size());
        advance(VOTING_RESULT - 1);
        assertEquals("voting_result", game(1).path("phase").asText());
        advance(1);
        assertEquals("finished", game(1).path("phase").asText());
        assertEquals("village", game(1).path("winner").asText());
        assertEquals(List.of("mafia", "doctor", "sheriff", "villager"), revealedRoles(game(1)));
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 3, 4, 9})
    void townhallRevealsOnlyTheEliminatedRoleForSixSecondsAndRecoversIt(int target) throws Exception {
        startTable("role-verdict", 10);
        String role = game(target).path("self").path("role").asText();
        advance(REVEAL + DAY + NIGHT + DISCUSSION);
        for (int seat = 0; seat < 6; seat++) ballot(seat, 1, target);
        for (int seat = 0; seat < 10; seat++) {
            assertTrue(game(seat).path("roles").isNull());
            assertTrue(game(seat).path("outcome").path("eliminatedPlayerId").isNull());
        }
        advance(VOTING);
        for (int seat = 0; seat < 10; seat++) {
            JsonNode result = game(seat);
            assertEquals("voting_result", result.path("phase").asText());
            assertEquals(6_000, result.path("remainingMs").asLong());
            assertEquals(role, result.path("outcome").path("eliminatedRole").asText());
            assertEquals(playerId(target), result.path("outcome").path("eliminatedPlayerId").asText());
            assertEquals("eliminated", result.path("players").get(target).path("status").asText());
            assertEquals(10, result.path("players").size());
            assertTrue(result.path("roles").isNull(), "Other Roles remain private");
        }
        handler.afterConnectionClosed(table.get(target), CloseStatus.NORMAL);
        var returned = connect("verdict-recovered");
        recover(returned, code, tokens.get(target));
        assertEquals(role, latestOfType(returned, "game_state").path("outcome").path("eliminatedRole").asText());
        advance(VOTING_RESULT - 1);
        assertEquals("voting_result", game(1).path("phase").asText());
        advance(1);
        assertEquals("day", game(1).path("phase").asText());
        assertEquals(2, game(1).path("round").asInt());
        assertTrue(game(1).path("outcome").isNull());
    }

    @ParameterizedTest
    @ValueSource(strings = {"tie", "plurality", "half", "skip-majority"})
    void tiesPluralitiesHalfAndSkipMajoritiesEliminateNobody(String scenario) throws Exception {
        startTable("no-majority", 10);
        advance(REVEAL + DAY + NIGHT + DISCUSSION);
        int votesForTarget = switch (scenario) { case "tie" -> 3; case "half" -> 5; default -> 4; };
        for (int seat = 0; seat < votesForTarget; seat++) ballot(seat, 1, 9);
        if (scenario.equals("tie") || scenario.equals("plurality")) {
            for (int seat = votesForTarget; seat < votesForTarget + 3; seat++) ballot(seat, 1, 8);
        } else if (scenario.equals("skip-majority")) {
            for (int seat = 4; seat < 10; seat++) ballot(seat, 1, null);
        }
        advance(VOTING);
        for (int seat = 0; seat < 10; seat++) {
            assertTrue(game(seat).path("outcome").path("eliminatedPlayerId").isNull());
            assertTrue(game(seat).path("outcome").path("eliminatedRole").isNull());
            assertEquals("living", game(seat).path("self").path("status").asText());
        }
        advance(VOTING_RESULT);
        assertEquals("day", game(0).path("phase").asText());
    }

    @Test
    void townhallParityVictoryWaitsForTheFullRoleVerdict() throws Exception {
        startTable("townhall-parity", 4);
        advance(REVEAL + DAY + NIGHT + DISCUSSION);
        for (int seat = 0; seat < 3; seat++) ballot(seat, 1, 1);
        advance(VOTING + VOTING_RESULT + DAY + NIGHT + DISCUSSION);
        assertEquals("voting", game(0).path("phase").asText());
        ballot(0, 2, 2);
        ballot(3, 2, 2);
        advance(VOTING);
        for (int seat = 0; seat < 4; seat++) {
            assertEquals("voting_result", game(seat).path("phase").asText());
            assertEquals("sheriff", game(seat).path("outcome").path("eliminatedRole").asText());
            assertTrue(game(seat).path("roles").isNull());
        }
        advance(VOTING_RESULT - 1);
        assertEquals("voting_result", game(0).path("phase").asText());
        advance(1);
        assertEquals("finished", game(0).path("phase").asText());
        assertEquals("mafia", game(0).path("winner").asText());
        assertEquals(List.of("mafia", "doctor", "sheriff", "villager"), revealedRoles(game(0)));
    }

    @Test
    void nightRecoveryRestoresSleepingPositionAndPrivateRoleWithoutWaitingForATick() throws Exception {
        startTable("night-recover", 10);
        advance(REVEAL);
        walk(5, 1_280, 1_000);
        advance(REVEAL + DAY - milliseconds.get());
        handler.afterConnectionClosed(table.get(5), CloseStatus.NORMAL);
        advance(5_000);
        var recovered = connect("night-recovered");
        recover(recovered, code, tokens.get(5));
        assertEquals(playerId(5), latestOfType(recovered, "room_snapshot").path("selfPlayerId").asText());
        assertEquals("night", latestOfType(recovered, "game_state").path("phase").asText());
        assertEquals(15_000, latestOfType(recovered, "game_state").path("remainingMs").asLong());
        JsonNode sleeping = latestOfType(recovered, "field_state");
        assertEquals(1_000, sleeping.path("self").path("y").asDouble());
        assertNoHiddenRolesLeaked(recovered);
        send(recovered, "{\"version\":1,\"type\":\"move\",\"x\":1280,\"y\":1020,\"facing\":\"down\"}");
        handler.tickFields();
        assertEquals(1_000, latestOfType(recovered, "field_state").path("self").path("y").asDouble());
    }

    @Test
    void retiredAbilitiesCannotInterruptDayOrNightAndCrowdingNeverMovesPlayers() throws Exception {
        startTable("retired", 10);
        advance(REVEAL);
        walk(6, RoomRules.seatX(5) - 50, RoomRules.seatY(5));
        JsonNode before = field(5).path("self");
        advance(10_000);
        handler.tickFields();
        assertEquals(before, field(5).path("self"), "standing nearby no longer causes a push");
        for (String ability : List.of("kill", "shield", "scan", "vanish", "report", "emergency")) {
            int othersBefore = countOfType(table.get(5), "game_state");
            ability(0, ability, 1, ability.equals("kill") || ability.equals("shield") || ability.equals("scan") ? 5 : null);
            assertEquals("unknown_message_type", latest(table.get(0)).path("code").asText());
            assertEquals(othersBefore, countOfType(table.get(5), "game_state"));
            assertEquals("day", game(0).path("phase").asText());
        }
        assertFalse(field(5).has("bodies"));
        assertFalse(field(5).path("self").has("crowding"));
        assertFalse(field(0).path("self").has("primaryCooldownMs"));
        advance(REVEAL + DAY - milliseconds.get());
        ability(0, "emergency", 1, null);
        assertEquals("unknown_message_type", latest(table.get(0)).path("code").asText());
        assertEquals("night", game(0).path("phase").asText());
    }

    @Test
    void townhallBallotIsPrivateAndRecoveryRetainsItUntilTheResult() throws Exception {
        startTable("ballot-recovery", 10);
        advance(REVEAL + DAY + NIGHT + DISCUSSION);
        var before = table.stream().map(member -> countOfType(member, "game_state")).toList();
        ballot(5, 1, null);
        for (int seat = 0; seat < 10; seat++) {
            assertEquals(before.get(seat) + (seat == 5 ? 1 : 0), countOfType(table.get(seat), "game_state"));
        }
        handler.afterConnectionClosed(table.get(5), CloseStatus.NORMAL);
        var recovered = connect("ballot-recovered");
        recover(recovered, code, tokens.get(5));
        JsonNode self = latestOfType(recovered, "game_state").path("self");
        assertTrue(self.path("meetingVoted").asBoolean());
        assertTrue(self.path("meetingVote").isNull());
        send(recovered, "{\"version\":1,\"type\":\"meeting_vote\",\"round\":1,\"targetPlayerId\":\"player-1\"}");
        assertEquals("already_submitted", latest(recovered).path("code").asText());
        advance(VOTING);
        assertEquals("voting_result", game(0).path("phase").asText());
        assertEquals(1, game(0).path("ballots").size());
        assertTrue(game(0).path("ballots").get(0).path("targetPlayerId").isNull());
    }

    @Test
    void forfeitsStillDecideImmediateParityAndVillageVictory() throws Exception {
        startTable("parity", 4);
        advance(REVEAL);
        send(table.get(3), "{\"version\":1,\"type\":\"leave_room\"}");
        assertEquals("day", game(0).path("phase").asText());
        send(table.get(2), "{\"version\":1,\"type\":\"leave_room\"}");
        assertEquals("finished", game(0).path("phase").asText());
        assertEquals("mafia", game(0).path("winner").asText());
        assertEquals(4, game(0).path("roles").size());
        table.clear();
        startTable("village-forfeit", 4);
        send(table.get(0), "{\"version\":1,\"type\":\"leave_room\"}");
        assertEquals("finished", game(1).path("phase").asText());
        assertEquals("village", game(1).path("winner").asText());
    }

    @Test
    void votingKeepsConfirmedSkipPrivateAndRecoversItWithoutClosingDiscussion() throws Exception {
        startTable("private-ballot", 4);
        advance(REVEAL + DAY + NIGHT + DISCUSSION);
        assertEquals(30_000, game(1).path("remainingMs").asLong());
        var counts = table.stream().map(session -> session.payloads().size()).toList();
        ballot(1, 1, null);
        for (int seat = 0; seat < 4; seat++) {
            assertEquals(counts.get(seat) + (seat == 1 ? 1 : 0), table.get(seat).payloads().size());
            assertTrue(game(seat).path("ballots").isNull());
            assertEquals(seat == 1, game(seat).path("self").path("meetingVoted").asBoolean());
            assertTrue(game(seat).path("self").path("meetingVote").isNull());
        }
        ballot(1, 1, 0);
        assertEquals("already_submitted", latest(table.get(1)).path("code").asText());
        ballot(2, 2, 0);
        assertEquals("invalid_phase", latest(table.get(2)).path("code").asText());
        assertFalse(game(2).path("self").path("meetingVoted").asBoolean());
        // Choosing yourself is allowed: every living Participant is an eligible target.
        ballot(2, 1, 2);
        assertEquals(playerId(2), game(2).path("self").path("meetingVote").asText());
        ballot(0, 1, null);
        ballot(3, 1, null);
        chat(1, "public", "Discussion stays open after Confirm");
        for (var session : table) {
            assertEquals("chat_message", latest(session).path("type").asText());
            assertEquals("Discussion stays open after Confirm", latest(session).path("text").asText());
        }
        handler.afterConnectionClosed(table.get(1), CloseStatus.NORMAL);
        var returned = connect("private-ballot-returned");
        recover(returned, code, tokens.get(1));
        JsonNode recovered = latestOfType(returned, "game_state");
        assertTrue(recovered.path("self").path("meetingVoted").asBoolean());
        assertTrue(recovered.path("self").path("meetingVote").isNull());
        assertTrue(recovered.path("ballots").isNull());
        assertEquals("Discussion stays open after Confirm",
                latestOfType(returned, "chat_history").path("messages").get(0).path("text").asText());
        send(returned, "{\"version\":1,\"type\":\"meeting_vote\",\"round\":1,\"targetPlayerId\":\"" + playerId(0) + "\"}");
        assertEquals("already_submitted", latest(returned).path("code").asText());
        advance(VOTING - 1);
        assertEquals("voting", game(0).path("phase").asText());
        advance(1);
        assertEquals("voting_result", game(0).path("phase").asText());
        assertTrue(game(0).path("outcome").path("eliminatedPlayerId").isNull());
        assertEquals(4, game(0).path("ballots").size());
    }

    @Test
    void rejectedBallotsDoNotRevealActivityToOtherRecipients() throws Exception {
        startTable("rejected-ballots", 10);
        ballot(1, 1, 0);
        assertEquals("invalid_phase", latest(table.get(1)).path("code").asText());
        advance(REVEAL + DAY + NIGHT + DISCUSSION);
        send(table.get(9), "{\"version\":1,\"type\":\"leave_room\"}");
        var counts = table.stream().map(session -> session.payloads().size()).toList();
        ballot(1, 1, 9);
        assertEquals("invalid_target", latest(table.get(1)).path("code").asText());
        ballot(1, 2, null);
        assertEquals("invalid_phase", latest(table.get(1)).path("code").asText());
        assertFalse(game(1).path("self").path("meetingVoted").asBoolean());
        for (int seat = 0; seat < 9; seat++) {
            assertEquals(counts.get(seat) + (seat == 1 ? 2 : 0), table.get(seat).payloads().size());
        }
        advance(VOTING);
        var afterDeadline = table.stream().map(session -> session.payloads().size()).toList();
        ballot(1, 1, null);
        assertEquals("invalid_phase", latest(table.get(1)).path("code").asText());
        for (int seat = 0; seat < 9; seat++) {
            assertEquals(afterDeadline.get(seat) + (seat == 1 ? 1 : 0), table.get(seat).payloads().size());
        }
    }

    @Test
    void anEliminatedParticipantCannotVoteButKeepsReceivingTownhallText() throws Exception {
        startTable("eliminated-ballot", 10);
        advance(REVEAL + DAY + NIGHT + DISCUSSION);
        for (int seat = 0; seat < 6; seat++) ballot(seat, 1, 9);
        advance(VOTING + VOTING_RESULT + DAY + NIGHT + DISCUSSION);
        assertEquals("voting", game(9).path("phase").asText());
        assertEquals("eliminated", game(9).path("self").path("status").asText());
        var counts = table.stream().map(session -> session.payloads().size()).toList();
        ballot(9, 2, null);
        assertEquals("invalid_action", latest(table.get(9)).path("code").asText());
        for (int seat = 0; seat < 9; seat++) assertEquals(counts.get(seat), table.get(seat).payloads().size());
        chat(9, "public", "The dead cannot speak");
        assertEquals("invalid_action", latest(table.get(9)).path("code").asText());
        chat(1, "public", "The dead can listen");
        assertEquals("The dead can listen", latest(table.get(9)).path("text").asText());
    }

    @Test
    void mafiaCanRevisePrivateNightChoicesUntilTheFixedDeadline() throws Exception {
        startTable("night-choices", 10);
        advance(REVEAL + DAY);
        var counts = table.stream().map(session -> session.payloads().size()).toList();
        send(table.get(0), "{\"version\":1,\"type\":\"night_choice\",\"round\":1,\"targetPlayerId\":\"player-6\"}");
        assertEquals("player-6", game(0).path("self").path("nightChoice").asText());
        for (int seat = 1; seat < 10; seat++) assertEquals(counts.get(seat), table.get(seat).payloads().size());
        send(table.get(0), "{\"version\":1,\"type\":\"night_choice\",\"round\":1,\"targetPlayerId\":\"player-7\"}");
        send(table.get(2), "{\"version\":1,\"type\":\"night_choice\",\"round\":1,\"targetPlayerId\":\"player-7\"}");
        advance(NIGHT - 1);
        assertEquals("night", game(0).path("phase").asText());
        advance(1);
        for (int seat = 0; seat < 10; seat++) {
            assertEquals("discussion", game(seat).path("phase").asText());
            assertEquals(List.of("player-7"), names(game(seat).path("outcome").path("deaths")));
        }
        assertTrue(game(6).path("self").path("killedByMafia").asBoolean());
    }

    @Test
    void missingOrDisagreeingMafiaChoicesDoNotKillAndNewRoundsClearChoices() throws Exception {
        startTable("night-majority", 10);
        advance(REVEAL + DAY);
        nightChoice(0, 1, 5);
        advance(NIGHT);
        assertEquals(List.of(), names(game(1).path("outcome").path("deaths")));
        advance(DISCUSSION + VOTING + VOTING_RESULT + DAY);
        assertTrue(game(0).path("self").path("nightChoice").isNull());
        nightChoice(0, 2, 5);
        nightChoice(2, 2, 6);
        advance(NIGHT);
        assertEquals(List.of(), names(game(1).path("outcome").path("deaths")));
    }

    @Test
    void nightChoicesRejectWrongRolesRoundsTargetsAndMalformedMessages() throws Exception {
        startTable("night-validation", 10);
        nightChoice(0, 1, 5);
        assertEquals("invalid_phase", latest(table.get(0)).path("code").asText());
        advance(REVEAL + DAY);
        nightChoice(1, 1, 5);
        assertEquals("invalid_action", latest(table.get(1)).path("code").asText());
        nightChoice(0, 2, 5);
        assertEquals("invalid_phase", latest(table.get(0)).path("code").asText());
        nightChoice(0, 1, 2);
        assertEquals("invalid_target", latest(table.get(0)).path("code").asText());
        nightChoice(0, 1, 99);
        assertEquals("invalid_target", latest(table.get(0)).path("code").asText());
        for (String fields : List.of("\"round\":0,\"targetPlayerId\":null", "\"round\":1", "\"round\":1,\"targetPlayerId\":5", "\"round\":1,\"targetPlayerId\":null,\"extra\":true")) {
            send(table.get(0), "{\"version\":1,\"type\":\"night_choice\"," + fields + "}");
            assertEquals("malformed_message", latest(table.get(0)).path("code").asText());
        }
        nightChoice(0, 1, 5);
        nightChoice(0, 1, null);
        assertTrue(game(0).path("self").path("nightChoice").isNull());
        milliseconds.addAndGet(NIGHT);
        nightChoice(0, 1, 5);
        assertEquals("invalid_phase", latest(table.get(0)).path("code").asText());
        assertEquals(List.of(), names(game(1).path("outcome").path("deaths")));
    }

    @Test
    void recoveryRetainsOnlyOwnNightChoiceAndDisconnectedMafiaStillCount() throws Exception {
        startTable("night-recovery", 10);
        advance(REVEAL + DAY);
        nightChoice(0, 1, 5);
        handler.afterConnectionClosed(table.get(0), CloseStatus.NORMAL);
        var replacement = connect("night-replacement");
        recover(replacement, code, tokens.get(0));
        assertEquals(playerId(5), latestOfType(replacement, "game_state").path("self").path("nightChoice").asText());
        assertTrue(game(1).path("self").path("nightChoice").isNull());
        handler.afterConnectionClosed(table.get(2), CloseStatus.NORMAL);
        advance(NIGHT);
        assertEquals(List.of(), names(game(1).path("outcome").path("deaths")));
    }

    @Test
    void aNightKillChecksParityOnlyAfterTheOutcomeIsComplete() throws Exception {
        startTable("night-parity", 5);
        advance(REVEAL + DAY);
        nightChoice(0, 1, 1);
        nightChoice(2, 1, 1);
        advance(NIGHT);
        assertEquals("finished", game(0).path("phase").asText());
        assertEquals("mafia", game(0).path("winner").asText());
        assertEquals(List.of(playerId(1)), names(game(0).path("outcome").path("deaths")));
        assertEquals("eliminated", game(1).path("self").path("status").asText());
    }

    private void nightChoice(int seat, int round, Integer targetSeat) throws Exception {
        send(table.get(seat), "{\"version\":1,\"type\":\"night_choice\",\"round\":" + round + ",\"targetPlayerId\":"
                + (targetSeat == null ? "null" : "\"" + playerId(targetSeat) + "\"") + "}");
    }

    @Test
    void doctorCanRevisePrivateProtectionAndSaveThemselvesAtTheNightDeadline() throws Exception {
        startTable("doctor-night", 10);
        advance(REVEAL + DAY);
        var counts = table.stream().map(session -> session.payloads().size()).toList();
        nightChoice(3, 1, 5);
        assertEquals(playerId(5), game(3).path("self").path("nightChoice").asText());
        for (int seat = 0; seat < 10; seat++) if (seat != 3)
            assertEquals(counts.get(seat), table.get(seat).payloads().size());
        nightChoice(3, 1, 3);
        nightChoice(0, 1, 3);
        nightChoice(2, 1, 3);
        handler.afterConnectionClosed(table.get(3), CloseStatus.NORMAL);
        var replacement = connect("doctor-replacement");
        recover(replacement, code, tokens.get(3));
        assertEquals(playerId(3), latestOfType(replacement, "game_state").path("self").path("nightChoice").asText());
        advance(NIGHT - 1);
        assertEquals("night", game(0).path("phase").asText());
        advance(1);
        assertEquals(List.of(), names(game(0).path("outcome").path("deaths")));
        assertEquals("living", latestOfType(replacement, "game_state").path("self").path("status").asText());
        advance(DISCUSSION + VOTING + VOTING_RESULT + DAY);
        nightChoice(0, 2, 3);
        nightChoice(2, 2, 3);
        advance(NIGHT);
        assertEquals(List.of(playerId(3)), names(game(0).path("outcome").path("deaths")));
    }

    @Test
    void withdrawnProtectionAndForfeitedDoctorsCannotSaveAVictim() throws Exception {
        startTable("doctor-withdrawal", 10);
        advance(REVEAL + DAY);
        nightChoice(3, 2, 5);
        assertEquals("invalid_phase", latest(table.get(3)).path("code").asText());
        nightChoice(3, 1, 99);
        assertEquals("invalid_target", latest(table.get(3)).path("code").asText());
        nightChoice(3, 1, 5);
        nightChoice(3, 1, null);
        nightChoice(0, 1, 5);
        nightChoice(2, 1, 5);
        advance(NIGHT);
        assertEquals(List.of(playerId(5)), names(game(0).path("outcome").path("deaths")));
        advance(DISCUSSION + VOTING + VOTING_RESULT + DAY);
        nightChoice(3, 2, 5);
        assertEquals("invalid_target", latest(table.get(3)).path("code").asText());
        nightChoice(3, 2, 6);
        send(table.get(3), "{\"version\":1,\"type\":\"leave_room\"}");
        nightChoice(0, 2, 6);
        nightChoice(2, 2, 6);
        advance(NIGHT);
        assertEquals(List.of(playerId(6)), names(game(0).path("outcome").path("deaths")));
    }

    @Test
    void sheriffsTimelyInvestigationResolvesPrivatelyEvenWhenKilledThatNight() throws Exception {
        startTable("sheriff-night", 10);
        advance(REVEAL + DAY);
        var counts = table.stream().map(session -> session.payloads().size()).toList();
        nightChoice(4, 1, 5);
        assertEquals(playerId(5), game(4).path("self").path("nightChoice").asText());
        for (int seat = 0; seat < 10; seat++) if (seat != 4)
            assertEquals(counts.get(seat), table.get(seat).payloads().size());
        nightChoice(4, 1, 0);
        nightChoice(0, 1, 4);
        nightChoice(2, 1, 4);
        advance(NIGHT);
        assertEquals("eliminated", game(4).path("self").path("status").asText());
        JsonNode result = game(4).path("self").path("investigations").get(0);
        assertEquals(1, result.path("round").asInt());
        assertEquals(playerId(0), result.path("targetPlayerId").asText());
        assertTrue(result.path("mafia").asBoolean());
        assertEquals(3, result.size(), "investigation reveals faction, never the exact Role");
        for (int seat = 0; seat < 10; seat++) if (seat != 4) {
            assertTrue(game(seat).path("self").path("investigations").isNull());
            assertTrue(game(seat).path("self").path("nightChoice").isNull());
        }
        handler.afterConnectionClosed(table.get(4), CloseStatus.NORMAL);
        var replacement = connect("sheriff-replacement");
        recover(replacement, code, tokens.get(4));
        assertEquals(result, latestOfType(replacement, "game_state").path("self").path("investigations").get(0));
    }

    @Test
    void sheriffCannotInvestigateSelfAndMissingChoicesDoNotCreateResults() throws Exception {
        startTable("sheriff-validation", 10);
        advance(REVEAL + DAY);
        nightChoice(4, 1, 4);
        assertEquals("invalid_target", latest(table.get(4)).path("code").asText());
        nightChoice(4, 2, 5);
        assertEquals("invalid_phase", latest(table.get(4)).path("code").asText());
        nightChoice(4, 1, 99);
        assertEquals("invalid_target", latest(table.get(4)).path("code").asText());
        nightChoice(4, 1, 5);
        nightChoice(4, 1, null);
        advance(NIGHT);
        assertEquals(0, game(4).path("self").path("investigations").size());
        advance(DISCUSSION + VOTING + VOTING_RESULT + DAY);
        nightChoice(4, 2, 3);
        advance(NIGHT);
        assertEquals(1, game(4).path("self").path("investigations").size());
        assertFalse(game(4).path("self").path("investigations").get(0).path("mafia").asBoolean());
        advance(DISCUSSION + VOTING + VOTING_RESULT + DAY + NIGHT);
        assertEquals(1, game(4).path("self").path("investigations").size(), "old choice must not investigate again");
    }

    @Test
    void allLivingRolesShareDayVisionAndBuildingWallsSeparateTheirViews() throws Exception {
        startTable("shared-vision", 10);
        advance(REVEAL);
        for (int seat : List.of(0, 1, 3, 4)) walk(seat, 1280, 742);
        walk(5, 1580, 742);
        for (int seat : List.of(0, 1, 3, 4)) assertTrue(fieldIds(seat).contains(playerId(5)), "Role in seat " + seat);
        walk(5, 1640, 742);
        for (int seat : List.of(0, 1, 3, 4)) assertFalse(fieldIds(seat).contains(playerId(5)), "same 320px limit for every Role");
        walk(0, 576, 742);
        walk(0, 576, 800);
        walk(1, 1280, 742);
        walk(1, 576, 742);
        walk(1, 576, 900);
        assertFalse(fieldIds(0).contains(playerId(1)), "the outdoor Player cannot see inside the General Store");
        assertFalse(fieldIds(1).contains(playerId(0)), "the indoor Player cannot see outside");
        walk(0, 576, 900);
        assertTrue(fieldIds(0).contains(playerId(1)));
        assertTrue(fieldIds(1).contains(playerId(0)));
        move(0, 448, 900);
        handler.tickFields();
        assertEquals(576, field(0).path("self").path("x").asDouble(), "wall crossing is corrected");
    }

    @Test
    void dayTextUsesAcceptedProximityAtSendTimeAndRecoveryNeverWidensHistory() throws Exception {
        startTable("proximity-text", 10);
        advance(REVEAL);
        walk(0, 1280, 742);
        walk(1, 1400, 742);
        walk(2, 1480, 742);
        walk(5, 1280, 1200);
        chat(0, "public", "Only nearby listeners");
        assertEquals("chat_message", latest(table.get(0)).path("type").asText());
        assertEquals("Only nearby listeners", latestOfType(table.get(1), "chat_message").path("text").asText());
        assertEquals(0, countOfType(table.get(2), "chat_message"));
        walk(2, 1320, 742);
        handler.afterConnectionClosed(table.get(2), CloseStatus.NORMAL);
        var recovered = connect("proximity-recovered");
        recover(recovered, code, tokens.get(2));
        assertEquals(0, latestOfType(recovered, "chat_history").path("messages").size());
        handler.afterConnectionClosed(table.get(1), CloseStatus.NORMAL);
        var listener = connect("listener-recovered");
        recover(listener, code, tokens.get(1));
        assertEquals("Only nearby listeners", latestOfType(listener, "chat_history").path("messages").get(0).path("text").asText());
        var distantBefore = countOfType(table.get(5), "chat_message");
        move(5, 1280, 742); // an impossible teleport must not grant hearing
        chat(0, "public", "Accepted positions only");
        assertEquals(distantBefore, countOfType(table.get(5), "chat_message"));
        chat(0, "mafia", "No private channel");
        assertEquals("malformed_message", latest(table.get(0)).path("code").asText());
        advance(REVEAL + DAY - milliseconds.get());
        chat(0, "public", "Night is silent");
        assertEquals("invalid_phase", latest(table.get(0)).path("code").asText());
    }

    @Test
    void buildingBoundariesExcludeDayTextEvenInsideHearingRange() throws Exception {
        startTable("interior-text", 10);
        advance(REVEAL);
        walk(0, 576, 742);
        walk(0, 576, 800);
        walk(1, 1280, 742);
        walk(1, 576, 742);
        walk(1, 576, 900);
        chat(0, "public", "Outside the store");
        assertEquals(0, countOfType(table.get(1), "chat_message"));
        walk(0, 576, 900);
        chat(0, "public", "Inside the store");
        assertEquals("Inside the store", latestOfType(table.get(1), "chat_message").path("text").asText());
    }

    @Test
    void repairTasksArePrivatePersistentAndRequireAssignedNearbyTimedSteps() throws Exception {
        startTable("repair-tasks", 4);
        JsonNode tasks = latestOfType(table.get(1), "task_state");
        assertEquals(3, tasks.path("tasks").size());
        assertEquals(9, tasks.path("total").asInt());
        assertEquals(0, tasks.path("completed").asInt());
        String taskId = tasks.path("tasks").get(0).path("taskId").asText();
        send(table.get(1), "{\"version\":1,\"type\":\"open_task\",\"round\":1,\"taskId\":\"" + taskId + "\"}");
        assertEquals("invalid_phase", latest(table.get(1)).path("code").asText());
        advance(REVEAL);
        send(table.get(0), "{\"version\":1,\"type\":\"open_task\",\"round\":1,\"taskId\":\"" + taskId + "\"}");
        assertEquals("invalid_task", latest(table.get(0)).path("code").asText());
        JsonNode task = tasks.path("tasks").get(0);
        walk(1, 1280, 742);
        walk(1, task.path("x").asDouble(), task.path("y").asDouble());
        send(table.get(1), "{\"version\":1,\"type\":\"open_task\",\"round\":1,\"taskId\":\"" + taskId + "\"}");
        String step = "{\"version\":1,\"type\":\"task_step\",\"round\":1,\"taskId\":\"" + taskId + "\",\"step\":0,\"value\":0}";
        send(table.get(1), step);
        assertEquals("invalid_task", latest(table.get(1)).path("code").asText());
        advance(4_000);
        send(table.get(1), step);
        assertEquals(1, latestOfType(table.get(1), "task_state").path("tasks").get(0).path("step").asInt());
        send(table.get(1), step);
        assertEquals("invalid_task", latest(table.get(1)).path("code").asText());
        handler.afterConnectionClosed(table.get(1), CloseStatus.NORMAL);
        var recovered = connect("task-recovered");
        recover(recovered, code, tokens.get(1));
        assertEquals(1, latestOfType(recovered, "task_state").path("tasks").get(0).path("step").asInt());
        advance(REVEAL + DAY - milliseconds.get());
        assertTrue(latestOfType(recovered, "task_state").path("activeTaskId").isNull());
        assertEquals(1, latestOfType(recovered, "task_state").path("tasks").get(0).path("step").asInt());
    }

    @Test
    void sequenceTasksValidateOrderAndPersistEarnedInputsAcrossRecovery() throws Exception {
        startTable("sequence-tasks", 4);
        advance(REVEAL);
        JsonNode task = latestOfType(table.get(1), "task_state").path("tasks").get(1);
        assertEquals("sequence", task.path("kind").asText());
        walkToTask(1, task);
        openTask(1, task.path("taskId").asText());
        advance(1000);
        taskStep(1, task.path("taskId").asText(), 0, 99);
        assertEquals("invalid_task", latest(table.get(1)).path("code").asText());
        taskStep(1, task.path("taskId").asText(), 0, task.path("sequence").get(0).asInt());
        assertEquals(1, latestOfType(table.get(1), "task_state").path("tasks").get(1).path("step").asInt());
        taskStep(1, task.path("taskId").asText(), 0, task.path("sequence").get(0).asInt());
        assertEquals("invalid_task", latest(table.get(1)).path("code").asText());
        handler.afterConnectionClosed(table.get(1), CloseStatus.NORMAL);
        var recovered = connect("sequence-recovered");
        recover(recovered, code, tokens.get(1));
        assertEquals(1, latestOfType(recovered, "task_state").path("tasks").get(1).path("step").asInt());
    }

    @Test
    void deliveryKeepsCarriedItemsAndRequiresTheAssignedDestination() throws Exception {
        startTable("delivery-tasks", 4);
        advance(REVEAL);
        JsonNode task = latestOfType(table.get(1), "task_state").path("tasks").get(2);
        assertEquals("delivery", task.path("kind").asText());
        walkToTask(1, task);
        openTask(1, task.path("taskId").asText());
        advance(1000);
        taskStep(1, task.path("taskId").asText(), 0, 0);
        JsonNode carrying = latestOfType(table.get(1), "task_state").path("tasks").get(2);
        assertEquals(1, carrying.path("step").asInt());
        assertNotEquals(task.path("x").asDouble(), carrying.path("x").asDouble());
        openTask(1, task.path("taskId").asText());
        assertEquals("invalid_task", latest(table.get(1)).path("code").asText());
        handler.afterConnectionClosed(table.get(1), CloseStatus.NORMAL);
        var recovered = connect("delivery-recovered");
        recover(recovered, code, tokens.get(1));
        table.set(1, recovered);
        assertEquals(carrying, latestOfType(recovered, "task_state").path("tasks").get(2));
        walkToTask(1, carrying);
        openTask(1, carrying.path("taskId").asText());
        advance(1000);
        taskStep(1, carrying.path("taskId").asText(), 1, 0);
        assertEquals(2, latestOfType(recovered, "task_state").path("tasks").get(2).path("step").asInt());
        taskStep(1, carrying.path("taskId").asText(), 1, 0);
        assertEquals("invalid_task", latest(recovered).path("code").asText());
    }

    @Test
    void mafiaFakeTasksUseAllInteractionsWithoutAdvancingTheOriginalVillageWorkload() throws Exception {
        startTable("fake-tasks", 4);
        advance(REVEAL);
        JsonNode state = latestOfType(table.get(0), "task_state");
        assertEquals(3, state.path("tasks").size());
        assertEquals(List.of("repair", "sequence", "delivery"),
                java.util.stream.StreamSupport.stream(state.path("tasks").spliterator(), false).map(task -> task.path("kind").asText()).toList());
        for (JsonNode task : state.path("tasks")) assertTrue(task.path("fake").asBoolean());
        JsonNode task = state.path("tasks").get(0);
        walkToTask(0, task);
        int otherBefore = countOfType(table.get(1), "task_state");
        for (int step = 0; step < task.path("steps").asInt(); step++) {
            openTask(0, task.path("taskId").asText()); advance(4000);
            taskStep(0, task.path("taskId").asText(), step, 0);
        }
        assertEquals(0, latestOfType(table.get(0), "task_state").path("completed").asInt());
        assertEquals(9, latestOfType(table.get(0), "task_state").path("total").asInt());
        assertEquals(otherBefore, countOfType(table.get(1), "task_state"), "Fake activity is private");
        String realTask = latestOfType(table.get(1), "task_state").path("tasks").get(0).path("taskId").asText();
        openTask(0, realTask);
        assertEquals("invalid_task", latest(table.get(0)).path("code").asText());
        assertEquals("day", game(0).path("phase").asText());
    }

    @Test
    void completingTheLastOriginalRealTaskWinsImmediatelyWithoutANightOrRoundQuota() throws Exception {
        startTable("task-victory", 4);
        advance(REVEAL);
        for (int seat = 1; seat < 4; seat++) {
            List<String> taskIds = new ArrayList<>();
            for (JsonNode task : latestOfType(table.get(seat), "task_state").path("tasks")) taskIds.add(task.path("taskId").asText());
            for (String taskId : taskIds) completeTask(seat, taskId);
        }
        for (int seat = 0; seat < 4; seat++) {
            assertEquals("finished", game(seat).path("phase").asText());
            assertEquals("village", game(seat).path("winner").asText());
            assertEquals(4, game(seat).path("roles").size());
            assertEquals(9, latestOfType(table.get(seat), "task_state").path("completed").asInt());
            assertTrue(game(seat).path("remainingMs").isNull());
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"night", "meeting"})
    void eliminatedVillageParticipantsContinueTasksAsInvisibleReadOnlyGhosts(String cause) throws Exception {
        startTable("ghost-task-" + cause, 10);
        advance(REVEAL + DAY);
        if (cause.equals("night")) { nightChoice(0, 1, 5); nightChoice(2, 1, 5); }
        advance(NIGHT + DISCUSSION);
        if (cause.equals("meeting")) for (int seat = 0; seat < 6; seat++) ballot(seat, 1, 5);
        advance(VOTING + VOTING_RESULT);
        assertEquals("eliminated", game(5).path("self").path("status").asText());
        String taskId = latestOfType(table.get(5), "task_state").path("tasks").get(0).path("taskId").asText();
        completeTask(5, taskId);
        assertEquals(1, latestOfType(table.get(0), "task_state").path("completed").asInt());
        handler.tickFields();
        for (int seat = 0; seat < 10; seat++) if (seat != 5) {
            assertFalse(fieldIds(seat).contains(playerId(5)));
            for (JsonNode task : latestOfType(table.get(seat), "task_state").path("tasks"))
                assertNotEquals(taskId, task.path("taskId").asText());
        }
        chat(5, "public", "Ghost must not speak");
        assertEquals("invalid_action", latest(table.get(5)).path("code").asText());
        advance(game(5).path("remainingMs").asLong());
        nightChoice(5, game(5).path("round").asInt(), 1);
        assertEquals("invalid_action", latest(table.get(5)).path("code").asText());
        handler.afterConnectionClosed(table.get(5), CloseStatus.NORMAL);
        var recovered = connect("ghost-task-recovered"); recover(recovered, code, tokens.get(5));
        assertEquals(3, latestOfType(recovered, "task_state").path("tasks").get(0).path("step").asInt());
    }

    @ParameterizedTest
    @ValueSource(strings = {"leave", "expiry"})
    void forfeitTransfersUnfinishedOriginalTasksAndKeepsEarnedProgress(String cause) throws Exception {
        startTable("transfer-" + cause, 4); advance(REVEAL);
        JsonNode task = latestOfType(table.get(1), "task_state").path("tasks").get(0);
        String taskId = task.path("taskId").asText();
        walkToTask(1, task); openTask(1, taskId); advance(4000); taskStep(1, taskId, 0, 0);
        int two = latestOfType(table.get(2), "task_state").path("tasks").size();
        handler.afterConnectionClosed(table.get(1), CloseStatus.NORMAL);
        assertEquals(two, latestOfType(table.get(2), "task_state").path("tasks").size(), "Disconnect keeps ownership");
        if (cause.equals("leave")) {
            var recovered = connect("transfer-recovered"); recover(recovered, code, tokens.get(1));
            send(recovered, "{\"version\":1,\"type\":\"leave_room\"}");
        } else advance(120000);
        int received = 0;
        boolean retainedStep = false;
        for (int seat : List.of(2, 3)) {
            JsonNode state = latestOfType(table.get(seat), "task_state");
            assertEquals(9, state.path("total").asInt());
            assertEquals(0, state.path("completed").asInt());
            received += state.path("tasks").size();
            for (JsonNode assignment : state.path("tasks")) if (assignment.path("taskId").asText().equals(taskId)) {
                retainedStep = true; assertEquals(1, assignment.path("step").asInt());
            }
        }
        assertEquals(9, received);
        assertTrue(retainedStep, "Earned stages follow the original assignment");
        handler.afterConnectionClosed(table.get(1), CloseStatus.NORMAL);
        assertEquals(9, latestOfType(table.get(2), "task_state").path("total").asInt());
    }

    @Test
    void practicePreviewsEveryRoleAndTargetWithoutAddingCompetitivePlayersOrVictory() throws Exception {
        var host = connect("role-preview");
        send(host, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Host\"}");
        code = latest(host).path("roomId").asText(); table.add(host);
        send(host, "{\"version\":1,\"type\":\"start_practice\"}");
        assertEquals(3, latestOfType(host, "practice_state").path("targets").size());
        send(host, "{\"version\":1,\"type\":\"preview_role\",\"role\":\"sheriff\"}");
        assertEquals("sheriff", game(0).path("self").path("role").asText());
        nextPractice(host, 1, "day");
        send(host, "{\"version\":1,\"type\":\"night_choice\",\"round\":1,\"targetPlayerId\":\"practice-mafia\"}");
        nextPractice(host, 1, "night");
        assertTrue(game(0).path("self").path("investigations").get(0).path("mafia").asBoolean());
        assertEquals(1, game(0).path("players").size());
        send(host, "{\"version\":1,\"type\":\"preview_role\",\"role\":\"doctor\"}");
        nextPractice(host, 1, "discussion");
        send(host, "{\"version\":1,\"type\":\"meeting_vote\",\"round\":1,\"targetPlayerId\":\"practice-mafia\"}");
        nextPractice(host, 1, "voting");
        assertEquals("mafia", game(0).path("outcome").path("eliminatedRole").asText());
        nextPractice(host, 1, "voting_result");
        send(host, "{\"version\":1,\"type\":\"preview_role\",\"role\":\"mafia\"}");
        nextPractice(host, 2, "day");
        send(host, "{\"version\":1,\"type\":\"night_choice\",\"round\":2,\"targetPlayerId\":\"practice-villager\"}");
        nextPractice(host, 2, "night");
        assertEquals("practice-villager", game(0).path("outcome").path("deaths").get(0).asText());
        assertTrue(game(0).path("winner").isNull());
        assertEquals("practice", game(0).path("mode").asText());
    }

    @Test
    void practiceRetainsSeparateRealAndFakeTaskProgressAcrossRolesAndRecoveryWithoutVictory() throws Exception {
        var host = connect("practice-tasks");
        send(host, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Host\"}");
        code = latest(host).path("roomId").asText(); String token = latest(host).path("recoveryToken").asText(); table.add(host);
        send(host, "{\"version\":1,\"type\":\"start_practice\"}");
        List<String> ids = new ArrayList<>();
        for (JsonNode task : latestOfType(host, "task_state").path("tasks")) ids.add(task.path("taskId").asText());
        completeTask(0, ids.get(0));
        send(host, "{\"version\":1,\"type\":\"preview_role\",\"role\":\"mafia\"}");
        for (JsonNode task : latestOfType(host, "task_state").path("tasks")) assertTrue(task.path("fake").asBoolean());
        assertEquals(1, latestOfType(host, "task_state").path("completed").asInt());
        String fake = latestOfType(host, "task_state").path("tasks").get(0).path("taskId").asText();
        completeTask(0, fake);
        send(host, "{\"version\":1,\"type\":\"preview_role\",\"role\":\"doctor\"}");
        assertEquals(3, latestOfType(host, "task_state").path("tasks").get(0).path("step").asInt());
        completeTask(0, ids.get(1)); completeTask(0, ids.get(2));
        assertEquals(3, latestOfType(host, "task_state").path("completed").asInt());
        assertEquals("day", game(0).path("phase").asText()); assertTrue(game(0).path("winner").isNull());
        handler.afterConnectionClosed(host, CloseStatus.NORMAL);
        var recovered = connect("practice-tasks-recovered"); recover(recovered, code, token);
        assertEquals(3, latestOfType(recovered, "task_state").path("completed").asInt());
        assertEquals("doctor", latestOfType(recovered, "game_state").path("self").path("role").asText());
    }

    // ----- helpers ------------------------------------------------------------------------

    private void ensureDay(int seat) {
        while (!game(seat).path("phase").asText().equals("day")) {
            assertNotEquals("finished", game(seat).path("phase").asText());
            advance(Math.max(1, game(seat).path("remainingMs").asLong()));
        }
        if (game(seat).path("remainingMs").isNumber() && game(seat).path("remainingMs").asLong() < 60000) {
            advance(game(seat).path("remainingMs").asLong()); ensureDay(seat);
        }
    }
    private void completeTask(int seat, String taskId) throws Exception {
        for (;;) {
            JsonNode task = null;
            for (JsonNode candidate : latestOfType(table.get(seat), "task_state").path("tasks"))
                if (candidate.path("taskId").asText().equals(taskId)) task = candidate;
            if (task == null) throw new IllegalStateException("Missing assignment " + taskId);
            int step = task.path("step").asInt();
            if (step == task.path("steps").asInt()) return;
            ensureDay(seat);
            walkToTask(seat, task); openTask(seat, taskId);
            advance(task.path("kind").asText().equals("repair") ? 4000 : 1000);
            int value = task.path("kind").asText().equals("sequence") ? task.path("sequence").get(step).asInt() : 0;
            taskStep(seat, taskId, step, value);
            assertNotEquals("error", latest(table.get(seat)).path("type").asText(), latest(table.get(seat)).toString());
        }
    }

    private void openTask(int seat, String taskId) throws Exception {
        send(table.get(seat), "{\"version\":1,\"type\":\"open_task\",\"round\":" + game(seat).path("round").asInt() + ",\"taskId\":\"" + taskId + "\"}");
    }
    private void taskStep(int seat, String taskId, int step, int value) throws Exception {
        send(table.get(seat), "{\"version\":1,\"type\":\"task_step\",\"round\":" + game(seat).path("round").asInt() + ",\"taskId\":\"" + taskId + "\",\"step\":" + step + ",\"value\":" + value + "}");
    }
    /** Navigate real move requests through the existing map, never mutate Game positions. */
    private void walkToTask(int seat, JsonNode task) throws Exception {
        record Cell(int x, int y) {}
        handler.tickFields();
        JsonNode position = field(seat).path("self");
        Cell start = new Cell((int) Math.round(position.path("x").asDouble() / 16) * 16,
                (int) Math.round(position.path("y").asDouble() / 16) * 16);
        if (!RoomRules.walkable(start.x(), start.y())) throw new IllegalStateException("No walkable starting cell");
        var queue = new java.util.ArrayDeque<Cell>();
        var previous = new java.util.HashMap<Cell, Cell>();
        queue.add(start); previous.put(start, start);
        Cell goal = null;
        while (!queue.isEmpty()) {
            Cell cell = queue.remove();
            if (Math.hypot(cell.x() - task.path("x").asDouble(), cell.y() - task.path("y").asDouble()) <= 48
                    && RoomRules.areaAt(cell.x(), cell.y()).equals(RoomRules.areaAt(task.path("x").asDouble(), task.path("y").asDouble()))) { goal = cell; break; }
            for (Cell next : List.of(new Cell(cell.x() + 16, cell.y()), new Cell(cell.x() - 16, cell.y()),
                    new Cell(cell.x(), cell.y() + 16), new Cell(cell.x(), cell.y() - 16))) {
                if (!previous.containsKey(next) && RoomRules.walkable(next.x(), next.y())) {
                    previous.put(next, cell); queue.add(next);
                }
            }
        }
        if (goal == null) throw new IllegalStateException("No route to " + task);
        var route = new ArrayList<Cell>();
        for (Cell cell = goal; !cell.equals(start); cell = previous.get(cell)) route.add(cell);
        route.add(start); java.util.Collections.reverse(route);
        for (Cell cell : route) { advance(100); move(seat, cell.x(), cell.y()); }
        handler.tickFields();
        assertTrue(Math.hypot(field(seat).path("self").path("x").asDouble() - task.path("x").asDouble(),
                field(seat).path("self").path("y").asDouble() - task.path("y").asDouble()) <= 64, "Task point must be reachable");
    }

    private void startTable(String label, int players) throws Exception {
        if (players >= 5) startTable(label, players, 2, 1, 1);
        else startTable(label, players, 1, 1, 1);
    }

    /** All living Roles use the shared Vision boundary. */
    private double visionOf(int seat) {
        return FieldRules.DAY_VISION;
    }

    private void roleSetup(int seat, int mafia, int doctors, int sheriffs) throws Exception {
        send(table.get(seat), "{\"version\":1,\"type\":\"set_role_setup\",\"mafia\":" + mafia
                + ",\"doctors\":" + doctors + ",\"sheriffs\":" + sheriffs + "}");
    }

    private java.util.EnumMap<Role, Integer> roleCounts(int players) {
        var counts = new java.util.EnumMap<Role, Integer>(Role.class);
        for (int seat = 0; seat < players; seat++) {
            Role role = Role.valueOf(game(seat).path("self").path("role").asText().toUpperCase());
            counts.merge(role, 1, Integer::sum);
            assertEquals(role.faction().wireValue(), game(seat).path("self").path("faction").asText());
        }
        return counts;
    }

    private void startTable(String label, int players, int mafia, int doctors, int sheriffs) throws Exception {
        tokens.clear();
        var host = connect(label + "-0");
        send(host, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Player 0\"}");
        code = latest(host).path("roomId").asText();
        tokens.add(latest(host).path("recoveryToken").asText());
        table.add(host);
        for (int seat = 1; seat < players; seat++) {
            var guest = connect(label + "-" + seat);
            send(guest, "{\"version\":1,\"type\":\"join_room\",\"roomId\":\"" + code + "\",\"displayName\":\"Player " + seat + "\"}");
            tokens.add(json(guest.payloads().get(0)).path("recoveryToken").asText());
            table.add(guest);
        }
        roleSetup(0, mafia, doctors, sheriffs);
        for (var member : table) send(member, "{\"version\":1,\"type\":\"set_ready\",\"ready\":true}");
        send(host, "{\"version\":1,\"type\":\"start_game\"}");
    }

    private void advance(long millis) {
        milliseconds.addAndGet(millis);
        handler.settleRooms();
    }

    /** Walks a Player in honest steps from their current position to the given point. */
    private void walk(int seat, double x, double y) throws Exception {
        handler.tickFields();
        JsonNode self = field(seat).path("self");
        double currentX = self.path("x").asDouble();
        double currentY = self.path("y").asDouble();
        while (Math.hypot(x - currentX, y - currentY) > 0.01) {
            double distance = Math.hypot(x - currentX, y - currentY);
            double step = Math.min(20, distance);
            currentX += (x - currentX) / distance * step;
            currentY += (y - currentY) / distance * step;
            milliseconds.addAndGet(100);
            move(seat, currentX, currentY);
        }
        handler.tickFields();
        assertEquals(x, field(seat).path("self").path("x").asDouble(), 0.01, "walk refused for seat " + seat);
    }

    private void move(int seat, double x, double y) throws Exception {
        send(table.get(seat), "{\"version\":1,\"type\":\"move\",\"x\":" + x + ",\"y\":" + y + ",\"facing\":\"down\"}");
    }

    private static String playerId(int seat) { return "player-" + (seat + 1); }

    private void ability(int seat, String ability, int round, Integer targetSeat) throws Exception {
        send(table.get(seat), "{\"version\":1,\"type\":\"use_ability\",\"ability\":\"" + ability + "\",\"round\":" + round
                + ",\"targetPlayerId\":" + (targetSeat == null ? "null" : "\"" + playerId(targetSeat) + "\"") + "}");
    }

    private void ballot(int seat, int round, Integer targetSeat) throws Exception {
        send(table.get(seat), "{\"version\":1,\"type\":\"meeting_vote\",\"round\":" + round + ",\"targetPlayerId\":"
                + (targetSeat == null ? "null" : "\"" + playerId(targetSeat) + "\"") + "}");
    }

    private void chat(int seat, String channel, String text) throws Exception {
        send(table.get(seat), "{\"version\":1,\"type\":\"send_chat\",\"channel\":\"" + channel + "\",\"text\":\"" + text + "\"}");
    }

    private JsonNode game(int seat) { return latestOfType(table.get(seat), "game_state"); }

    private JsonNode field(int seat) { return latestOfType(table.get(seat), "field_state"); }

    private Set<String> fieldIds(int seat) {
        Set<String> ids = new HashSet<>();
        field(seat).path("players").forEach(node -> ids.add(node.path("playerId").asText()));
        return ids;
    }

    private JsonNode fieldPlayer(int seat, String playerId) {
        for (JsonNode node : field(seat).path("players")) if (node.path("playerId").asText().equals(playerId)) return node;
        throw new AssertionError(playerId + " is not in seat " + seat + "'s field");
    }

    private int countOfType(RecordingWebSocketSession session, String type) {
        return (int) session.payloads().stream().filter(payload -> payload.contains("\"type\":\"" + type + "\"")).count();
    }

    private static List<String> revealedRoles(JsonNode state) {
        var values = new ArrayList<String>();
        state.path("roles").forEach(node -> values.add(node.path("role").asText()));
        return values;
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
