package dev.lpa.pu_go.websocket.handler;

import dev.lpa.pu_go.developer.DeveloperCapabilities;
import dev.lpa.pu_go.developer.LocalDeveloperAccess;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Real HTTP and WebSocket handshakes, then externally observed recipient deliveries. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"putown.developer.enabled=true", "server.address=127.0.0.1"})
class NativeDeveloperAccessTest {
    @LocalServerPort private int port;
    @Autowired private GameWebSocketHandler handler;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();

    @Test
    void nativeCapabilityAndHandshakeRequireTheVersionedDirectLocalRequest() throws Exception {
        URI capability = URI.create("http://127.0.0.1:" + port + "/developer/capabilities");
        assertEquals(200, capability(capability, Map.of(LocalDeveloperAccess.NATIVE_VERSION_HEADER, "1")));
        assertEquals(404, capability(capability, Map.of()));
        assertEquals(404, capability(capability, Map.of(LocalDeveloperAccess.NATIVE_VERSION_HEADER, "2")));
        for (String header : List.of("Forwarded", "X-Forwarded-For", "X-Forwarded-Host", "X-Real-IP", "Tailscale-User-Login")) {
            assertEquals(404, capability(capability, Map.of(LocalDeveloperAccess.NATIVE_VERSION_HEADER, "1", header, "127.0.0.1")));
            try (var denied = connect(Map.of(LocalDeveloperAccess.NATIVE_VERSION_HEADER, "1", header, "127.0.0.1"))) {
                denied.send("{\"version\":1,\"type\":\"create_developer_room\",\"displayName\":\"Denied\"}");
                assertEquals("developer_unavailable", denied.next("error").path("code").asText());
                assertFalse(denied.has("developer_state"));
            }
        }
        HttpRequest repeated = HttpRequest.newBuilder(capability)
                .header(LocalDeveloperAccess.NATIVE_VERSION_HEADER, "1")
                .header(LocalDeveloperAccess.NATIVE_VERSION_HEADER, "1").GET().build();
        assertEquals(404, http.send(repeated, HttpResponse.BodyHandlers.discarding()).statusCode());
        for (Map<String,String> headers : List.of(Map.<String,String>of(), Map.of(LocalDeveloperAccess.NATIVE_VERSION_HEADER,"2"))) {
            try (var denied = connect(headers)) {
                denied.send("{\"version\":1,\"type\":\"create_developer_room\",\"displayName\":\"Denied\"}");
                assertEquals("developer_unavailable", denied.next("error").path("code").asText());
            }
        }
        var disabled = MockMvcBuilders.standaloneSetup(new DeveloperCapabilities(false)).build();
        disabled.perform(get("http://127.0.0.1:8080/developer/capabilities")
                .header(LocalDeveloperAccess.NATIVE_VERSION_HEADER,"1")
                .with(request -> { request.setRemoteAddr("127.0.0.1"); return request; }))
                .andExpect(status().isNotFound());
        try (var disabledSocket = connect(Map.of(LocalDeveloperAccess.NATIVE_VERSION_HEADER,"1"))) {
            handler.setDeveloperEnabled(false);
            try {
                disabledSocket.send("{\"version\":1,\"type\":\"create_developer_room\",\"displayName\":\"Disabled\"}");
                assertEquals("developer_unavailable", disabledSocket.next("error").path("code").asText());
            } finally { handler.setDeveloperEnabled(true); }
        }
    }

