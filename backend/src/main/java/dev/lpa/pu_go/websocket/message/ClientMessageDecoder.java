package dev.lpa.pu_go.websocket.message;

import dev.lpa.pu_go.game.Ability;
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
            case "set_role_setup" -> {
                requireOnly(root, Set.of("version", "type", "mafia", "doctors", "sheriffs"));
                yield new ClientMessage.SetRoleSetup(1, type, count(root, "mafia"), count(root, "doctors"), count(root, "sheriffs"));
            }
            case "start_game" -> {
                requireOnly(root, Set.of("version", "type"));
                yield new ClientMessage.StartGame(1, type);
            }
            case "move" -> {
                requireOnly(root, Set.of("version", "type", "x", "y", "facing"));
                String facing = requiredText(root, "facing");
                if (!FACINGS.contains(facing))
                    throw new InvalidClientMessageException("malformed_message", "facing must be up, left, down or right.");
                yield new ClientMessage.Move(1, type, coordinate(root, "x"), coordinate(root, "y"), facing);
            }
            case "use_ability" -> {
                requireOnly(root, Set.of("version", "type", "ability", "round", "targetPlayerId"));
                Ability ability = Ability.ofWireValue(requiredText(root, "ability"));
                if (ability == null) throw new InvalidClientMessageException("malformed_message", "Unknown ability.");
                JsonNode target = root.get("targetPlayerId");
                boolean named = target.isTextual() && !target.asText().isBlank();
                if (ability.targeted() ? !named : !target.isNull())
                    throw new InvalidClientMessageException("malformed_message",
                            ability.targeted() ? "This ability needs a targetPlayerId." : "This ability takes no target.");
                yield new ClientMessage.UseAbility(1, type, ability, round(root), named ? target.asText() : null);
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
            case "set_voice" -> {
                requireOnly(root, Set.of("version", "type", "enabled"));
                if (!root.get("enabled").isBoolean())
                    throw new InvalidClientMessageException("malformed_message", "enabled must be a boolean.");
                yield new ClientMessage.SetVoice(1, type, root.get("enabled").asBoolean());
            }
            case "voice_signal" -> {
                requireOnly(root, Set.of("version", "type", "targetPlayerId", "kind", "data"));
                String kind = requiredText(root, "kind");
                if (!VOICE_SIGNALS.contains(kind))
                    throw new InvalidClientMessageException("malformed_message", "kind must be offer, answer or candidate.");
                String data = requiredText(root, "data");
                if (data.length() > MAX_VOICE_SIGNAL_CHARACTERS)
                    throw new InvalidClientMessageException("malformed_message", "A voice signal is too large.");
                yield new ClientMessage.VoiceSignal(1, type, requiredText(root, "targetPlayerId"), kind, data);
            }
            case "voice_frame" -> {
                requireOnly(root, Set.of("version", "type", "targetPlayerIds", "data"));
                JsonNode targets = root.get("targetPlayerIds");
                if (!targets.isArray() || targets.isEmpty() || targets.size() > MAX_VOICE_TARGETS)
                    throw new InvalidClientMessageException("malformed_message", "targetPlayerIds must list 1–9 Player IDs.");
                java.util.List<String> ids = new java.util.ArrayList<>();
                for (JsonNode target : targets) {
                    if (!target.isTextual() || target.asText().isBlank())
                        throw new InvalidClientMessageException("malformed_message", "targetPlayerIds must list 1–9 Player IDs.");
                    ids.add(target.asText());
                }
                String data = requiredText(root, "data");
                if (data.length() > MAX_VOICE_FRAME_CHARACTERS || !data.matches("[A-Za-z0-9+/]+={0,2}"))
                    throw new InvalidClientMessageException("malformed_message", "data must be one base64 voice packet.");
                yield new ClientMessage.VoiceFrame(1, type, java.util.List.copyOf(ids), data);
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

    private static final Set<String> FACINGS = Set.of("up", "left", "down", "right");
    private static final Set<String> VOICE_SIGNALS = Set.of("offer", "answer", "candidate");
    /** An audio-only session description is a few kilobytes; this leaves generous room. */
    public static final int MAX_VOICE_SIGNAL_CHARACTERS = 16_000;
    /** A 20 ms Opus packet is a few hundred bytes at most; base64 adds a third. */
    public static final int MAX_VOICE_FRAME_CHARACTERS = 2_000;
    private static final int MAX_VOICE_TARGETS = 9;

    private static double coordinate(JsonNode root, String name) throws InvalidClientMessageException {
        JsonNode value = root.get(name);
        if (value == null || !value.isNumber() || !Double.isFinite(value.asDouble()))
            throw new InvalidClientMessageException("malformed_message", name + " must be a finite number.");
        return value.asDouble();
    }

    private static int count(JsonNode root, String name) throws InvalidClientMessageException {
        JsonNode value = root.get(name);
        if (!value.isIntegralNumber() || !value.canConvertToInt() || value.asInt() < 0)
            throw new InvalidClientMessageException("malformed_message", name + " must be a non-negative integer.");
        return value.asInt();
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
