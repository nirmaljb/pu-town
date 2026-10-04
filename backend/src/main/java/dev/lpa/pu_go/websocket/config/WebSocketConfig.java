package dev.lpa.pu_go.websocket.config;

import dev.lpa.pu_go.websocket.handler.GameWebSocketHandler;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
    private final GameWebSocketHandler gameWebSocketHandler;
    private final String[] allowedOrigins;
    private final dev.lpa.pu_go.voice.VoiceGateway voiceGateway;

    public WebSocketConfig(GameWebSocketHandler gameWebSocketHandler, dev.lpa.pu_go.voice.VoiceGateway voiceGateway,
            @Value("${putown.allowed-origins:http://localhost:5173,https://localhost:5173}") String[] allowedOrigins) {
        this.gameWebSocketHandler = gameWebSocketHandler;
        this.voiceGateway = voiceGateway;
        this.allowedOrigins = allowedOrigins;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(voiceGateway, "/voice/rtc", "/voice/rtc/v1")
                .addInterceptors(voiceGateway).setAllowedOrigins(allowedOrigins);
        registry.addHandler(gameWebSocketHandler, "/ws/game")
                .setAllowedOrigins(allowedOrigins);
    }
}
