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
            case "create_developer_room" -> {
                requireOnly(root, Set.of("version", "type", "displayName"));
                yield new ClientMessage.CreateDeveloperRoom(1, type, displayName(root));
            }
            case "take_developer_player" -> {
                requireOnly(root, Set.of("version", "type", "roomId", "playerId"));
                yield new ClientMessage.TakeDeveloperPlayer(1, type, requiredText(root, "roomId"), requiredText(root, "playerId"));
            }
            case "developer_command" -> {
                String action = requiredText(root, "action");
                java.util.HashSet<String> fields = new java.util.HashSet<>(Set.of("version", "type", "action"));
                fields.addAll(switch (action) {
                    case "start", "advance", "reset", "lobby", "inspect", "claim", "release" -> Set.of();
                    case "pause" -> Set.of("enabled");
                    case "setting" -> Set.of("name", "enabled");
                    case "scenario" -> Set.of("name");
                    case "add_player" -> Set.of("displayName", "role");
                    case "remove_player" -> Set.of("playerId");
                    case "role" -> Set.of("playerId", "role");
                    case "status" -> Set.of("playerId", "living");
                    case "teleport" -> Set.of("playerId", "x", "y");
                    case "night_choice", "vote" -> Set.of("playerId", "round", "targetPlayerId");
                    case "open_task" -> Set.of("playerId", "round", "taskId");
                    case "task_step" -> Set.of("playerId", "round", "taskId", "step", "value");
                    case "task" -> Set.of("playerId", "taskId", "location", "kind", "steps", "durationMs", "step");
                    default -> throw new InvalidClientMessageException("malformed_message", "Unknown developer action.");
                });
                requireOnly(root, fields);
                for (String field : fields) {
                    switch (field) {
                        case "enabled", "living" -> { if (!root.get(field).isBoolean()) throw new InvalidClientMessageException("malformed_message", field + " must be boolean."); }
                        case "x", "y" -> coordinate(root, field);
                        case "round" -> round(root);
                        case "step", "value", "location", "steps", "durationMs" -> count(root, field);
                        case "targetPlayerId" -> { if (!root.get(field).isNull()) requiredText(root, field); }
                        case "playerId", "taskId", "name", "kind" -> requiredText(root, field);
                        case "displayName" -> displayName(root);
                        case "role" -> { if (!Set.of("mafia", "villager", "doctor", "sheriff").contains(requiredText(root, field))) throw new InvalidClientMessageException("malformed_message", "Unknown Role."); }
                        default -> { }
                    }
                }
                if (action.equals("setting") && !Set.of("automatic", "factionVictory", "taskVictory", "taskRange", "taskDuration", "nightMovement").contains(root.get("name").asText()))
                    throw new InvalidClientMessageException("malformed_message", "Unknown developer setting.");
                if (action.equals("scenario") && !Set.of("four_roles", "protection", "voting", "tasks", "recovery").contains(root.get("name").asText()))
                    throw new InvalidClientMessageException("malformed_message", "Unknown scenario.");
                if (action.equals("task") && (!Set.of("repair", "sequence", "delivery").contains(root.get("kind").asText()) || root.get("steps").asInt() < 1 || root.get("steps").asInt() > 100 || root.get("step").asInt() > root.get("steps").asInt() || root.get("durationMs").asInt() > 3_600_000))
                    throw new InvalidClientMessageException("malformed_message", "Invalid Task configuration.");
                yield new ClientMessage.DeveloperCommand(1, type, action, root);
            }
            case "select_map" -> {
                requireOnly(root, Set.of("version", "type", "mapId"));
                String mapId = requiredText(root, "mapId");
                if (dev.lpa.pu_go.room.TownMap.find(mapId) == null)
                    throw new InvalidClientMessageException("malformed_message", "Unknown mapId.");
                yield new ClientMessage.SelectMap(1, type, mapId);
            }
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
            case "preview_role" -> {
                requireOnly(root, Set.of("version", "type", "role"));
                String role = requiredText(root, "role");
                dev.lpa.pu_go.game.Role selected = java.util.Arrays.stream(dev.lpa.pu_go.game.Role.values())
                        .filter(value -> value.wireValue().equals(role)).findFirst().orElse(null);
                if (selected == null) throw new InvalidClientMessageException("malformed_message", "Unknown Role.");
                yield new ClientMessage.PreviewRole(1, type, selected);
            }
            case "start_practice" -> {
                requireOnly(root, Set.of("version", "type"));
                yield new ClientMessage.StartPractice(1, type);
            }
            case "advance_practice" -> {
                requireOnly(root, Set.of("version", "type", "round", "phase"));
                String phase = requiredText(root, "phase");
                if (!Set.of("day", "night", "discussion", "voting", "voting_result").contains(phase))
                    throw new InvalidClientMessageException("malformed_message", "Unknown practice phase.");
                yield new ClientMessage.AdvancePractice(1, type, round(root), phase);
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
            case "meeting_vote", "night_choice" -> {
                requireOnly(root, Set.of("version", "type", "round", "targetPlayerId"));
                JsonNode target = root.get("targetPlayerId");
                if (target == null || !(target.isNull() || target.isTextual() && !target.asText().isBlank()))
                    throw new InvalidClientMessageException("malformed_message", "targetPlayerId must be a Player ID or null.");
                String targetId = target.isNull() ? null : target.asText();
                yield type.equals("night_choice") ? new ClientMessage.NightChoice(1, type, round(root), targetId)
                        : new ClientMessage.MeetingVote(1, type, round(root), targetId);
            }
            case "join_voice" -> {
                requireOnly(root, Set.of("version", "type", "round"));
                yield new ClientMessage.JoinVoice(1, type, round(root));
            }
            case "leave_voice" -> {
                requireOnly(root, Set.of("version", "type"));
                yield new ClientMessage.LeaveVoice(1, type);
            }
            case "open_task" -> {
                requireOnly(root, Set.of("version", "type", "round", "taskId"));
                yield new ClientMessage.OpenTask(1, type, round(root), requiredText(root, "taskId"));
            }
            case "task_step" -> {
                requireOnly(root, Set.of("version", "type", "round", "taskId", "step", "value"));
                yield new ClientMessage.TaskStep(1, type, round(root), requiredText(root, "taskId"), count(root, "step"), count(root, "value"));
            }
            case "close_task" -> {
                requireOnly(root, Set.of("version", "type"));
                yield new ClientMessage.CloseTask(1, type);
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

    private static final Set<String> FACINGS = Set.of("up", "left", "down", "right");

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