    @Test
    void nativeControllerAloneReceivesExactSimulatedRolesAndOrdinaryNativeSessionsCannotInspect() throws Exception {
        Map<String,String> headers = Map.of(LocalDeveloperAccess.NATIVE_VERSION_HEADER,"1");
        try (var controller = connect(headers); var guest = connect(headers); var ordinary = connect(headers)) {
            controller.send("{\"version\":1,\"type\":\"create_developer_room\",\"displayName\":\"Controller\"}");
            String code = controller.next("room_snapshot").path("roomId").asText();
            controller.next("developer_state");
            controller.send("{\"version\":1,\"type\":\"developer_command\",\"action\":\"add_player\",\"displayName\":\"Simulated Sheriff\",\"role\":\"sheriff\"}");
            JsonNode inspector = controller.next("developer_state", event -> event.path("players").size() == 2);
            assertEquals("sheriff", inspector.path("players").get(1).path("role").asText());
            guest.send("{\"version\":1,\"type\":\"join_room\",\"roomId\":\"" + code + "\",\"displayName\":\"Guest\"}");
            guest.next("room_snapshot");
            controller.send("{\"version\":1,\"type\":\"developer_command\",\"action\":\"start\"}");
            JsonNode game = guest.next("game_state");
            assertEquals("role_reveal", game.path("phase").asText());
            assertTrue(game.path("roles").isNull(), "A Game view must not disclose every Role");
            guest.send("{\"version\":1,\"type\":\"developer_command\",\"action\":\"inspect\"}");
            assertEquals("not_controller", guest.next("error").path("code").asText());
            assertTrue(guest.has("developer_status"));
            assertFalse(guest.has("developer_state"), "The ordinary native connection receives no inspector payload");
            ordinary.send("{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Ordinary\"}");
            ordinary.next("room_snapshot");
            ordinary.send("{\"version\":1,\"type\":\"developer_command\",\"action\":\"inspect\"}");
            assertEquals("developer_unavailable", ordinary.next("error").path("code").asText());
            ordinary.send("{\"version\":1,\"type\":\"start_practice\"}");
            ordinary.next("game_state");
            ordinary.send("{\"version\":1,\"type\":\"developer_command\",\"action\":\"inspect\"}");
            assertEquals("developer_unavailable", ordinary.next("error").path("code").asText());
            assertFalse(ordinary.has("developer_state"));
        }
    }

    private int capability(URI endpoint, Map<String,String> headers) throws Exception {
        var request = HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(3));
        headers.forEach(request::header);
        return http.send(request.GET().build(),HttpResponse.BodyHandlers.discarding()).statusCode();
    }

    private Peer connect(Map<String,String> headers) throws Exception {
        var peer = new Peer();
        var builder = http.newWebSocketBuilder().connectTimeout(Duration.ofSeconds(3));
        headers.forEach(builder::header);
        peer.socket = builder.buildAsync(URI.create("ws://127.0.0.1:"+port+"/ws/game"),peer).get(5,TimeUnit.SECONDS);
        return peer;
    }

    private final class Peer implements WebSocket.Listener, AutoCloseable {
        private WebSocket socket;
        private final StringBuilder fragments = new StringBuilder();
        private final LinkedBlockingQueue<String> received = new LinkedBlockingQueue<>();
        private final List<JsonNode> observed = new CopyOnWriteArrayList<>();
        @Override public void onOpen(WebSocket socket) { socket.request(1); }
        @Override public CompletionStage<?> onText(WebSocket socket,CharSequence data,boolean last) {
            fragments.append(data);
            if (last) { received.add(fragments.toString()); fragments.setLength(0); }
            socket.request(1); return null;
        }
        void send(String message) { socket.sendText(message,true).join(); }
        JsonNode next(String type) throws Exception { return next(type,event -> true); }
        JsonNode next(String type,java.util.function.Predicate<JsonNode> matches) throws Exception {
            long deadline = System.nanoTime()+TimeUnit.SECONDS.toNanos(5);
            while (System.nanoTime()<deadline) {
                String payload = received.poll(Math.max(1,deadline-System.nanoTime()),TimeUnit.NANOSECONDS);
                assertNotNull(payload,"No "+type+" message arrived");
                JsonNode event = mapper.readTree(payload); observed.add(event);
                if (type.equals(event.path("type").asText()) && matches.test(event)) return event;
            }
            throw new AssertionError("No "+type+" message arrived");
        }
        boolean has(String type) { return observed.stream().anyMatch(e -> type.equals(e.path("type").asText())); }
        @Override public void close() throws Exception {
            if (socket != null) {
                if (has("room_snapshot")) {
                    send("{\"version\":1,\"type\":\"leave_room\"}");
                    next("room_left");
                }
                socket.sendClose(WebSocket.NORMAL_CLOSURE,"test complete").join();
            }
        }
    }
}
