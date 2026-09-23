package dev.lpa.pu_go.websocket.handler;

import dev.lpa.pu_go.avatar.AvatarCollection;
import dev.lpa.pu_go.avatar.AvatarPreset;
import dev.lpa.pu_go.game.FieldRules;
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
    private static final long ROAM = 150_000;
    private static final long MEETING_CALL = 5_000;
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
    private final AtomicReference<UnaryOperator<List<Role>>> assignment = new AtomicReference<>(UnaryOperator.identity());
    private final GameWebSocketHandler handler = new GameWebSocketHandler(
            new RoomManager(milliseconds::get, () -> COLLECTION), Runnable::run,
            () -> "player-" + playerIds.incrementAndGet(), roles -> assignment.get().apply(roles));

    private final List<RecordingWebSocketSession> table = new ArrayList<>();
    private final List<String> tokens = new ArrayList<>();
    private String code;

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
    void theDealScalesWithTheTableAndIsIndependentOfSeats() throws Exception {
        int[] expectedMafia = {1, 1, 1, 2, 2, 3, 3};
        for (int players = 4; players <= 10; players++) {
            table.clear();
            startTable("deal-" + players, players);
            var counts = new java.util.EnumMap<Role, Integer>(Role.class);
            for (int seat = 0; seat < players; seat++) {
                Role role = Role.valueOf(game(seat).path("self").path("role").asText().toUpperCase());
                counts.merge(role, 1, Integer::sum);
                assertEquals(role.faction().wireValue(), game(seat).path("self").path("faction").asText());
            }
            assertEquals(expectedMafia[players - 4], counts.get(Role.MAFIA));
            assertEquals(1, counts.get(Role.DOCTOR));
            assertEquals(1, counts.get(Role.SHERIFF));
            assertEquals(players - expectedMafia[players - 4] - 2, counts.getOrDefault(Role.VILLAGER, 0));
            send(table.get(0), "{\"version\":1,\"type\":\"start_game\"}");
            assertEquals("invalid_phase", latest(table.get(0)).path("code").asText());
        }
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
    void theRoleRevealIsPrivateAndOnlyMafiaLearnTheirTeam() throws Exception {
        startTable("reveal", 10);
        assertEquals("role_reveal", game(0).path("phase").asText());
        assertEquals(REVEAL, game(0).path("remainingMs").asLong());
        assertEquals(List.of("player-1", "player-2", "player-3"), names(game(1).path("self").path("mafiaTeam")));
        for (int seat = 3; seat < 10; seat++) {
            assertTrue(game(seat).path("self").path("mafiaTeam").isNull());
            assertNoHiddenRolesLeaked(table.get(seat));
        }
        assertEquals("doctor", game(3).path("self").path("role").asText());
        assertEquals("sheriff", game(4).path("self").path("role").asText());
        assertEquals("villager", game(7).path("self").path("role").asText());
    }

    // ----- the Roam: movement and sight ---------------------------------------------------

    @Test
    void theRoamBeginsAtTheSeatsAndStreamsOnlyWhatEachPlayerCanSee() throws Exception {
        startTable("sight", 10);
        advance(REVEAL);
        assertEquals("roam", game(5).path("phase").asText());
        assertEquals(1, game(5).path("round").asInt());
        assertEquals(ROAM, game(5).path("remainingMs").asLong());
        handler.tickFields();
        for (int seat = 0; seat < 10; seat++) {
            JsonNode self = field(seat).path("self");
            assertEquals(RoomRules.seatX(seat), self.path("x").asDouble());
            assertEquals(RoomRules.seatY(seat), self.path("y").asDouble());
            Set<String> expected = new HashSet<>();
            for (int other = 0; other < 10; other++) {
                double distance = Math.hypot(RoomRules.seatX(other) - RoomRules.seatX(seat), RoomRules.seatY(other) - RoomRules.seatY(seat));
                if (distance <= FieldRules.VISION) expected.add(playerId(other));
            }
            assertEquals(expected, fieldIds(seat), "seat " + seat);
        }
        // Opposite sides of the Hall are out of each other's sight.
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
        walk(5, 760, 900);
        milliseconds.addAndGet(100);
        move(5, 720, 900);
        handler.tickFields();
        assertEquals(760, field(5).path("self").path("x").asDouble(), 0.5);
        // A reachable step is accepted and seen by others.
        milliseconds.addAndGet(100);
        move(5, 775, 900);
        handler.tickFields();
        assertEquals(775, field(5).path("self").path("x").asDouble(), 0.5);
        send(table.get(5), "{\"version\":1,\"type\":\"move\",\"x\":\"far\",\"y\":1,\"facing\":\"up\"}");
        assertEquals("malformed_message", latest(table.get(5)).path("code").asText());
    }

    // ----- kills, Bodies and Meetings -----------------------------------------------------

    @Test
    void aKillLeavesABodyAndStaysSecretFromTheVillageUntilItIsReported() throws Exception {
        startTable("kill", 10);
        advance(REVEAL + FieldRules.OPENING_COOLDOWN);
        double bodyX = RoomRules.seatX(9);
        double bodyY = RoomRules.seatY(9);
        walk(0, bodyX + 40, bodyY);
        int villageStates = countOfType(table.get(5), "game_state");
        ability(0, "kill", 1, 9);
        assertEquals("eliminated", game(9).path("self").path("status").asText());
        assertTrue(game(9).path("self").path("killedByMafia").asBoolean());
        // The Mafia learn at once; the living Village receives nothing at all.
        assertEquals("eliminated", game(1).path("players").get(9).path("status").asText());
        assertEquals(villageStates, countOfType(table.get(5), "game_state"));
        assertEquals("living", game(5).path("players").get(9).path("status").asText());
        handler.tickFields();
        for (int seat = 0; seat < 9; seat++) {
            JsonNode self = field(seat).path("self");
            boolean near = Math.hypot(self.path("x").asDouble() - bodyX, self.path("y").asDouble() - bodyY) <= FieldRules.VISION;
            assertEquals(near ? 1 : 0, field(seat).path("bodies").size(), "seat " + seat);
            assertFalse(fieldIds(seat).contains(playerId(9)), "a ghost is invisible to the living");
        }
        // The ghost sees the whole town and can still walk.
        assertEquals(10, field(9).path("players").size());
        assertTrue(field(9).path("players").get(9).path("ghost").asBoolean());
        // Recovery during the Roam keeps the death secret too.
        handler.afterConnectionClosed(table.get(6), CloseStatus.NORMAL);
        var returning = connect("kill-return");
        recover(returning, code, tokens.get(6));
        assertEquals("living", latestOfType(returning, "game_state").path("players").get(9).path("status").asText());
        // Reporting needs a Body within reach.
        ability(5, "report", 1, null);
        assertEquals("invalid_target", latest(table.get(5)).path("code").asText());
        walk(8, bodyX - 40, bodyY + 20);
        ability(8, "report", 1, null);
        for (int seat = 0; seat < 9; seat++) {
            if (seat == 6) continue;
            JsonNode state = game(seat);
            assertEquals("meeting_call", state.path("phase").asText());
            assertEquals("report", state.path("outcome").path("kind").asText());
            assertEquals(playerId(8), state.path("outcome").path("callerPlayerId").asText());
            assertEquals(playerId(9), state.path("outcome").path("bodyPlayerId").asText());
            assertEquals(List.of(playerId(9)), names(state.path("outcome").path("deaths")));
            assertEquals("eliminated", state.path("players").get(9).path("status").asText());
        }
        assertEquals(MEETING_CALL, game(5).path("remainingMs").asLong());
    }

    @Test
    void killsRespectRoleReachTeamRoundAndCooldown() throws Exception {
        startTable("rules", 10);
        advance(REVEAL);
        walk(0, RoomRules.seatX(9) + 40, RoomRules.seatY(9));
        ability(0, "kill", 1, 9);
        assertEquals("cooling_down", latest(table.get(0)).path("code").asText());
        advance(FieldRules.OPENING_COOLDOWN);
        ability(5, "kill", 1, 9);
        assertEquals("invalid_action", latest(table.get(5)).path("code").asText());
        ability(0, "kill", 1, 5);
        assertEquals("invalid_target", latest(table.get(0)).path("code").asText());
        ability(0, "kill", 1, 1);
        assertEquals("invalid_target", latest(table.get(0)).path("code").asText());
        ability(0, "kill", 2, 9);
        assertEquals("invalid_phase", latest(table.get(0)).path("code").asText());
        send(table.get(0), "{\"version\":1,\"type\":\"use_ability\",\"ability\":\"kill\",\"round\":1,\"targetPlayerId\":null}");
        assertEquals("malformed_message", latest(table.get(0)).path("code").asText());
        ability(0, "kill", 1, 9);
        assertEquals("eliminated", game(9).path("self").path("status").asText());
        walk(0, RoomRules.seatX(8) + 40, RoomRules.seatY(8));
        ability(0, "kill", 1, 8);
        assertEquals("cooling_down", latest(table.get(0)).path("code").asText());
        assertEquals("living", game(8).path("self").path("status").asText());
    }

    @Test
    void theRoamTimesOutIntoAMeetingAndTheCycleReturnsEveryoneToTheirSeat() throws Exception {
        startTable("cycle", 10);
        advance(REVEAL);
        walk(5, 1_280, 1_000);
        advance(ROAM);
        assertEquals("meeting_call", game(5).path("phase").asText());
        assertEquals("timeout", game(5).path("outcome").path("kind").asText());
        assertEquals(0, game(5).path("outcome").path("deaths").size());
        int ticks = countOfType(table.get(5), "field_state");
        handler.tickFields();
        assertEquals(ticks, countOfType(table.get(5), "field_state"), "fields stream only during a Roam");
        advance(MEETING_CALL);
        assertEquals("discussion", game(5).path("phase").asText());
        advance(DISCUSSION);
        assertEquals("voting", game(5).path("phase").asText());
        advance(VOTING);
        assertEquals("voting_result", game(5).path("phase").asText());
        assertTrue(game(5).path("outcome").path("eliminatedPlayerId").isNull());
        advance(VOTING_RESULT);
        assertEquals("roam", game(5).path("phase").asText());
        assertEquals(2, game(5).path("round").asInt());
        handler.tickFields();
        assertEquals(RoomRules.seatY(5), field(5).path("self").path("y").asDouble());
    }

    @Test
    void anEmergencyMeetingNeedsTheButtonAndIsOncePerGame() throws Exception {
        startTable("button", 10);
        advance(REVEAL);
        ability(5, "emergency", 1, null);
        assertEquals("Stand by the button in the Town Hall.", latest(table.get(5)).path("message").asText());
        walk(5, RoomRules.BUTTON_X, RoomRules.BUTTON_Y + 50);
        ability(5, "emergency", 1, null);
        assertEquals("meeting_call", game(0).path("phase").asText());
        assertEquals("emergency", game(0).path("outcome").path("kind").asText());
        assertEquals(playerId(5), game(0).path("outcome").path("callerPlayerId").asText());
        advance(MEETING_CALL + DISCUSSION + VOTING + VOTING_RESULT);
        assertEquals(2, game(5).path("round").asInt());
        handler.tickFields();
        assertFalse(field(5).path("self").path("emergencyAvailable").asBoolean());
        walk(5, RoomRules.BUTTON_X, RoomRules.BUTTON_Y + 50);
        ability(5, "emergency", 2, null);
        assertEquals("invalid_action", latest(table.get(5)).path("code").asText());
        assertEquals("roam", game(5).path("phase").asText());
    }

    // ----- Vanish, Shield, Scan and Crowding ---------------------------------------------

    @Test
    void aVanishedMafiaDisappearsFromTheVillageButNotFromTheirTeam() throws Exception {
        startTable("vanish", 10);
        advance(REVEAL + FieldRules.OPENING_COOLDOWN);
        walk(4, RoomRules.seatX(0) + 60, RoomRules.seatY(0) + 40);
        handler.tickFields();
        assertTrue(fieldIds(9).contains(playerId(0)));
        ability(0, "vanish", 1, null);
        assertTrue(field(0).path("self").path("vanishedMs").asLong() > 0);
        handler.tickFields();
        assertFalse(fieldIds(9).contains(playerId(0)));
        assertFalse(fieldIds(4).contains(playerId(0)));
        JsonNode seenByTeam = fieldPlayer(1, playerId(0));
        assertTrue(seenByTeam.path("vanished").asBoolean());
        // Aiming at a Vanished Player reads exactly like aiming at nobody.
        ability(4, "scan", 1, 0);
        assertEquals("No such Player within reach.", latest(table.get(4)).path("message").asText());
        ability(0, "vanish", 1, null);
        assertEquals("cooling_down", latest(table.get(0)).path("code").asText());
        advance(FieldRules.VANISH_DURATION);
        handler.tickFields();
        assertTrue(fieldIds(9).contains(playerId(0)));
        assertTrue(field(5).path("self").path("vanishedMs").isNull(), "only the Mafia have a Vanish timer");
    }

    @Test
    void aShieldMakesTheNextKillFailAndIsSpent() throws Exception {
        startTable("shield", 10);
        advance(REVEAL + FieldRules.OPENING_COOLDOWN);
        walk(4, 1_620, 740);
        ability(3, "shield", 1, 3);
        assertEquals("invalid_target", latest(table.get(3)).path("code").asText());
        ability(3, "shield", 1, 4);
        assertEquals(playerId(4), field(3).path("self").path("shieldTargetPlayerId").asText());
        int sheriffStates = countOfType(table.get(4), "game_state");
        ability(2, "kill", 1, 4);
        assertEquals("target_shielded", latest(table.get(2)).path("code").asText());
        assertEquals("living", game(4).path("self").path("status").asText());
        assertEquals(sheriffStates, countOfType(table.get(4), "game_state"), "the target is not told");
        handler.tickFields();
        assertTrue(field(3).path("self").path("shieldTargetPlayerId").isNull());
        ability(3, "shield", 1, 4);
        assertEquals("cooling_down", latest(table.get(3)).path("code").asText());
        advance(FieldRules.KILL_COOLDOWN);
        ability(2, "kill", 1, 4);
        assertEquals("eliminated", game(4).path("self").path("status").asText());
    }

    @Test
    void aScanTellsOnlyTheSheriffWhetherTheTargetIsMafia() throws Exception {
        startTable("scan", 10);
        advance(REVEAL + FieldRules.OPENING_COOLDOWN);
        ability(4, "scan", 1, 2);
        assertEquals("invalid_target", latest(table.get(4)).path("code").asText());
        walk(4, 1_620, 740);
        List<Integer> before = new ArrayList<>();
        for (var member : table) before.add(countOfType(member, "game_state"));
        ability(4, "scan", 1, 2);
        JsonNode results = game(4).path("self").path("investigations");
        assertEquals(1, results.size());
        assertEquals(playerId(2), results.get(0).path("targetPlayerId").asText());
        assertTrue(results.get(0).path("mafia").asBoolean());
        for (int seat = 0; seat < 10; seat++) {
            if (seat != 4) assertEquals(before.get(seat), countOfType(table.get(seat), "game_state"));
        }
        ability(4, "scan", 1, 3);
        assertEquals("cooling_down", latest(table.get(4)).path("code").asText());
        advance(FieldRules.SCAN_COOLDOWN);
        ability(4, "scan", 1, 3);
        assertFalse(game(4).path("self").path("investigations").get(1).path("mafia").asBoolean());
        assertTrue(game(5).path("self").path("investigations").isNull());
    }

    @Test
    void aVillagerWhoLingersBesideAnotherPlayerIsPushedAway() throws Exception {
        startTable("crowd", 10);
        advance(REVEAL);
        walk(6, RoomRules.seatX(5) - 50, RoomRules.seatY(5));
        handler.tickFields();
        int correction = field(5).path("self").path("correction").asInt();
        for (int tick = 0; tick < 30; tick++) {
            milliseconds.addAndGet(100);
            handler.tickFields();
        }
        assertTrue(field(5).path("self").path("crowding").asDouble() >= 0.45);
        assertTrue(field(0).path("self").path("crowding").isNull(), "only Villagers crowd");
        for (int tick = 0; tick < 40; tick++) {
            milliseconds.addAndGet(100);
            handler.tickFields();
        }
        JsonNode five = field(5).path("self");
        JsonNode six = field(6).path("self");
        assertEquals(correction + 1, five.path("correction").asInt());
        assertTrue(Math.hypot(five.path("x").asDouble() - six.path("x").asDouble(),
                five.path("y").asDouble() - six.path("y").asDouble()) > FieldRules.CROWD_RADIUS);
        assertTrue(RoomRules.walkable(five.path("x").asDouble(), five.path("y").asDouble()));
    }

    // ----- chat, departures and victory ---------------------------------------------------

    @Test
    void mafiaWhisperDuringTheRoamAndEveryoneTalksInTheMeeting() throws Exception {
        startTable("chat", 10);
        advance(REVEAL);
        chat(0, "mafia", "Take the Doctor.");
        for (int seat = 0; seat < 10; seat++) {
            boolean mafia = seat < 3;
            assertEquals(mafia, table.get(seat).payloads().stream().anyMatch(p -> p.contains("Take the Doctor.")), "seat " + seat);
        }
        chat(5, "public", "Hello?");
        assertEquals("invalid_phase", latest(table.get(5)).path("code").asText());
        chat(5, "mafia", "Let me in");
        assertEquals("invalid_action", latest(table.get(5)).path("code").asText());
        advance(ROAM + MEETING_CALL);
        chat(5, "public", "It was Player 0.");
        for (var member : table) assertTrue(member.payloads().stream().anyMatch(p -> p.contains("It was Player 0.")));
    }

    @Test
    void leavingDuringTheRoamForfeitsAndRemovesTheAvatarFromTheField() throws Exception {
        startTable("leave", 10);
        advance(REVEAL);
        send(table.get(7), "{\"version\":1,\"type\":\"leave_room\"}");
        assertEquals("left", game(5).path("players").get(7).path("status").asText());
        handler.tickFields();
        assertFalse(fieldIds(6).contains(playerId(7)));
    }

    @Test
    void theMafiaWinTheMomentAKillReachesParity() throws Exception {
        startTable("parity", 4);
        advance(REVEAL + FieldRules.OPENING_COOLDOWN);
        walk(0, RoomRules.seatX(3) - 40, RoomRules.seatY(3));
        ability(0, "kill", 1, 3);
        assertEquals("roam", game(0).path("phase").asText());
        advance(FieldRules.KILL_COOLDOWN);
        walk(0, RoomRules.seatX(2) - 40, RoomRules.seatY(2));
        ability(0, "kill", 1, 2);
        for (int seat = 0; seat < 4; seat++) {
            JsonNode state = game(seat);
            assertEquals("finished", state.path("phase").asText());
            assertEquals("mafia", state.path("winner").asText());
            assertEquals(4, state.path("roles").size());
            assertTrue(state.path("remainingMs").isNull());
        }
    }

    @Test
    void theVillageWinsByVotingOutTheMafia() throws Exception {
        startTable("vote", 4);
        advance(REVEAL + ROAM + MEETING_CALL + DISCUSSION);
        assertEquals("voting", game(1).path("phase").asText());
        for (int seat = 1; seat < 4; seat++) ballot(seat, 1, 0);
        ballot(0, 1, null);
        ballot(1, 1, 2);
        assertEquals("already_submitted", latest(table.get(1)).path("code").asText());
        advance(VOTING);
        assertEquals("voting_result", game(1).path("phase").asText());
        assertEquals(playerId(0), game(1).path("outcome").path("eliminatedPlayerId").asText());
        assertTrue(game(1).path("outcome").path("eliminatedMafia").asBoolean());
        assertEquals(4, game(1).path("ballots").size());
        advance(VOTING_RESULT);
        assertEquals("finished", game(1).path("phase").asText());
        assertEquals("village", game(1).path("winner").asText());
        assertEquals(List.of("mafia", "doctor", "sheriff", "villager"), revealedRoles(game(1)));
    }

    // ----- helpers ------------------------------------------------------------------------

    private void startTable(String label, int players) throws Exception {
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
