package dev.lpa.pu_go.voice;

import com.google.protobuf.ByteString;
import com.google.protobuf.UnknownFieldSet;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.AbstractWebSocketHandler;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** The only public signaling entrance; LiveKit's own signaling port stays on loopback. */
@Component
public class VoiceGateway extends AbstractWebSocketHandler implements HandshakeInterceptor {
    private final VoiceService voice;
    private final StandardWebSocketClient client = new StandardWebSocketClient();
    private final Map<String, WebSocketSession> upstreams = new ConcurrentHashMap<>();
    public VoiceGateway(VoiceService voice) { this.voice = voice; }

    @Override public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                              WebSocketHandler handler, Map<String, Object> attributes) {
        String token = UriComponentsBuilder.fromUri(request.getURI()).build().getQueryParams().getFirst("access_token");
        if (token == null) {
            String authorization = request.getHeaders().getFirst("Authorization");
            if (authorization != null && authorization.startsWith("Bearer ")) token = authorization.substring(7);
        }
        String join = UriComponentsBuilder.fromUri(request.getURI()).build().getQueryParams().getFirst("join_request");
        VoiceService.Grant grant = voice.authorize(token);
        if (grant == null || !VoiceSignalPolicy.allowsJoin(join, grant.canPublish())) { response.setStatusCode(HttpStatus.FORBIDDEN); return false; }
        attributes.put("grant", grant);
        return true;
    }
    @Override public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                         WebSocketHandler handler, Exception exception) {}

    @Override public void afterConnectionEstablished(WebSocketSession session) {
        session.setBinaryMessageSizeLimit(256 * 1024);
        WebSocketSession downstream = new ConcurrentWebSocketSessionDecorator(session, 2000, 256 * 1024);
        var grant = (VoiceService.Grant) session.getAttributes().get("grant");
        // Attach before connecting so a Leave racing the upstream handshake is latched.
        voice.attach(grant, () -> { close(downstream); close(upstreams.remove(session.getId())); });
        var uri = session.getUri();
        String path = uri.getPath().substring("/voice".length());
        client.execute(new AbstractWebSocketHandler() {
            @Override public void afterConnectionEstablished(WebSocketSession upstream) {
                upstream.setBinaryMessageSizeLimit(256 * 1024);
                upstreams.put(session.getId(), new ConcurrentWebSocketSessionDecorator(upstream, 2000, 256 * 1024));
                if (!downstream.isOpen() || !grant.allowed().getAsBoolean()) close(upstreams.remove(session.getId()));
            }
            @Override public void handleMessage(WebSocketSession upstream, WebSocketMessage<?> message) throws IOException {
                if (!downstream.isOpen()) return;
                if (message instanceof BinaryMessage binary) {
                    // SignalResponse.refresh_token = 16 in LiveKit's pinned protocol.
                    // Preserve every other protobuf field, including future additions.
                    var fields = UnknownFieldSet.parseFrom(ByteString.copyFrom(binary.getPayload().duplicate()));
                    if (fields.hasField(16)) {
                        fields = fields.toBuilder().clearField(16).addField(16,
                                UnknownFieldSet.Field.newBuilder().addLengthDelimited(ByteString.copyFromUtf8(voice.gatewayToken(grant))).build()).build();
                        message = new BinaryMessage(fields.toByteArray());
                    }
                    downstream.sendMessage(message);
                } else if (message instanceof TextMessage) {
                    // An unexpected text codec must never expose an upstream credential.
                    close(downstream);
                }
            }
            @Override public void afterConnectionClosed(WebSocketSession upstream, CloseStatus status) { close(downstream); }
            @Override public void handleTransportError(WebSocketSession upstream, Throwable error) { close(downstream); }
        }, new WebSocketHttpHeaders(), voice.upstream(path, UriComponentsBuilder.fromUri(uri).replaceQueryParam("access_token", voice.mediaToken(grant)).build(true).toUri().getRawQuery()))
                .exceptionally(error -> { close(downstream); return null; });
    }

    @Override public void handleMessage(WebSocketSession session, WebSocketMessage<?> message) throws IOException {
        var grant = (VoiceService.Grant) session.getAttributes().get("grant");
        if (!grant.allowed().getAsBoolean() || !(message instanceof BinaryMessage binary)
                || !VoiceSignalPolicy.allowsSignal(ByteString.copyFrom(binary.getPayload().duplicate()), grant.canPublish())) {
            voice.revoke(grant); close(session); return;
        }
        WebSocketSession upstream = upstreams.get(session.getId());
        if (upstream == null || !upstream.isOpen()) { close(session); return; }
        upstream.sendMessage(message);
    }
    @Override public void afterConnectionClosed(WebSocketSession session, CloseStatus status) { close(upstreams.remove(session.getId())); }
    @Override public void handleTransportError(WebSocketSession session, Throwable error) { close(session); close(upstreams.remove(session.getId())); }
    private static void close(WebSocketSession session) {
        if (session != null && session.isOpen()) try { session.close(new CloseStatus(4003, "Voice access ended")); } catch (IOException | IllegalStateException ignored) {}
    }
}
