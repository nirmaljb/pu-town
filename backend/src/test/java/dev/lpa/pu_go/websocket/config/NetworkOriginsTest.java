package dev.lpa.pu_go.websocket.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.util.concurrent.CompletionException;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** A page served to another computer, on the network or through a shared link, can play; a page from elsewhere cannot. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class NetworkOriginsTest {
    private static final String NETWORK_PAGE = "http://192.168.1.20:5173";

    @LocalServerPort
    int port;

    private final HttpClient client = HttpClient.newHttpClient();

    private WebSocket open(String origin) {
        return client.newWebSocketBuilder()
                .header("Origin", origin)
                .buildAsync(URI.create("ws://localhost:" + port + "/ws/game"), new WebSocket.Listener() {})
                .orTimeout(5, TimeUnit.SECONDS)
                .join();
    }

    private HttpResponse<Void> fetchCollection(String origin) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/rooms/ZZZZZZ/avatars"))
                .header("Origin", origin)
                .build();
        return client.send(request, HttpResponse.BodyHandlers.discarding());
    }

    @Test
    void aPageFromAnotherComputerOnTheFrontendPortConnects() throws Exception {
        WebSocket socket = open(NETWORK_PAGE);
        socket.sendClose(WebSocket.NORMAL_CLOSURE, "").join();

        assertEquals(NETWORK_PAGE,
                fetchCollection(NETWORK_PAGE).headers().firstValue("Access-Control-Allow-Origin").orElse(null));
    }

    @Test
    void aPageFromASharedLinkConnects() throws Exception {
        String sharedLink = "https://quiet-town.trycloudflare.com";
        WebSocket socket = open(sharedLink);
        socket.sendClose(WebSocket.NORMAL_CLOSURE, "").join();

        assertEquals(sharedLink,
                fetchCollection(sharedLink).headers().firstValue("Access-Control-Allow-Origin").orElse(null));
    }

    @Test
    void aPageFromAnotherPortIsRefused() throws Exception {
        assertThrows(CompletionException.class, () -> open("http://192.168.1.20:9999"));
        assertThrows(CompletionException.class, () -> open("https://trycloudflare.com.example.org"));

        HttpResponse<Void> response = fetchCollection("http://192.168.1.20:9999");
        assertEquals(403, response.statusCode());
        assertNull(response.headers().firstValue("Access-Control-Allow-Origin").orElse(null));
    }
}
