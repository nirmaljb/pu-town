package dev.lpa.pu_go.websocket.handler;

import dev.lpa.pu_go.room.RoomManager;
import dev.lpa.pu_go.websocket.support.RecordingWebSocketSession;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.Iterator;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class GameWebSocketHandlerTest {
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AtomicLong now = new AtomicLong(1_000_000_000L);
    private final java.util.concurrent.atomic.AtomicInteger playerIds = new java.util.concurrent.atomic.AtomicInteger();
    private final AtomicLong milliseconds = new AtomicLong();
    private final GameWebSocketHandler handler = new GameWebSocketHandler(
            new RoomManager(milliseconds::get), Runnable::run, () -> "player-" + playerIds.incrementAndGet(), now::get
    );

    @Test
    void onlyCreateMakesRoomsAndJoinNormalizesCodes() throws Exception {
        RecordingWebSocketSession alex = connect("session-1");
        send(alex, "{\"version\":1,\"type\":\"join_room\",\"roomId\":\"ABC234\",\"displayName\":\"Alex\"}");
        assertEquals("room_not_found", json(alex.payloads().get(0)).get("code").asText());
        send(alex, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"  Alex  \"}");
        JsonNode snapshot = json(alex.payloads().get(1));
        String code = snapshot.get("roomId").asText();
        org.junit.jupiter.api.Assertions.assertTrue(code.matches("[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}"));
        assertEquals("Alex", snapshot.get("players").get(0).get("displayName").asText());
        RecordingWebSocketSession sam = connect("session-2");
        send(sam, "{\"version\":1,\"type\":\"join_room\",\"roomId\":\" " + code.toLowerCase() + " \",\"displayName\":\"Alex\"}");
        assertEquals(2, json(sam.payloads().get(0)).get("players").size());
    }

    @Test
    void joiningReturnsSnapshotAndAnnouncesThePlayerToExistingRoomMembers() throws Exception {
        RecordingWebSocketSession alex = connect("session-1");
        send(alex, """
                {"version":1,"type":"create_room","displayName":"Alex"}
                """);

        JsonNode alexSnapshot = json(alex.payloads().get(0));
        assertEquals("room_snapshot", alexSnapshot.get("type").asText());
        assertEquals(1, alexSnapshot.get("version").asInt());
        assertEquals("player-1", alexSnapshot.get("selfPlayerId").asText());
        org.junit.jupiter.api.Assertions.assertTrue(alexSnapshot.get("roomId").asText().length() == 6);
        assertEquals("Alex", alexSnapshot.get("players").get(0).get("displayName").asText());

        RecordingWebSocketSession sam = connect("session-2");
        send(sam, """
                {"version":1,"type":"join_room","roomId":"%s","displayName":"Sam"}
                """.formatted(json(alex.payloads().get(0)).get("roomId").asText()));

        JsonNode joined = json(alex.payloads().get(1));
        assertEquals("player_joined", joined.get("type").asText());
        assertEquals("player-2", joined.get("player").get("playerId").asText());
        assertEquals(2, json(sam.payloads().get(0)).get("players").size());
    }

    @Test
    void avatarAssignmentIsSharedAndStableForTheRoomMembership() throws Exception {
        var alex = connect("alex");
        send(alex, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Alex\"}");
        JsonNode initial = json(alex.payloads().get(0));
        String code = initial.get("roomId").asText();
        String alexPreset = initial.get("players").get(0).get("avatarPreset").asText();
        org.junit.jupiter.api.Assertions.assertTrue(alexPreset.matches("townsperson-[1-6]"));

        var sam = connect("sam");
        join(sam, code);
        JsonNode announcement = json(alex.payloads().get(1)).get("player");
        JsonNode samSnapshot = json(sam.payloads().get(0));
        for (JsonNode player : samSnapshot.get("players")) {
            String expected = player.get("playerId").asText().equals("player-1")
                    ? alexPreset : announcement.get("avatarPreset").asText();
            assertEquals(expected, player.get("avatarPreset").asText());
            org.junit.jupiter.api.Assertions.assertTrue(expected.matches("townsperson-[1-6]"));
        }

        send(alex, "{\"version\":1,\"type\":\"start_game\"}");
        // Repeated Join is idempotent; failed room switches keep the current appearance.
        join(alex, code);
        join(alex, "AAAAAA".equals(code) ? "BBBBBB" : "AAAAAA");
        now.addAndGet(1_000_000_000L);
        send(alex, "{\"version\":1,\"type\":\"move_player\",\"x\":650,\"y\":360}");
        join(alex, code);
        JsonNode finalSnapshot = json(alex.payloads().get(alex.payloads().size() - 1));
        for (JsonNode player : finalSnapshot.get("players")) {
            if (player.get("playerId").asText().equals("player-1")) {
                assertEquals(alexPreset, player.get("avatarPreset").asText());
                assertEquals(650, player.get("x").asDouble());
            }
        }
    }

    @Test
    void malformedOrIncompatibleMessagesAreRejectedAtTheProtocolBoundary() throws Exception {
        RecordingWebSocketSession session = connect("session-1");

        send(session, "{not json");
        send(session, """
                {"version":2,"type":"leave_room"}
                """);
        send(session, """
                {"version":1,"type":"leave_room","roomId":"smuggled-field"}
                """);

        assertEquals(List.of("malformed_message", "unsupported_version", "malformed_message"),
                session.payloads().stream().map(this::jsonUnchecked)
                        .map(node -> node.get("code").asText()).toList());
    }

    @Test
    void onlyFiniteInBoundsPlausibleMovementBecomesAuthoritative() throws Exception {
        RecordingWebSocketSession session = connect("session-1");
        send(session, """
                {"version":1,"type":"create_room","displayName":"Alex"}
                """);

        send(session, "{\"version\":1,\"type\":\"start_game\"}");
        now.addAndGet(1_000_000_000L);
        send(session, """
                {"version":1,"type":"move_player","x":700,"y":360}
                """);
        send(session, """
                {"version":1,"type":"move_player","x":1200,"y":360}
                """);

        JsonNode accepted = json(session.payloads().get(2));
        assertEquals("player_moved", accepted.get("type").asText());
        assertEquals(700, accepted.get("x").asDouble());
        JsonNode rejected = json(session.payloads().get(3));
        assertEquals("error", rejected.get("type").asText());
        assertEquals("invalid_movement", rejected.get("code").asText());
    }

    @Test
    void leavingIsAcknowledgedAndDoesNotMasqueradeAsDisconnecting() throws Exception {
        RecordingWebSocketSession alex = connect("session-1");
        send(alex, """
                {"version":1,"type":"create_room","displayName":"Alex"}
                """);
        RecordingWebSocketSession sam = connect("session-2");
        send(sam, """
                {"version":1,"type":"join_room","roomId":"%s","displayName":"Sam"}
                """.formatted(json(alex.payloads().get(0)).get("roomId").asText()));

        send(sam, """
                {"version":1,"type":"leave_room"}
                """);

        JsonNode left = json(alex.payloads().get(2));
        assertEquals("player_left", left.get("type").asText());
        assertEquals("left", left.get("reason").asText());
        assertEquals("room_left", json(sam.payloads().get(1)).get("type").asText());

        handler.afterConnectionClosed(sam, org.springframework.web.socket.CloseStatus.NORMAL);
        assertEquals(3, alex.payloads().size());
    }

    @Test
    void disconnectEndsMembershipAndNotifiesRemainingPlayers() throws Exception {
        RecordingWebSocketSession alex = connect("session-1");
        send(alex, """
                {"version":1,"type":"create_room","displayName":"Alex"}
                """);
        RecordingWebSocketSession sam = connect("session-2");
        send(sam, """
                {"version":1,"type":"join_room","roomId":"%s","displayName":"Sam"}
                """.formatted(json(alex.payloads().get(0)).get("roomId").asText()));

        handler.afterConnectionClosed(sam, org.springframework.web.socket.CloseStatus.NORMAL);

        JsonNode left = json(alex.payloads().get(2));
        assertEquals("player_left", left.get("type").asText());
        assertEquals("disconnected", left.get("reason").asText());
    }

    @Test
    void roomHasTenDistinctColoursAndDisconnectFreesASeat() throws Exception {
        RecordingWebSocketSession first = connect("first");
        send(first, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Alex\"}");
        String code = json(first.payloads().get(0)).get("roomId").asText();
        RecordingWebSocketSession last = null;
        for (int i = 1; i < 10; i++) {
            last = connect("member-" + i);
            join(last, code);
        }
        java.util.Set<String> colours = new java.util.HashSet<>();
        json(last.payloads().get(0)).get("players").forEach(p -> colours.add(p.get("colour").asText()));
        assertEquals(10, colours.size());
        var occupants = json(last.payloads().get(0)).get("players");
        for (int i = 0; i < 10; i++) assertEquals(i, occupants.get(i).path("seat").asInt(-1));
        RecordingWebSocketSession eleventh = connect("eleventh");
        join(eleventh, code);
        assertEquals("room_full", json(eleventh.payloads().get(0)).get("code").asText());
        handler.afterConnectionClosed(first, org.springframework.web.socket.CloseStatus.NORMAL);
        join(eleventh, code);
        var recovered = json(eleventh.payloads().get(1)).get("players");
        assertEquals(10, recovered.size());
        assertEquals(1, recovered.get(0).path("seat").asInt(-1));
        assertEquals(0, recovered.get(9).path("seat").asInt(-1));
    }

    @Test
    void emptyRoomExpiresFiveMinutesAfterLastDeparture() throws Exception {
        RecordingWebSocketSession first = connect("first");
        send(first, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Alex\"}");
        String code = json(first.payloads().get(0)).get("roomId").asText();
        send(first, "{\"version\":1,\"type\":\"leave_room\"}");
        milliseconds.set(299_999);
        join(first, code);
        assertEquals("room_snapshot", json(first.payloads().get(2)).get("type").asText());
        send(first, "{\"version\":1,\"type\":\"leave_room\"}");
        milliseconds.addAndGet(299_999);
        join(first, code);
        assertEquals("room_snapshot", json(first.payloads().get(4)).get("type").asText());
        send(first, "{\"version\":1,\"type\":\"leave_room\"}");
        milliseconds.addAndGet(300_000);
        join(first, code);
        assertEquals("room_not_found", json(first.payloads().get(6)).get("code").asText());
    }

    @Test
    void heartbeatRespondsAndNamesAreValidatedBeforeCreation() throws Exception {
        var session = connect("first");
        send(session, "{\"version\":1,\"type\":\"ping\"}");
        assertEquals("pong", json(session.payloads().get(0)).get("type").asText());
        for (String name : List.of("   ", "a".repeat(25))) {
            send(session, objectMapper.writeValueAsString(java.util.Map.of(
                    "version", 1, "type", "create_room", "displayName", name)));
            assertEquals("malformed_message", json(session.payloads().get(session.payloads().size() - 1)).get("code").asText());
        }
        send(session, objectMapper.writeValueAsString(java.util.Map.of(
                "version", 1, "type", "create_room", "displayName", "a".repeat(24))));
        assertEquals("room_snapshot", json(session.payloads().get(3)).get("type").asText());
    }

    @Test
    void creatorWaitsInLobbyAndCanStartAlone() throws Exception {
        var host = connect("host");
        send(host, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Host\"}");
        assertEquals("lobby", latest(host).path("phase").asText());
        assertEquals("player-1", latest(host).path("hostPlayerId").asText());
        send(host, "{\"version\":1,\"type\":\"move_player\",\"x\":650,\"y\":360}");
        assertEquals("invalid_movement", latest(host).path("code").asText());
        send(host, "{\"version\":1,\"type\":\"start_game\"}");
        assertEquals("room_state", latest(host).path("type").asText());
        assertEquals("playing", latest(host).path("phase").asText());
        assertEquals(640, latest(host).path("players").get(0).path("x").asDouble());
        send(host, "{\"version\":1,\"type\":\"start_game\"}");
        assertEquals("invalid_phase", latest(host).path("code").asText());
    }

    @Test
    void readinessIsSharedAndDoesNotGateHostStart() throws Exception {
        var host = connect("host");
        send(host, """
                {"version":1,"type":"create_room","displayName":"Alex"}
                """);
        String code = latest(host).path("roomId").asText();
        assertFalse(latest(host).path("players").get(0).path("ready").asBoolean(true));
        var guest = connect("guest");
        join(guest, code);
        send(guest, """
                {"version":1,"type":"start_game"}
                """);
        assertEquals("not_host", latest(guest).path("code").asText());
        for (boolean ready : List.of(true, false)) {
            send(guest, """
                    {"version":1,"type":"set_ready","ready":%s}
                    """.formatted(ready));
            assertEquals("room_state", latest(host).path("type").asText());
            assertEquals(ready, latest(host).path("players").get(1).path("ready").asBoolean());
            assertEquals(latest(host), latest(guest));
        }
        send(host, """
                {"version":1,"type":"start_game"}
                """);
        assertEquals("playing", latest(host).path("phase").asText());
        assertEquals(latest(host), latest(guest));
        send(guest, """
                {"version":1,"type":"set_ready","ready":true}
                """);
        assertEquals("invalid_phase", latest(guest).path("code").asText());
        var late = connect("late");
        join(late, code);
        assertEquals("playing", latest(late).path("phase").asText());
        org.junit.jupiter.api.Assertions.assertTrue(latest(late).path("players").get(2).path("seat").isNull());
    }

    @Test
    void hostDeparturePromotesLongestMembershipAndReturnDoesNotReclaimAuthority() throws Exception {
        for (boolean disconnect : List.of(false, true)) {
            var host = connect("host-" + disconnect);
            send(host, """
                    {"version":1,"type":"create_room","displayName":"Alex"}
                    """);
            String code = latest(host).path("roomId").asText();
            var next = connect("next-" + disconnect);
            join(next, code);
            String nextId = latest(next).path("selfPlayerId").asText();
            var third = connect("third-" + disconnect);
            join(third, code);
            send(next, """
                    {"version":1,"type":"set_ready","ready":true}
                    """);
            if (disconnect) handler.afterConnectionClosed(host, org.springframework.web.socket.CloseStatus.NORMAL);
            else send(host, """
                    {"version":1,"type":"leave_room"}
                    """);
            assertEquals(nextId, latest(next).path("hostPlayerId").asText());
            assertEquals(latest(next), latest(third));
            var returning = connect("returning-" + disconnect);
            join(returning, code);
            var snapshot = latest(returning);
            assertEquals(nextId, snapshot.path("hostPlayerId").asText());
            assertEquals(1, snapshot.path("players").get(0).path("seat").asInt());
            org.junit.jupiter.api.Assertions.assertTrue(snapshot.path("players").get(0).path("ready").asBoolean());
            assertEquals(0, snapshot.path("players").get(2).path("seat").asInt());
            assertFalse(snapshot.path("players").get(2).path("ready").asBoolean(true));
            send(returning, """
                    {"version":1,"type":"start_game"}
                    """);
            assertEquals("not_host", latest(returning).path("code").asText());
            send(next, """
                    {"version":1,"type":"start_game"}
                    """);
            assertEquals("playing", latest(third).path("phase").asText());
        }
    }

    @Test
    void emptyStartedRoomResetsAndExpiresFromItsFinalDeparture() throws Exception {
        var host = connect("host");
        send(host, """
                {"version":1,"type":"create_room","displayName":"Alex"}
                """);
        String code = latest(host).path("roomId").asText();
        send(host, """
                {"version":1,"type":"set_ready","ready":true}
                """);
        send(host, """
                {"version":1,"type":"start_game"}
                """);
        handler.afterConnectionClosed(host, org.springframework.web.socket.CloseStatus.NORMAL);
        milliseconds.set(299_999);
        var returning = connect("returning");
        join(returning, code);
        var fresh = latest(returning);
        assertEquals("lobby", fresh.path("phase").asText());
        assertEquals(fresh.path("selfPlayerId"), fresh.path("hostPlayerId"));
        assertEquals(0, fresh.path("players").get(0).path("seat").asInt(-1));
        assertFalse(fresh.path("players").get(0).path("ready").asBoolean(true));
        send(returning, """
                {"version":1,"type":"leave_room"}
                """);
        milliseconds.addAndGet(300_000);
        join(returning, code);
        assertEquals("room_not_found", latest(returning).path("code").asText());
    }

    @Test
    void queuedMovementCannotOvertakeHostSuccessionState() throws Exception {
        var tasks = new java.util.ArrayDeque<Runnable>();
        var serial = new GameWebSocketHandler(new RoomManager(milliseconds::get), tasks::add,
                () -> "queued-" + playerIds.incrementAndGet(), now::get);
        var host = new RecordingWebSocketSession("queued-host");
        var guest = new RecordingWebSocketSession("queued-guest");
        serial.afterConnectionEstablished(host);
        serial.afterConnectionEstablished(guest);
        serial.handleMessage(host, new TextMessage("""
                {"version":1,"type":"create_room","displayName":"Alex"}
                """));
        while (!tasks.isEmpty()) tasks.remove().run();
        String code = latest(host).path("roomId").asText();
        serial.handleMessage(guest, new TextMessage("""
                {"version":1,"type":"join_room","roomId":"%s","displayName":"Sam"}
                """.formatted(code)));
        serial.handleMessage(host, new TextMessage("""
                {"version":1,"type":"start_game"}
                """));
        while (!tasks.isEmpty()) tasks.remove().run();
        serial.handleMessage(guest, new TextMessage("""
                {"version":1,"type":"move_player","x":650,"y":360}
                """));
        serial.handleMessage(host, new TextMessage("""
                {"version":1,"type":"leave_room"}
                """));
        serial.handleMessage(guest, new TextMessage("""
                {"version":1,"type":"move_player","x":660,"y":360}
                """));
        while (!tasks.isEmpty()) tasks.remove().run();
        assertEquals("player_moved", latest(guest).path("type").asText());
        assertEquals(660, latest(guest).path("x").asDouble());
    }

    @Test
    void startAndDepartureHaveConsistentResultsInEitherOrder() throws Exception {
        for (boolean startFirst : List.of(true, false)) {
            var host = connect("ordered-host-" + startFirst);
            send(host, """
                    {"version":1,"type":"create_room","displayName":"Alex"}
                    """);
            String code = latest(host).path("roomId").asText();
            var guest = connect("ordered-guest-" + startFirst);
            join(guest, code);
            String guestId = latest(guest).path("selfPlayerId").asText();
            if (startFirst) send(host, """
                    {"version":1,"type":"start_game"}
                    """);
            send(host, """
                    {"version":1,"type":"leave_room"}
                    """);
            assertEquals(guestId, latest(guest).path("hostPlayerId").asText());
            assertEquals(startFirst ? "playing" : "lobby", latest(guest).path("phase").asText());
            send(host, """
                    {"version":1,"type":"start_game"}
                    """);
            assertEquals("not_in_room", latest(host).path("code").asText());
            send(guest, """
                    {"version":1,"type":"start_game"}
                    """);
            assertEquals(startFirst ? "invalid_phase" : "room_state",
                    latest(guest).path(startFirst ? "code" : "type").asText());
        }
    }

    @Test
    void lobbyControlsRejectForeignFieldsAndMalformedReadiness() throws Exception {
        var player = connect("unjoined");
        for (String message : List.of(
                "{\"version\":1,\"type\":\"set_ready\",\"ready\":true,\"playerId\":\"other\"}",
                "{\"version\":1,\"type\":\"set_ready\",\"ready\":1}",
                "{\"version\":1,\"type\":\"set_ready\"}",
                "{\"version\":1,\"type\":\"start_game\",\"roomId\":\"ABC234\"}")) {
            send(player, message);
            assertEquals("malformed_message", latest(player).path("code").asText());
        }
        send(player, """
                {"version":1,"type":"set_ready","ready":true}
                """);
        assertEquals("not_in_room", latest(player).path("code").asText());
    }

    private JsonNode latest(RecordingWebSocketSession session) throws Exception {
        return json(session.payloads().get(session.payloads().size() - 1));
    }

    private void join(RecordingWebSocketSession session, String code) throws Exception {
        send(session, "{\"version\":1,\"type\":\"join_room\",\"roomId\":\"" + code + "\",\"displayName\":\"Alex\"}");
    }

    private RecordingWebSocketSession connect(String sessionId) throws Exception {
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
        try {
            return json(payload);
        } catch (Exception exception) {
            throw new AssertionError(exception);
        }
    }
}
