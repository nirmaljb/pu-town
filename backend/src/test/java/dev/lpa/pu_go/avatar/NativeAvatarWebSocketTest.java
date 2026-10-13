package dev.lpa.pu_go.avatar;

import dev.lpa.pu_go.room.RoomManager;
import dev.lpa.pu_go.voice.VoiceService;
import dev.lpa.pu_go.websocket.handler.GameWebSocketHandler;
import dev.lpa.pu_go.websocket.support.RecordingWebSocketSession;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.TextMessage;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NativeAvatarWebSocketTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void nativeSelectionPinsCosmeticsAndPreservesMembershipThroughRecoveryAndStart(@TempDir Path directory) throws Exception {
        Path file = NativeAvatarPublicationTest.publish(directory.resolve("published.json"),
                NativeAvatarPublicationTest.preset("campus-rowan", "Rowan"), NativeAvatarPublicationTest.preset("campus-mira", "Mira"));
        try (var context = new AnnotationConfigApplicationContext()) {
            RoomManager rooms = new RoomManager(() -> 0L, new PublishedAvatars(file));
            context.registerBean(RoomManager.class, () -> rooms);
            context.registerBean(VoiceService.class, () -> new VoiceService("http://127.0.0.1:7880", "", ""));
            context.register(GameWebSocketHandler.class);
            context.refresh();
            GameWebSocketHandler handler = context.getBean(GameWebSocketHandler.class);
            var host = connect(handler, "native-host");
            JsonNode initial = send(handler, host, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Host\"}", "room_snapshot");
            String code = initial.path("roomId").asText();
            var guest = connect(handler, "native-guest");
            send(handler, guest, "{\"version\":1,\"type\":\"join_room\",\"roomId\":\"" + code + "\",\"displayName\":\"Guest\"}", "room_snapshot");
            JsonNode ready = send(handler, host, "{\"version\":1,\"type\":\"set_ready\",\"ready\":true}", "room_state");
            JsonNode chosen = send(handler, host, "{\"version\":1,\"type\":\"select_avatar\",\"avatarPreset\":\"campus-mira\"}", "room_state");
            assertEquals("campus-mira", chosen.path("players").get(0).path("avatarPreset").asText());
            for (String field : List.of("playerId", "displayName", "colour", "seat", "ready", "x", "y", "facing"))
                assertEquals(ready.path("players").get(0).path(field), chosen.path("players").get(0).path(field), field);
            assertEquals(ready.path("players").get(1), chosen.path("players").get(1), "Selection changes only its sender");
            await(guest, chosen);

            NativeAvatarPublicationTest.publish(file, NativeAvatarPublicationTest.preset("campus-new", "New design"));
            var other = connect(handler, "native-new-room");
            JsonNode newRoom = send(handler, other, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Other\"}", "room_snapshot");
            assertEquals("campus-new", newRoom.path("players").get(0).path("avatarPreset").asText());
            int observerMessages = guest.payloads().size();
            JsonNode rejected = send(handler, host, "{\"version\":1,\"type\":\"select_avatar\",\"avatarPreset\":\"campus-new\"}", "error");
            assertEquals("invalid_avatar_preset", rejected.path("code").asText());
            assertEquals(observerMessages, guest.payloads().size());

            handler.afterConnectionClosed(host.session, CloseStatus.NORMAL);
            var returned = connect(handler, "native-recovered");
            JsonNode restored = send(handler, returned, "{\"version\":1,\"type\":\"recover_room\",\"roomId\":\"" + code
                    + "\",\"recoveryToken\":\"" + initial.path("recoveryToken").asText() + "\"}", "room_snapshot");
            assertEquals(initial.path("selfPlayerId"), restored.path("selfPlayerId"));
            assertEquals("campus-mira", restored.path("players").get(0).path("avatarPreset").asText());
            assertTrue(restored.path("players").get(0).path("ready").asBoolean());
            for (String field : List.of("playerId", "displayName", "colour", "seat"))
                assertEquals(chosen.path("players").get(0).path(field), restored.path("players").get(0).path(field), field);

            for (int index = 0; index < 2; index++) {
                var player = connect(handler, "native-ready-" + index);
                send(handler, player, "{\"version\":1,\"type\":\"join_room\",\"roomId\":\"" + code + "\",\"displayName\":\"Player\"}", "room_snapshot");
                send(handler, player, "{\"version\":1,\"type\":\"set_ready\",\"ready\":true}", "room_state");
            }
            send(handler, guest, "{\"version\":1,\"type\":\"set_ready\",\"ready\":true}", "room_state");
            JsonNode started = send(handler, returned, "{\"version\":1,\"type\":\"start_game\"}", "room_state");
            assertEquals("playing", started.path("phase").asText());
            assertEquals("campus-mira", started.path("players").get(0).path("avatarPreset").asText());
            JsonNode afterStart = send(handler, returned, "{\"version\":1,\"type\":\"select_avatar\",\"avatarPreset\":\"campus-rowan\"}", "error");
            assertEquals("invalid_phase", afterStart.path("code").asText());
            assertFalse(afterStart.has("players"));
        }
    }

    private NativeSocket connect(GameWebSocketHandler handler, String id) {
        var socket = new NativeSocket(id);
        handler.afterConnectionEstablished(socket.session);
        return socket;
    }

    private JsonNode send(GameWebSocketHandler handler, NativeSocket socket, String request, String expectedType) throws Exception {
        int before = socket.payloads().size();
        handler.handleMessage(socket.session, new TextMessage(request));
        long deadline = System.nanoTime() + 3_000_000_000L;
        while (System.nanoTime() < deadline) {
            List<String> payloads = socket.payloads();
            for (int index = before; index < payloads.size(); index++) {
                JsonNode event = json.readTree(payloads.get(index));
                if (event.path("type").asText().equals(expectedType)) return event;
                if (event.path("type").asText().equals("error")) throw new AssertionError(payloads.get(index));
            }
            Thread.sleep(5);
        }
        throw new AssertionError("No " + expectedType + " delivered: " + socket.payloads());
    }

    /** Protect the existing socket recorder when exercising real asynchronous outboxes. */
    private static final class NativeSocket {
        private final RecordingWebSocketSession recorder;
        private final WebSocketSession session;

        NativeSocket(String id) {
            recorder = new RecordingWebSocketSession(id);
            session = (WebSocketSession) java.lang.reflect.Proxy.newProxyInstance(
                    WebSocketSession.class.getClassLoader(), new Class<?>[] { WebSocketSession.class },
                    (proxy, method, arguments) -> {
                        synchronized (recorder) {
                            try { return method.invoke(recorder, arguments); }
                            catch (java.lang.reflect.InvocationTargetException exception) { throw exception.getCause(); }
                        }
                    });
        }

        List<String> payloads() { synchronized (recorder) { return recorder.payloads(); } }
    }

    private void await(NativeSocket socket, JsonNode expected) throws Exception {
        long deadline = System.nanoTime() + 3_000_000_000L;
        while (System.nanoTime() < deadline) {
            for (String payload : socket.payloads()) {
                if (json.readTree(payload).equals(expected)) return;
            }
            Thread.sleep(5);
        }
        throw new AssertionError("Expected authorized selection delivery to observer");
    }
}
