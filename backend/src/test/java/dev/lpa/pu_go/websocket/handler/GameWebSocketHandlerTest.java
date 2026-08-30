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
    private final Iterator<String> playerIds = java.util.List.of("player-1", "player-2").iterator();
    private final GameWebSocketHandler handler = new GameWebSocketHandler(
            new RoomManager(), Runnable::run, playerIds::next, now::get
    );

    @Test
    void joiningReturnsSnapshotAndAnnouncesThePlayerToExistingRoomMembers() throws Exception {
        RecordingWebSocketSession alex = connect("session-1");
        send(alex, """
                {"version":1,"type":"join_room","roomId":"plaza","displayName":"Alex"}
                """);

        JsonNode alexSnapshot = json(alex.payloads().get(0));
        assertEquals("room_snapshot", alexSnapshot.get("type").asText());
        assertEquals(1, alexSnapshot.get("version").asInt());
        assertEquals("player-1", alexSnapshot.get("selfPlayerId").asText());
        assertEquals("plaza", alexSnapshot.get("roomId").asText());
        assertEquals("Alex", alexSnapshot.get("players").get(0).get("displayName").asText());

        RecordingWebSocketSession sam = connect("session-2");
        send(sam, """
                {"version":1,"type":"join_room","roomId":"plaza","displayName":"Sam"}
                """);

        JsonNode joined = json(alex.payloads().get(1));
        assertEquals("player_joined", joined.get("type").asText());
        assertEquals("player-2", joined.get("player").get("playerId").asText());
        assertEquals(2, json(sam.payloads().get(0)).get("players").size());
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
                {"version":1,"type":"join_room","roomId":"plaza","displayName":"Alex"}
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
                {"version":1,"type":"join_room","roomId":"plaza","displayName":"Alex"}
                """);
        RecordingWebSocketSession sam = connect("session-2");
        send(sam, """
                {"version":1,"type":"join_room","roomId":"plaza","displayName":"Sam"}
                """);

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
                {"version":1,"type":"join_room","roomId":"plaza","displayName":"Alex"}
                """);
        RecordingWebSocketSession sam = connect("session-2");
        send(sam, """
                {"version":1,"type":"join_room","roomId":"plaza","displayName":"Sam"}
                """);

        handler.afterConnectionClosed(sam, org.springframework.web.socket.CloseStatus.NORMAL);

        JsonNode left = json(alex.payloads().get(2));
        assertEquals("player_left", left.get("type").asText());
        assertEquals("disconnected", left.get("reason").asText());
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
