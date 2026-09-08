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

        now.addAndGet(1_000_000_000L);
        send(session, """
                {"version":1,"type":"move_player","x":700,"y":360}
                """);
        send(session, """
                {"version":1,"type":"move_player","x":1200,"y":360}
                """);

        JsonNode accepted = json(session.payloads().get(1));
        assertEquals("player_moved", accepted.get("type").asText());
        assertEquals(700, accepted.get("x").asDouble());
        JsonNode rejected = json(session.payloads().get(2));
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
    void roomHasEightDistinctColoursAndDisconnectFreesASlot() throws Exception {
        RecordingWebSocketSession first = connect("first");
        send(first, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Alex\"}");
        String code = json(first.payloads().get(0)).get("roomId").asText();
        RecordingWebSocketSession last = null;
        for (int i = 1; i < 8; i++) {
            last = connect("member-" + i);
            join(last, code);
        }
        java.util.Set<String> colours = new java.util.HashSet<>();
        json(last.payloads().get(0)).get("players").forEach(p -> colours.add(p.get("colour").asText()));
        assertEquals(8, colours.size());
        RecordingWebSocketSession ninth = connect("ninth");
        join(ninth, code);
        assertEquals("room_full", json(ninth.payloads().get(0)).get("code").asText());
        handler.afterConnectionClosed(first, org.springframework.web.socket.CloseStatus.NORMAL);
        join(ninth, code);
        assertEquals(8, json(ninth.payloads().get(1)).get("players").size());
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
