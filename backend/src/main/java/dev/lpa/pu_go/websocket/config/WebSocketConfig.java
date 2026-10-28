package dev.lpa.pu_go.websocket.config;

import dev.lpa.pu_go.websocket.handler.GameWebSocketHandler;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * The WebSocket route and the browser origins allowed to use it and the collection endpoint.
 * Both read the same {@code putown.allowed-origins} patterns, so a page served from another
 * computer on the network can play as long as it comes from the frontend's port.
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer, WebMvcConfigurer {
    private final GameWebSocketHandler gameWebSocketHandler;
    private final String[] allowedOrigins;

    public WebSocketConfig(GameWebSocketHandler gameWebSocketHandler,
                           @Value("${putown.allowed-origins}") String[] allowedOrigins) {
        this.gameWebSocketHandler = gameWebSocketHandler;
        this.allowedOrigins = allowedOrigins;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(gameWebSocketHandler, "/ws/game")
                .setAllowedOriginPatterns(allowedOrigins);
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/rooms/**")
                .allowedOriginPatterns(allowedOrigins)
                .allowedMethods("GET");
    }
}
