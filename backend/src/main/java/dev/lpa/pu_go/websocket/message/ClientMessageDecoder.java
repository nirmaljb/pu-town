package dev.lpa.pu_go.websocket.message;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.Set;

public final class ClientMessageDecoder {
    public static final int PROTOCOL_VERSION = 1;
    private final ObjectMapper objectMapper;

    public ClientMessageDecoder(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public ClientMessage decode(String payload) throws InvalidClientMessageException {
        final JsonNode root;
        try {
            root = objectMapper.readTree(payload);
        } catch (Exception exception) {
            throw new InvalidClientMessageException("malformed_message", "Message must be valid JSON.");
        }
        if (root == null || !root.isObject()) {
            throw new InvalidClientMessageException("malformed_message", "Message must be a JSON object.");
        }
        JsonNode version = root.get("version");
        if (version == null || !version.isInt() || version.asInt() != PROTOCOL_VERSION) {
            throw new InvalidClientMessageException("unsupported_version", "Only protocol version 1 is supported.");
        }
        String type = requiredText(root, "type");
        return switch (type) {
            case "ping" -> {
                requireOnly(root, Set.of("version", "type"));
                yield new ClientMessage.Ping(1, type);
            }
            case "create_room" -> {
                requireOnly(root, Set.of("version", "type", "displayName"));
                yield new ClientMessage.CreateRoom(PROTOCOL_VERSION, type, displayName(root));
            }
            case "join_room" -> {
                requireOnly(root, Set.of("version", "type", "roomId", "displayName"));
                yield new ClientMessage.JoinRoom(PROTOCOL_VERSION, type,
                        requiredText(root, "roomId").strip().toUpperCase(java.util.Locale.ROOT), displayName(root));
            }
            case "leave_room" -> {
                requireOnly(root, Set.of("version", "type"));
                yield new ClientMessage.LeaveRoom(PROTOCOL_VERSION, type);
            }
            case "move_player" -> {
                requireOnly(root, Set.of("version", "type", "x", "y"));
                yield new ClientMessage.MovePlayer(PROTOCOL_VERSION, type,
                        requiredNumber(root, "x"), requiredNumber(root, "y"));
            }
            default -> throw new InvalidClientMessageException("unknown_message_type", "Unknown message type: " + type);
        };
    }

    private static String displayName(JsonNode root) throws InvalidClientMessageException {
        String name = requiredText(root, "displayName").strip();
        if (name.codePointCount(0, name.length()) > 24)
            throw new InvalidClientMessageException("malformed_message", "Display Name must be 1–24 characters.");
        return name;
    }

    private static String requiredText(JsonNode root, String name) throws InvalidClientMessageException {
        JsonNode value = root.get(name);
        if (value == null || !value.isTextual() || value.asText().isBlank()) {
            throw new InvalidClientMessageException("malformed_message", name + " must be a non-empty string.");
        }
        return value.asText();
    }

    private static double requiredNumber(JsonNode root, String name) throws InvalidClientMessageException {
        JsonNode value = root.get(name);
        if (value == null || !value.isNumber()) {
            throw new InvalidClientMessageException("malformed_message", name + " must be a number.");
        }
        return value.asDouble();
    }

    private static void requireOnly(JsonNode root, Set<String> expected) throws InvalidClientMessageException {
        if (!expected.equals(root.propertyNames())) {
            throw new InvalidClientMessageException("malformed_message", "Message fields do not match its type.");
        }
    }
}
