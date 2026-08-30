package dev.lpa.pu_go.websocket.support;

import org.springframework.http.HttpHeaders;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketExtension;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.security.Principal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class RecordingWebSocketSession implements WebSocketSession {
    private final String id;
    private final List<WebSocketMessage<?>> messages = new ArrayList<>();
    private final Map<String, Object> attributes = new HashMap<>();
    private boolean open = true;
    private CloseStatus closeStatus;
    private int textMessageSizeLimit = 64 * 1024;
    private int binaryMessageSizeLimit = 64 * 1024;

    public RecordingWebSocketSession(String id) {
        this.id = id;
    }

    public List<String> payloads() {
        return messages.stream().map(message -> message.getPayload().toString()).toList();
    }

    public CloseStatus closeStatus() {
        return closeStatus;
    }

    @Override public String getId() { return id; }
    @Override public URI getUri() { return URI.create("ws://localhost/ws/game"); }
    @Override public HttpHeaders getHandshakeHeaders() { return HttpHeaders.EMPTY; }
    @Override public Map<String, Object> getAttributes() { return attributes; }
    @Override public Principal getPrincipal() { return null; }
    @Override public InetSocketAddress getLocalAddress() { return null; }
    @Override public InetSocketAddress getRemoteAddress() { return null; }
    @Override public String getAcceptedProtocol() { return null; }
    @Override public void setTextMessageSizeLimit(int messageSizeLimit) { textMessageSizeLimit = messageSizeLimit; }
    @Override public int getTextMessageSizeLimit() { return textMessageSizeLimit; }
    @Override public void setBinaryMessageSizeLimit(int messageSizeLimit) { binaryMessageSizeLimit = messageSizeLimit; }
    @Override public int getBinaryMessageSizeLimit() { return binaryMessageSizeLimit; }
    @Override public List<WebSocketExtension> getExtensions() { return List.of(); }

    @Override
    public void sendMessage(WebSocketMessage<?> message) throws IOException {
        if (!open) throw new IOException("session is closed");
        messages.add(message);
    }

    @Override public boolean isOpen() { return open; }
    @Override public void close() { close(CloseStatus.NORMAL); }

    @Override
    public void close(CloseStatus status) {
        open = false;
        closeStatus = status;
    }
}
