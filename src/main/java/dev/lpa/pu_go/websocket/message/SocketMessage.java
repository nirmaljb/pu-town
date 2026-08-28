package dev.lpa.pu_go.websocket.message;

import tools.jackson.databind.JsonNode;

public record SocketMessage(
        String type,
        String roomId,
        String clientId,
        JsonNode payload
) {}
