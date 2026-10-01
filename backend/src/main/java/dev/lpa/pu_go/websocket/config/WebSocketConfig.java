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

    public WebSocketConfig(GameWebSocketHandler gameWebSocketHandler,
            @Value("${putown.allowed-origins:http://localhost:5173,https://localhost:5173}") String[] allowedOrigins) {
        this.gameWebSocketHandler = gameWebSocketHandler;
        this.allowedOrigins = allowedOrigins;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(gameWebSocketHandler, "/ws/game")
                .setAllowedOrigins(allowedOrigins);
    }
}
