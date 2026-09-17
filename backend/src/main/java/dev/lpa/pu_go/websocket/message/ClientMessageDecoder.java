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
            case "select_avatar" -> {
                requireOnly(root, Set.of("version", "type", "avatarPreset"));
                yield new ClientMessage.SelectAvatar(1, type, requiredText(root, "avatarPreset"));
            }
            case "set_ready" -> {
                requireOnly(root, Set.of("version", "type", "ready"));
                if (!root.get("ready").isBoolean())
                    throw new InvalidClientMessageException("malformed_message", "ready must be a boolean.");
                yield new ClientMessage.SetReady(1, type, root.get("ready").asBoolean());
            }
            case "start_game" -> {
                requireOnly(root, Set.of("version", "type"));
                yield new ClientMessage.StartGame(1, type);
            }
            case "mafia_vote", "protect", "investigate" -> {
                requireOnly(root, Set.of("version", "type", "round", "targetPlayerId"));
                yield new ClientMessage.NightAction(1, type, dev.lpa.pu_go.game.NightChoice.ofWireValue(type),
                        round(root), requiredText(root, "targetPlayerId"));
            }
            case "meeting_vote" -> {
                requireOnly(root, Set.of("version", "type", "round", "targetPlayerId"));
                JsonNode target = root.get("targetPlayerId");
                if (target == null || !(target.isNull() || target.isTextual() && !target.asText().isBlank()))
                    throw new InvalidClientMessageException("malformed_message", "targetPlayerId must be a Player ID or null.");
                yield new ClientMessage.MeetingVote(1, type, round(root), target.isNull() ? null : target.asText());
            }
            case "send_chat" -> {
                requireOnly(root, Set.of("version", "type", "channel", "text"));
                dev.lpa.pu_go.game.ChatChannel channel =
                        dev.lpa.pu_go.game.ChatChannel.ofWireValue(requiredText(root, "channel"));
                if (channel == null)
                    throw new InvalidClientMessageException("malformed_message", "Unknown chat channel.");
                yield new ClientMessage.SendChat(1, type, channel, chatText(root));
            }
            case "ping" -> {
                requireOnly(root, Set.of("version", "type"));
                yield new ClientMessage.Ping(1, type);
            }
            case "create_room" -> {
                requireOnly(root, Set.of("version", "type", "displayName"));
                yield new ClientMessage.CreateRoom(PROTOCOL_VERSION, type, displayName(root));
            }
            case "recover_room" -> {
                requireOnly(root, Set.of("version", "type", "roomId", "recoveryToken"));
                String token = requiredText(root, "recoveryToken");
                if (!token.matches("[0-9a-f]{64}"))
                    throw new InvalidClientMessageException("malformed_message", "Invalid recovery credential.");
                yield new ClientMessage.RecoverRoom(1, type,
                        requiredText(root, "roomId").strip().toUpperCase(java.util.Locale.ROOT), token);
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
            default -> throw new InvalidClientMessageException("unknown_message_type", "Unknown message type: " + type);
        };
    }

    private static int round(JsonNode root) throws InvalidClientMessageException {
        JsonNode value = root.get("round");
        if (value == null || !value.isIntegralNumber() || !value.canConvertToInt() || value.asInt() < 1)
            throw new InvalidClientMessageException("malformed_message", "round must be a positive integer.");
        return value.asInt();
    }

    public static final int MAX_CHAT_CHARACTERS = 240;

    private static String chatText(JsonNode root) throws InvalidClientMessageException {
        String text = requiredText(root, "text").strip();
        if (text.isEmpty() || text.codePointCount(0, text.length()) > MAX_CHAT_CHARACTERS)
            throw new InvalidClientMessageException("malformed_message",
                    "A chat message must be 1\u2013" + MAX_CHAT_CHARACTERS + " characters.");
        return text;
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


    private static void requireOnly(JsonNode root, Set<String> expected) throws InvalidClientMessageException {
        if (!expected.equals(root.propertyNames())) {
            throw new InvalidClientMessageException("malformed_message", "Message fields do not match its type.");
        }
    }
}
