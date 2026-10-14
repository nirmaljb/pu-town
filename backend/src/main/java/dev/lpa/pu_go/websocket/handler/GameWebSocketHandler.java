package dev.lpa.pu_go.websocket.handler;

import dev.lpa.pu_go.game.ChatEntry;
import dev.lpa.pu_go.game.Game;
import dev.lpa.pu_go.game.GamePhase;
import dev.lpa.pu_go.game.ParticipantStatus;
import dev.lpa.pu_go.voice.VoiceService;
import dev.lpa.pu_go.game.Participant;
import dev.lpa.pu_go.game.Role;
import dev.lpa.pu_go.game.RoleSetup;
import dev.lpa.pu_go.player.PlayerState;
import dev.lpa.pu_go.room.Room;
import dev.lpa.pu_go.room.RoomManager;
import dev.lpa.pu_go.room.RoomRules;
import dev.lpa.pu_go.websocket.message.ClientMessage;
import dev.lpa.pu_go.websocket.message.ClientMessageDecoder;
import dev.lpa.pu_go.websocket.message.InvalidClientMessageException;
import dev.lpa.pu_go.websocket.message.ServerMessage;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.BiConsumer;
import java.util.function.Supplier;
import java.util.function.UnaryOperator;

@Component
public class GameWebSocketHandler extends TextWebSocketHandler {
    private static final List<String> COLOURS = List.of("#4F8CFF", "#FF8066", "#FFD166", "#65D6A4", "#C792EA", "#56DDE0", "#F48FB1", "#D6D3C4", "#F29F38", "#A5CF45");

    private final java.util.concurrent.atomic.AtomicLong soundIds = new java.util.concurrent.atomic.AtomicLong();
    private final Map<String, Long> lastFootsteps = new ConcurrentHashMap<>();
    private final Map<String, Double> walkedSinceFootstep = new ConcurrentHashMap<>();
    @org.springframework.beans.factory.annotation.Value("${putown.developer.enabled:false}")
    private boolean developerEnabled;
    void setDeveloperEnabled(boolean enabled) { developerEnabled = enabled; }
    private boolean developerLocal(PlayerState player) {
        return developerEnabled && player.getSession() != null && Boolean.TRUE.equals(player.getSession().getAttributes().get("developerLocal"));
    }
    private final RoomManager roomManager;
    private final VoiceService voice;
    private final Map<String, List<ServerMessage.VoicePeerView>> dayVoicePeers = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ClientMessageDecoder decoder = new ClientMessageDecoder(objectMapper);
    private final Map<String, PlayerState> playersBySession = new ConcurrentHashMap<>();
    private final Map<String, PlayerState> playersById = new ConcurrentHashMap<>();
    private final Map<String, ConnectionOutbox> outboxes = new ConcurrentHashMap<>();
    private final Executor outboundExecutor;
    private final Supplier<String> playerIdSupplier;
    private final UnaryOperator<List<Role>> roleAssignment;

    @Autowired
    public GameWebSocketHandler(RoomManager roomManager, VoiceService voice) {
        this(roomManager, Executors.newCachedThreadPool(), () -> UUID.randomUUID().toString(), GameWebSocketHandler::shuffleRoles, voice);
    }

    GameWebSocketHandler(RoomManager roomManager, Executor outboundExecutor,
                         Supplier<String> playerIdSupplier, UnaryOperator<List<Role>> roleAssignment) {
        this(roomManager, outboundExecutor, playerIdSupplier, roleAssignment,
                new VoiceService("http://127.0.0.1:7880", "", ""));
    }

    GameWebSocketHandler(RoomManager roomManager, Executor outboundExecutor,
                         Supplier<String> playerIdSupplier, UnaryOperator<List<Role>> roleAssignment,
                         VoiceService voice) {
        this.voice = voice;
        this.roomManager = roomManager;
        this.outboundExecutor = outboundExecutor;
        this.playerIdSupplier = playerIdSupplier;
        this.roleAssignment = roleAssignment;
    }

    /** Roles are drawn independently of Seat order, Display Names and Avatar Presets. */
    private static List<Role> shuffleRoles(List<Role> distribution) {
        List<Role> shuffled = new ArrayList<>(distribution);
        Collections.shuffle(shuffled, new SecureRandom());
        return shuffled;
    }

    @PreDestroy
    void stopOutboundExecutor() {
        if (outboundExecutor instanceof ExecutorService executorService) executorService.shutdownNow();
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        PlayerState player = new PlayerState(playerIdSupplier.get(), session);
        playersBySession.put(session.getId(), player);
        playersById.put(player.getId(), player);
        outboxes.put(player.getId(), new ConnectionOutbox(session, outboundExecutor));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        synchronized (session) {
            PlayerState player = playersBySession.get(session.getId());
            if (player == null) return;
            try {
                ClientMessage decoded = decoder.decode(message.getPayload());
                if (decoded instanceof ClientMessage.CreateDeveloperRoom && !developerLocal(player)) {
                    deliver(error(player, "developer_unavailable", "Developer Rooms require an explicitly enabled local backend and a direct local browser.")); return;
                }
                if (decoded instanceof ClientMessage.CreateDeveloperRoom create) {
                    if (player.getRoomId() != null) { deliver(error(player, "invalid_phase", "Leave before creating a Developer Room.")); return; }
                    Room created = roomManager.createRoom();
                    roomManager.serialized(List.of(created.getRoomId()), () -> {
                        created.enableDeveloper(player.getId());
                        created.developer().roles.put(player.getId(), Role.VILLAGER);
                        handleJoin(player, new ClientMessage.JoinRoom(1, "join_room", created.getRoomId(), create.displayName()));
                        publishDeveloper(created); return null;
                    }); return;
                }
                ClientMessage incoming = decoded instanceof ClientMessage.CreateRoom create
                        ? new ClientMessage.JoinRoom(1, "join_room", roomManager.createRoom().getRoomId(), create.displayName()) : decoded;
                List<String> rooms = new ArrayList<>();
                if (player.getRoomId() != null) rooms.add(player.getRoomId());
                if (incoming instanceof ClientMessage.JoinRoom join) rooms.add(join.roomId());
                if (incoming instanceof ClientMessage.RecoverRoom recover) rooms.add(recover.roomId());
                if (incoming instanceof ClientMessage.TakeDeveloperPlayer take) rooms.add(take.roomId());
                roomManager.serialized(rooms, () -> {
                    if (playersBySession.get(session.getId()) != player || player.getSession() != session) return null;
                    if (player.getRoomId() != null) settleRoom(player.getRoomId());
                    if (incoming instanceof ClientMessage.DeveloperCommand command) handleDeveloper(player, command);
                    else if (incoming instanceof ClientMessage.TakeDeveloperPlayer take) handleDeveloperTake(player, take);
                    else if (incoming instanceof ClientMessage.RecoverRoom recover) handleRecovery(player, recover);
                    else if (incoming instanceof ClientMessage.JoinRoom join) handleJoin(player, join);
                    else if (incoming instanceof ClientMessage.Ping) deliver(new Delivery(player.getId(), new ServerMessage.Pong()));
                    else if (incoming instanceof ClientMessage.LeaveRoom) handleLeave(player);
                    else if (incoming instanceof ClientMessage.SelectAvatar selection) handleAvatarSelection(player, selection);
                    else if (incoming instanceof ClientMessage.SetReady ready) handleReady(player, ready);
                    else if (incoming instanceof ClientMessage.SelectMap selection) handleMapSelection(player, selection);
                    else if (incoming instanceof ClientMessage.SetRoleSetup setup) handleRoleSetup(player, setup);
                    else if (incoming instanceof ClientMessage.StartPractice) handlePracticeStart(player);
                    else if (incoming instanceof ClientMessage.AdvancePractice preview) handlePracticeAdvance(player, preview);
                    else if (incoming instanceof ClientMessage.StartGame) handleStart(player);
                    else if (incoming instanceof ClientMessage.JoinVoice joinVoice) handleVoiceJoin(player, joinVoice);
                    else if (incoming instanceof ClientMessage.LeaveVoice) {
                        voice.revokePlayer(player.getId());
                        dayVoicePeers.remove(player.getId());
                        deliver(new Delivery(player.getId(), new ServerMessage.VoiceState(null)));
                    }
                    else if (incoming instanceof ClientMessage.Move move) handleMove(player, move);
                    else if (incoming instanceof ClientMessage.MeetingVote vote) handleMeetingVote(player, vote);
                    else if (incoming instanceof ClientMessage.NightChoice choice) handleNightChoice(player, choice);
                    else if (incoming instanceof ClientMessage.PreviewRole preview) withGame(player, (room, game) -> {
                        Game.Rejection rejection = game.previewRole(player.getId(), preview.role());
                        if (rejection != null) deliver(error(player, rejection.code(), rejection.message()));
                        else { List<Delivery> deliveries = new ArrayList<>(); addGameState(deliveries, room); deliverAll(deliveries); }
                    });
                    else if (incoming instanceof ClientMessage.OpenTask task) handleTask(player, (game) -> game.openTask(player.getId(), task.round(), task.taskId(), roomManager.currentTimeMillis()));
                    else if (incoming instanceof ClientMessage.TaskStep task) handleTask(player, (game) -> game.taskStep(player.getId(), task.round(), task.taskId(), task.step(), task.value(), roomManager.currentTimeMillis()));
                    else if (incoming instanceof ClientMessage.CloseTask) handleTask(player, (game) -> { game.closeTask(player.getId()); return null; });
                    else if (incoming instanceof ClientMessage.SendChat chat) handleChat(player, chat);
                    return null;
                });
            } catch (InvalidClientMessageException exception) {
                roomManager.serialized(player.getRoomId() == null ? List.of() : List.of(player.getRoomId()), () -> {
                    if (playersBySession.get(session.getId()) == player && player.getSession() == session)
                        deliver(error(player, exception.code(), exception.getMessage()));
                    return null;
                });
            }
        }
    }

    /**
     * Membership expiry and Game phase deadlines advance without client frames, tab focus,
     * Host connectivity, or incoming Player actions.
     */
    @org.springframework.scheduling.annotation.Scheduled(fixedDelay = 200)
    public void settleRooms() {
        for (String code : roomManager.roomIdsSnapshot()) {
            roomManager.serialized(List.of(code), () -> settleRoom(code));
        }
    }

    /**
     * Room lock is held. Membership expiry and Game phase deadlines are applied in the order
     * their deadlines fell due, so recovery, Forfeit and resolution share one consistent order.
     */
    private Room settleRoom(String code) {
        Room room = roomManager.findRoom(code);
        if (room == null) return null;
        while (!room.playerIdsSnapshot().isEmpty()) {
            long now = roomManager.currentTimeMillis();
            PlayerState expiring = room.playerIdsSnapshot().stream().map(playersById::get)
                    .filter(Objects::nonNull)
                    .filter(member -> member.getDisconnectedUntil() != null && now >= member.getDisconnectedUntil())
                    .min(Comparator.comparingLong(PlayerState::getDisconnectedUntil)).orElse(null);
            Game game = room.getGame();
            Long phaseDeadline = game == null ? null : game.phaseDeadline();
            boolean phaseDue = phaseDeadline != null && now >= phaseDeadline;
            if (expiring == null && !phaseDue) break;
            if (expiring != null && (!phaseDue || expiring.getDisconnectedUntil() <= phaseDeadline)) {
                long endedAt = expiring.getDisconnectedUntil();
                deliverAll(endMembership(expiring, code, ServerMessage.DepartureReason.EXPIRED, false));
                expiring.setRoomId(null);
                expiring.setRecoveryToken(null);
                playersById.remove(expiring.getId(), expiring);
                if (room.playerIdsSnapshot().isEmpty()) room.setEmptySince(endedAt);
            } else {
                game.advance();
                List<Delivery> deliveries = new ArrayList<>();
                addGameState(deliveries, room);
                deliverAll(deliveries);
            }
        }
        transferDisconnectedHost(room);
        return roomManager.findRoom(code);
    }

    /**
     * Every Participant receives the authorized field during Day and sleeping Night.
     */
    @org.springframework.scheduling.annotation.Scheduled(fixedRate = 100)
    public void tickFields() {
        for (String code : roomManager.roomIdsSnapshot()) {
            roomManager.serialized(List.of(code), () -> {
                Room room = settleRoom(code);
                Game game = room == null ? null : room.getGame();
                if (game == null || !game.hasField()) return null;
                List<Delivery> deliveries = new ArrayList<>();
                refreshDayVoice(deliveries, room);
                for (String memberId : room.playerIdsSnapshot()) {
                    if (game.participant(memberId) != null) deliveries.add(new Delivery(memberId, fieldStateFor(game, memberId)));
                }
                deliverAll(deliveries);
                return null;
            });
        }
    }

    private static ServerMessage.FieldState fieldStateFor(Game game, String playerId) {
        return new ServerMessage.FieldState(game.round(), game.fieldPlayersFor(playerId),
                game.ownFieldOf(playerId));
    }

    private boolean hostGraceElapsed(Room room) {
        PlayerState host = playersById.get(room.getHostPlayerId());
        return host != null && host.getDisconnectedUntil() != null
                && roomManager.currentTimeMillis() >= host.getDisconnectedUntil() - 105_000;
    }

    private void transferDisconnectedHost(Room room) {
        if (room.developer() != null || room.playerIdsSnapshot().isEmpty() || !hostGraceElapsed(room)) return;
        room.playerIdsSnapshot().stream().map(playersById::get).filter(PlayerState::isConnected)
                .findFirst().ifPresent(successor -> {
                    room.setHostPlayerId(successor.getId());
                    List<Delivery> deliveries = new ArrayList<>();
                    addForPlayers(deliveries, room.playerIdsSnapshot(), stateOf(room));
                    deliverAll(deliveries);
                });
    }

    private void handleRecovery(PlayerState connection, ClientMessage.RecoverRoom message) {
        roomManager.serialized(List.of(message.roomId()), () -> {
            Room room = settleRoom(message.roomId());
            if (room == null) { deliver(error(connection, "room_not_found", "Room not found")); return null; }
            if (room.developer() != null && !developerLocal(connection)) { deliver(error(connection, "developer_unavailable", "Developer Rooms are local-only.")); return null; }
            PlayerState member = room.playerIdsSnapshot().stream().map(playersById::get)
                    .filter(candidate -> message.recoveryToken().equals(candidate.getRecoveryToken())).findFirst().orElse(null);
            if (member == null || member.isSimulated()) { deliver(error(connection, "recovery_expired", "Your place in the Room expired")); return null; }
            if (connection.getRoomId() != null) { deliver(error(connection, "invalid_phase", "Leave before recovering another membership.")); return null; }
            boolean firstReturnAfterGrace = hostGraceElapsed(room);
            voice.revokePlayer(member.getId());
            dayVoicePeers.remove(member.getId());
            WebSocketSession retiredSession = member.getSession();
            if (retiredSession != null) playersBySession.remove(retiredSession.getId(), member);
            ConnectionOutbox outbox = outboxes.remove(connection.getId());
            playersById.remove(connection.getId());
            member.setSession(connection.getSession());
            member.setDisconnectedUntil(null);
            if (firstReturnAfterGrace && room.developer() == null) room.setHostPlayerId(member.getId());
            playersBySession.put(member.getSession().getId(), member);
            outboxes.put(member.getId(), outbox);
            if (retiredSession != null && retiredSession.isOpen()) outboundExecutor.execute(() -> {
                try { retiredSession.close(new CloseStatus(4001, "Connection replaced")); }
                catch (IOException ignored) { /* Retired sessions already have no authority. */ }
            });
            deliver(new Delivery(member.getId(), new ServerMessage.RoomSnapshot(member.getId(), message.roomId(),
                    member.getRecoveryToken(), room.getPhase(), room.getHostPlayerId(),
                    ServerMessage.RoleSetupView.of(room.getRoleSetup()), room.getTownMap().id(), stateOf(room).players())));
            List<Delivery> deliveries = new ArrayList<>();
            addPrivateGameEntry(deliveries, room, member.getId());
            addForPlayers(deliveries, room.playerIdsSnapshot().stream().filter(id -> !id.equals(member.getId())).toList(), stateOf(room));
            deliverAll(deliveries);
            publishDeveloper(room);
            return null;
        });
    }

    private void handleJoin(PlayerState player, ClientMessage.JoinRoom message) {
        String oldRoomId = player.getRoomId();
        List<String> involvedRooms = oldRoomId == null ? List.of(message.roomId()) : List.of(oldRoomId, message.roomId());
        roomManager.serialized(involvedRooms, () -> {
            Room room = settleRoom(message.roomId());
            if (room == null) {
                deliver(error(player, "room_not_found", "Room not found"));
                return null;
            }
            if (room.developer() != null && !player.isSimulated() && !developerLocal(player)) { deliver(error(player, "developer_unavailable", "Developer Rooms are local-only.")); return null; }
            if (!room.containsPlayer(player.getId()) && room.developer() == null && !room.getPhase().equals("lobby")) {
                deliver(error(player, "invalid_phase", "Game already started"));
                return null;
            }
            if (!room.containsPlayer(player.getId()) && room.playerIdsSnapshot().size() >= RoomRules.CAPACITY) {
                deliver(error(player, "room_full", "Room is full"));
                return null;
            }
            List<Delivery> pendingDeliveries = new ArrayList<>();
            if (oldRoomId != null && !oldRoomId.equals(message.roomId())) {
                pendingDeliveries.addAll(endMembership(player, oldRoomId, ServerMessage.DepartureReason.LEFT, false));
            }

            boolean alreadyJoined = room.containsPlayer(player.getId()) && message.roomId().equals(oldRoomId);
            player.setRoomId(message.roomId());
            if (!alreadyJoined) {
                var usedColours = room.playerIdsSnapshot().stream().map(playersById::get)
                        .filter(Objects::nonNull).map(PlayerState::getColour).toList();
                player.setColour(COLOURS.stream().filter(colour -> !usedColours.contains(colour)).findFirst().orElseThrow());
                player.setAvatarPreset(room.getAvatarCollection().randomId());
                player.setDisplayName(message.displayName());
                var occupied = room.playerIdsSnapshot().stream().map(playersById::get)
                        .map(PlayerState::getSeat).toList();
                int seat = java.util.stream.IntStream.range(0, RoomRules.CAPACITY)
                        .filter(index -> !occupied.contains(index)).findFirst().orElseThrow();
                player.setRecoveryToken((UUID.randomUUID().toString() + UUID.randomUUID()).replace("-", ""));
                player.setFacing(RoomRules.seatFacing(seat));
                player.setReady(false);
                player.setSeat(seat);
                player.setX(room.getTownMap().seatX(seat));
                player.setY(room.getTownMap().seatY(seat));
                RoleSetup previousSetup = room.getRoleSetup();
                room.addPlayer(player.getId());
                if (room.developer() != null) {
                    Role role = room.developer().roles.computeIfAbsent(player.getId(), id -> Role.VILLAGER);
                    if (room.getGame() != null) room.getGame().addDeveloper(participantOf(player, role), roomManager.currentTimeMillis());
                }
                List<String> existingPlayers = room.playerIdsSnapshot().stream()
                        .filter(playerId -> !playerId.equals(player.getId())).toList();
                addForPlayers(pendingDeliveries, existingPlayers, new ServerMessage.PlayerJoined(viewOf(player)));
                if (!previousSetup.equals(room.getRoleSetup())) addForPlayers(pendingDeliveries, existingPlayers, stateOf(room));
            }
            List<ServerMessage.PlayerView> snapshotPlayers = room.playerIdsSnapshot().stream()
                    .map(playersById::get)
                    .filter(Objects::nonNull)
                    .map(this::viewOf)
                    .toList();
            pendingDeliveries.add(new Delivery(player.getId(),
                    new ServerMessage.RoomSnapshot(player.getId(), message.roomId(), player.getRecoveryToken(), room.getPhase(), room.getHostPlayerId(),
                            ServerMessage.RoleSetupView.of(room.getRoleSetup()), room.getTownMap().id(), snapshotPlayers)));
            addPrivateGameEntry(pendingDeliveries, room, player.getId());
            if (room.developer() != null && room.getGame() != null) addGameState(pendingDeliveries, room);
            deliverAll(pendingDeliveries);
            publishDeveloper(room);
            return null;
        });
    }

    /** A Room Snapshot is followed by exactly the Game state and history its recipient may read. */
    private void addPrivateGameEntry(Collection<Delivery> deliveries, Room room, String playerId) {
        Game game = room.getGame();
        if (room.developer() != null) deliveries.add(new Delivery(playerId, developerStatus(room)));
        if (game == null || game.participant(playerId) == null) return;
        deliveries.add(new Delivery(playerId, taskStateFor(game, playerId)));
        if (game.isPractice()) deliveries.add(new Delivery(playerId, new ServerMessage.PracticeState(game.practiceTargets())));
        deliveries.add(new Delivery(playerId, gameStateFor(game, playerId)));
        if (game.hasField()) deliveries.add(new Delivery(playerId, fieldStateFor(game, playerId)));
        deliveries.add(new Delivery(playerId, new ServerMessage.ChatHistory(game.historyFor(playerId).stream()
                .map(entry -> new ServerMessage.ChatView(entry.channel(), entry.round(),
                        entry.senderPlayerId(), entry.senderName(), entry.text()))
                .toList())));
    }

    private boolean voiceAllowed(PlayerState player, String roomId, String sessionId, int round, boolean canPublish) {
        return roomManager.serialized(List.of(roomId), () -> {
            Room room = roomManager.findRoom(roomId);
            Game game = room == null ? null : room.getGame();
            return room != null && room.containsPlayer(player.getId()) && player.isConnected()
                    && player.getSession().getId().equals(sessionId) && game != null && game.round() == round
                    && (canPublish ? game.participant(player.getId()).status() == ParticipantStatus.LIVING
                        : game.participant(player.getId()).status() == ParticipantStatus.ELIMINATED)
                    && (game.phase() == GamePhase.DISCUSSION || game.phase() == GamePhase.VOTING || canPublish && game.phase() == GamePhase.DAY)
                    && (game.phaseDeadline() == null || roomManager.currentTimeMillis() < game.phaseDeadline());
        });
    }

    private void handleVoiceJoin(PlayerState player, ClientMessage.JoinVoice message) {
        String roomId = player.getRoomId();
        String sessionId = player.getSession().getId();
        boolean canPublish = roomId != null && voiceAllowed(player, roomId, sessionId, message.round(), true);
        if (roomId == null || !(canPublish || voiceAllowed(player, roomId, sessionId, message.round(), false))) {
            deliver(error(player, "invalid_phase", "Voice is available during Day and Townhall discussion and voting."));
        } else if (!voice.enabled()) {
            deliver(error(player, "voice_unavailable", "Voice service is unavailable. You can continue using text."));
        } else {
            Room room = roomManager.findRoom(roomId);
            boolean day = room.getGame().phase() == GamePhase.DAY;
            String token = day
                    ? voice.issueDayPublication(dayVoiceRoom(roomId, message.round(), player.getId()), player.getId(),
                        () -> dayVoiceAllowed(player, roomId, sessionId, message.round()))
                    : voice.issue("pu-" + roomId + "-" + message.round(), player.getId(), canPublish,
                        () -> voiceAllowed(player, roomId, sessionId, message.round(), canPublish));
            List<Delivery> deliveries = new ArrayList<>();
            deliveries.add(new Delivery(player.getId(), new ServerMessage.VoiceState(token, canPublish)));
            refreshDayVoice(deliveries, room);
            deliverAll(deliveries);
        }
    }

    private static String dayVoiceRoom(String roomId, int round, String speakerId) {
        return "pu-" + roomId + "-" + round + "-day-" + speakerId;
    }

    private boolean dayVoiceAllowed(PlayerState player, String roomId, String sessionId, int round) {
        return roomManager.serialized(List.of(roomId), () -> {
            Room room = roomManager.findRoom(roomId);
            return room != null && room.getGame() != null && room.getGame().phase() == GamePhase.DAY
                    && voiceAllowed(player, roomId, sessionId, round, true);
        });
    }

    private boolean dayListenerAllowed(PlayerState listener, String roomId, String sessionId, int round, String speakerId) {
        return roomManager.serialized(List.of(roomId), () -> {
            Room room = roomManager.findRoom(roomId);
            return dayVoiceAllowed(listener, roomId, sessionId, round) && voice.hasDayPublication(listener.getId())
                    && voice.hasDayPublication(speakerId) && room.getGame().hearingGain(listener.getId(), speakerId) > 0;
        });
    }

    private void refreshDayVoice(Collection<Delivery> deliveries, Room room) {
        for (String id : voice.revokeInvalid(room.getRoomId()))
            deliveries.add(new Delivery(id, new ServerMessage.VoiceState(null)));
        Game game = room.getGame();
        for (String listenerId : room.playerIdsSnapshot()) {
            List<ServerMessage.VoicePeerView> peers = new ArrayList<>();
            PlayerState listener = playersById.get(listenerId);
            if (game != null && game.phase() == GamePhase.DAY && voice.hasDayPublication(listenerId)) {
                String sessionId = listener.getSession().getId();
                int round = game.round();
                for (String speakerId : room.playerIdsSnapshot()) {
                    if (listenerId.equals(speakerId) || !voice.hasDayPublication(speakerId)) continue;
                    double gain = game.hearingGain(listenerId, speakerId);
                    if (gain <= 0) continue;
                    String token = voice.dayListenerToken(dayVoiceRoom(room.getRoomId(), round, speakerId), listenerId, speakerId,
                            () -> dayListenerAllowed(listener, room.getRoomId(), sessionId, round, speakerId));
                    peers.add(new ServerMessage.VoicePeerView(speakerId, token, gain));
                }
            }
            List<ServerMessage.VoicePeerView> previous = dayVoicePeers.getOrDefault(listenerId, List.of());
            if (!peers.equals(previous)) {
                if (peers.isEmpty()) dayVoicePeers.remove(listenerId); else dayVoicePeers.put(listenerId, List.copyOf(peers));
                deliveries.add(new Delivery(listenerId, new ServerMessage.VoicePeers(peers)));
            }
        }
    }

    private void handleLeave(PlayerState player) {
        String roomId = player.getRoomId();
        if (roomId == null) {
            deliver(error(player, "not_in_room", "Join a room before leaving it."));
            return;
        }
        roomManager.serialized(List.of(roomId), () -> {
            player.setRoomId(null);
            deliverAll(endMembership(player, roomId, ServerMessage.DepartureReason.LEFT, true));
            return null;
        });
    }

    private void handleMapSelection(PlayerState player, ClientMessage.SelectMap message) {
        if (player.getRoomId() == null) {
            deliver(error(player, "not_in_room", "Join a Room before choosing the town."));
            return;
        }
        Room room = roomManager.findRoom(player.getRoomId());
        if (!player.getId().equals(room.getHostPlayerId())) {
            deliver(error(player, "not_host", "Only the Host can choose the town."));
        } else if (!room.getPhase().equals("lobby")) {
            deliver(error(player, "invalid_phase", "The town is chosen in the Lobby."));
        } else {
            room.setTownMap(dev.lpa.pu_go.room.TownMap.find(message.mapId()));
            for (String memberId : room.playerIdsSnapshot()) {
                PlayerState member = playersById.get(memberId);
                member.setX(room.getTownMap().seatX(member.getSeat()));
                member.setY(room.getTownMap().seatY(member.getSeat()));
            }
            publishDeveloper(room);
            List<Delivery> deliveries = new ArrayList<>();
            addForPlayers(deliveries, room.playerIdsSnapshot(), stateOf(room));
            deliverAll(deliveries);
        }
    }

    // Called under the same per-Room serialization as Start and recovery.
    private void handleAvatarSelection(PlayerState player, ClientMessage.SelectAvatar message) {
        if (player.getRoomId() == null) {
            deliver(error(player, "not_in_room", "Join a Room before choosing an Avatar Preset."));
            return;
        }
        Room room = roomManager.findRoom(player.getRoomId());
        if (!room.getPhase().equals("lobby")) {
            deliver(error(player, "invalid_phase", "Avatar selection belongs to the Lobby."));
        } else if (!room.getAvatarCollection().contains(message.avatarPreset())) {
            deliver(error(player, "invalid_avatar_preset", "Choose an Avatar Preset from the published collection."));
        } else {
            player.setAvatarPreset(message.avatarPreset());
            List<Delivery> deliveries = new ArrayList<>();
            addForPlayers(deliveries, room.playerIdsSnapshot(), stateOf(room));
            deliverAll(deliveries);
        }
    }

    private void handleReady(PlayerState player, ClientMessage.SetReady message) {
        String roomId = player.getRoomId();
        if (roomId == null) {
            deliver(error(player, "not_in_room", "Join a Room before declaring Ready."));
            return;
        }
        roomManager.serialized(List.of(roomId), () -> {
            Room room = roomManager.findRoom(roomId);
            if (!room.getPhase().equals("lobby")) {
                deliver(error(player, "invalid_phase", "Readiness belongs to the Lobby."));
            } else {
                player.setReady(message.ready());
                List<Delivery> deliveries = new ArrayList<>();
                addForPlayers(deliveries, room.playerIdsSnapshot(), stateOf(room));
                deliverAll(deliveries);
            }
            return null;
        });
    }

    // Called under the same per-Room serialization as Start, so a Game deals the setup its Host last saw.
    private void handleRoleSetup(PlayerState player, ClientMessage.SetRoleSetup message) {
        if (player.getRoomId() == null) {
            deliver(error(player, "not_in_room", "Join a Room before choosing the Roles."));
            return;
        }
        Room room = roomManager.findRoom(player.getRoomId());
        RoleSetup setup = new RoleSetup(message.mafia(), message.doctors(), message.sheriffs());
        String invalid = setup.invalidReason(RoomRules.CAPACITY);
        if (!player.getId().equals(room.getHostPlayerId())) {
            deliver(error(player, "not_host", "Only the Host can choose the Roles."));
        } else if (!room.getPhase().equals("lobby")) {
            deliver(error(player, "invalid_phase", "The Roles are chosen in the Lobby."));
        } else if (invalid != null) {
            deliver(error(player, "invalid_role_setup", invalid));
        } else {
            room.setRoleSetup(setup);
            List<Delivery> deliveries = new ArrayList<>();
            addForPlayers(deliveries, room.playerIdsSnapshot(), stateOf(room));
            deliverAll(deliveries);
        }
    }

    private Participant participantOf(PlayerState player, Role role) {
        return new Participant(player.getId(), player.getDisplayName(), player.getColour(), player.getAvatarPreset(), player.getSeat(), role);
    }

    private ServerMessage.DeveloperStatus developerStatus(Room room) {
        var dev = room.developer();
        return new ServerMessage.DeveloperStatus(1, "developer_status", dev.controllerId,
                room.getGame() != null && room.getGame().isPaused(), dev.settings.nightMovement, dev.settings.taskRange, dev.scenario, dev.revision, List.copyOf(dev.simulated));
    }

    private void addDeveloperInspector(Collection<Delivery> deliveries, Room room) {
        var dev = room.developer();
        if (dev == null || dev.controllerId == null) return;
        PlayerState controller = playersById.get(dev.controllerId);
        if (controller == null || !developerLocal(controller) || !controller.isConnected()) return;
        Game game = room.getGame();
        var players = room.playerIdsSnapshot().stream().map(playersById::get).map(member -> {
            Participant actor = game == null ? null : game.participant(member.getId());
            return new ServerMessage.DeveloperPlayer(member.getId(), member.getDisplayName(), actor == null ? dev.roles.get(member.getId()) : actor.role(),
                    actor == null ? ParticipantStatus.LIVING : actor.status(), member.isSimulated(), actor == null ? member.getX() : actor.x(),
                    actor == null ? member.getY() : actor.y(), actor == null ? null : game.nightChoiceFor(member.getId()),
                    actor != null && game.hasBallot(member.getId()), actor == null ? null : game.acceptedBallot(member.getId()),
                    game == null ? List.of() : game.taskConfigurations().stream().filter(task -> task.playerId().equals(member.getId())).toList());
        }).toList();
        deliveries.add(new Delivery(dev.controllerId, new ServerMessage.DeveloperState(1, "developer_state", dev.settings, players, room.getTownMap().tasks())));
    }

    private void publishDeveloperInspector(Room room) {
        List<Delivery> deliveries = new ArrayList<>(); addDeveloperInspector(deliveries, room); deliverAll(deliveries);
    }

    private void publishDeveloper(Room room) {
        if (room.developer() == null) return;
        List<Delivery> deliveries = new ArrayList<>();
        addForPlayers(deliveries, room.playerIdsSnapshot(), developerStatus(room));
        addDeveloperInspector(deliveries, room); deliverAll(deliveries);
    }

    private void addSimulated(Room room, String name, Role role) {
        if (room.playerIdsSnapshot().size() >= RoomRules.CAPACITY) throw new IllegalArgumentException("Room is full");
        PlayerState simulated = new PlayerState(playerIdSupplier.get(), null);
        simulated.setSimulated(true); playersById.put(simulated.getId(), simulated);
        room.developer().simulated.add(simulated.getId()); room.developer().roles.put(simulated.getId(), role);
        handleJoin(simulated, new ClientMessage.JoinRoom(1, "join_room", room.getRoomId(), name));
    }

    private void startDeveloper(Room room) {
        var dev = room.developer();
        List<Participant> roster = room.playerIdsSnapshot().stream().map(playersById::get)
                .map(member -> participantOf(member, dev.roles.get(member.getId()))).toList();
        room.startGame(Game.developer(roster, roomManager.currentTimeMillis(), room.getTownMap(), dev.settings));
    }

    private void handleDeveloperTake(PlayerState connection, ClientMessage.TakeDeveloperPlayer take) {
        Room room = settleRoom(take.roomId());
        if (!developerLocal(connection) || room == null || room.developer() == null) {
            deliver(error(connection, "developer_unavailable", "Developer Rooms are local-only.")); return;
        }
        PlayerState member = playersById.get(take.playerId());
        if (connection.getRoomId() != null || member == null || !room.containsPlayer(member.getId()) || !member.isSimulated()) {
            deliver(error(connection, "invalid_action", "Choose an idle Simulated Player from this Room.")); return;
        }
        member.setSession(connection.getSession()); member.setSimulated(false);
        playersById.remove(connection.getId());
        playersBySession.put(member.getSession().getId(), member);
        outboxes.put(member.getId(), outboxes.remove(connection.getId()));
        deliver(new Delivery(member.getId(), new ServerMessage.RoomSnapshot(member.getId(), room.getRoomId(), member.getRecoveryToken(),
                room.getPhase(), room.getHostPlayerId(), ServerMessage.RoleSetupView.of(room.getRoleSetup()), room.getTownMap().id(), stateOf(room).players())));
        List<Delivery> deliveries = new ArrayList<>(); addPrivateGameEntry(deliveries, room, member.getId());
        addForPlayers(deliveries, room.playerIdsSnapshot(), stateOf(room)); deliverAll(deliveries); publishDeveloper(room);
    }

    private void handleDeveloper(PlayerState controller, ClientMessage.DeveloperCommand command) {
        Room room = controller.getRoomId() == null ? null : roomManager.findRoom(controller.getRoomId());
        if (!developerLocal(controller) || room == null || room.developer() == null) {
            deliver(error(controller, "developer_unavailable", "Developer commands require a local Developer Room.")); return;
        }
        var dev = room.developer();
        String action = command.action(); var args = command.arguments();
        if (action.equals("claim") && dev.controllerId == null) dev.controllerId = controller.getId();
        if (action.equals("release")) {
            if (controller.getId().equals(dev.controllerId) || !dev.simulated.contains(controller.getId())) { deliver(error(controller, "invalid_action", "Only a non-controller taken Simulated Player can be released.")); return; }
            deliver(new Delivery(controller.getId(), new ServerMessage.RoomLeft(room.getRoomId())));
            voice.revokePlayer(controller.getId()); dayVoicePeers.remove(controller.getId());
            playersBySession.remove(controller.getSession().getId()); outboxes.remove(controller.getId());
            controller.setSimulated(true); controller.setSession(null); controller.setDisconnectedUntil(null);
            controller.setRecoveryToken((UUID.randomUUID().toString() + UUID.randomUUID()).replace("-", ""));
            retireAbandonedDeveloperRoom(room);
            publishDeveloper(room); return;
        }
        if (!controller.getId().equals(dev.controllerId)) { deliver(error(controller, "not_controller", "Only the developer controller can do that.")); return; }
        Game game = room.getGame(); long now = roomManager.currentTimeMillis();
        String playerId = args.has("playerId") ? args.get("playerId").asText() : null;
        if (playerId != null && !room.containsPlayer(playerId)) { deliver(error(controller, "invalid_target", "Choose a current Room Player.")); return; }
        Game.Rejection rejection = null;
        int completedBefore = game == null ? 0 : game.tasksFor(controller.getId(), now).completed();
        try {
            switch (action) {
                case "inspect", "claim" -> { }
                case "add_player" -> addSimulated(room, args.get("displayName").asText().strip(), roleOf(args.get("role").asText()));
                case "remove_player" -> {
                    if (playerId.equals(controller.getId())) throw new IllegalArgumentException("Use Leave Room for the controller.");
                    PlayerState departing = playersById.get(playerId);
                    deliverAll(endMembership(departing, room.getRoomId(), ServerMessage.DepartureReason.LEFT, true));
                    departing.setRoomId(null); departing.setRecoveryToken(null);
                    if (departing.isSimulated()) playersById.remove(playerId);
                }
                case "start" -> {
                    if (game != null) throw new IllegalArgumentException("Return to Lobby before starting.");
                    startDeveloper(room); dev.startingState = room.getGame().copyDeveloper(now);
                }
                case "lobby" -> { room.returnToLobby(); dev.revision++; }
                case "reset" -> {
                    if (dev.startingState == null) throw new IllegalArgumentException("Start a scenario first.");
                    game = dev.startingState.copyDeveloper(now); room.setTownMap(game.townMap()); dev.settings = game.developerSettings();
                    // Preserve current connections and Seats; reset only current memberships.
                    for (Participant actor : game.roster()) if (!room.containsPlayer(actor.playerId())) game.removeDeveloper(actor.playerId());
                    for (String id : room.playerIdsSnapshot()) if (game.participant(id) == null) game.addDeveloper(participantOf(playersById.get(id), dev.roles.get(id)), now);
                    for (Participant actor : game.roster()) dev.roles.put(actor.playerId(), actor.role());
                    room.startGame(game); dev.revision++;
                }
                case "scenario" -> {
                    if (args.get("name").asText().equals("tasks") && !room.getTownMap().tasksEnabled())
                        throw new IllegalArgumentException("Tasks are disabled in this Town Map.");
                    dev.scenario = args.get("name").asText();
                    while (room.playerIdsSnapshot().size() < 4) addSimulated(room, "Simulated " + (room.playerIdsSnapshot().size() + 1), Role.VILLAGER);
                    Role[] roles = {Role.MAFIA, Role.DOCTOR, Role.SHERIFF, Role.VILLAGER}; int index = 0;
                    for (String id : room.playerIdsSnapshot()) dev.roles.put(id, index < 4 ? roles[index++] : Role.VILLAGER);
                    dev.settings = new dev.lpa.pu_go.developer.DeveloperSettings(); startDeveloper(room); game = room.getGame();
                    if (!dev.scenario.equals("four_roles")) game.advanceDeveloper(now);
                    if (dev.scenario.equals("protection")) game.advanceDeveloper(now);
                    if (dev.scenario.equals("voting")) { game.advanceDeveloper(now); game.advanceDeveloper(now); game.advanceDeveloper(now); }
                    if (dev.scenario.equals("tasks")) {
                        for (var task : game.taskConfigurations()) if (!task.fake()) game.configureTask(task.playerId(), task.taskId(), task.location(), task.kind(), task.steps(), 0, task.steps());
                        var task = game.taskConfigurations().stream().filter(value -> !value.fake() && gameRole(room, value.playerId()) != Role.MAFIA).findFirst().orElseThrow();
                        game.configureTask(task.playerId(), task.taskId(), task.location(), task.kind(), task.steps(), 0, task.steps() - 1);
                    }
                    dev.startingState = game.copyDeveloper(now); dev.revision++;
                }
                case "role" -> {
                    Role role = roleOf(args.get("role").asText()); dev.roles.put(playerId, role);
                    if (game != null) game.developerRole(playerId, role);
                }
                case "setting" -> {
                    String name = args.get("name").asText();
                    if (name.startsWith("task") && !room.getTownMap().tasksEnabled())
                        throw new IllegalArgumentException("Tasks are disabled in this Town Map.");
                    dev.settings.set(name, args.get("enabled").asBoolean());
                }
                default -> {
                    if (game == null) throw new IllegalArgumentException("Start a Developer Game first.");
                    switch (action) {
                        case "pause" -> game.pause(args.get("enabled").asBoolean(), now);
                        case "advance" -> game.advanceDeveloper(now);
                        case "teleport" -> rejection = game.developerTeleport(playerId, args.get("x").asDouble(), args.get("y").asDouble());
                        case "status" -> game.developerStatus(playerId, args.get("living").asBoolean());
                        case "task" -> rejection = game.configureTask(playerId, args.get("taskId").asText(), args.get("location").asInt(), args.get("kind").asText(), args.get("steps").asInt(), args.get("durationMs").asLong(), args.get("step").asInt());
                        case "night_choice", "vote", "open_task", "task_step" -> {
                            if (!playersById.get(playerId).isSimulated()) throw new IllegalArgumentException("Release that Player to simulation before acting for them.");
                            int round = args.get("round").asInt();
                            if (action.equals("night_choice")) rejection = game.submitNightChoice(playerId, round, args.get("targetPlayerId").isNull() ? null : args.get("targetPlayerId").asText());
                            if (action.equals("vote")) rejection = game.submitBallot(playerId, round, args.get("targetPlayerId").isNull() ? null : args.get("targetPlayerId").asText());
                            if (action.equals("open_task")) rejection = game.openTask(playerId, round, args.get("taskId").asText(), now);
                            if (action.equals("task_step")) rejection = game.taskStep(playerId, round, args.get("taskId").asText(), args.get("step").asInt(), args.get("value").asInt(), now);
                        }
                        default -> throw new IllegalArgumentException("Unknown action");
                    }
                }
            }
        } catch (IllegalArgumentException exception) { deliver(error(controller, "invalid_action", exception.getMessage())); return; }
        if (rejection != null) { deliver(error(controller, rejection.code(), rejection.message())); return; }
        List<Delivery> deliveries = new ArrayList<>();
        if (java.util.Set.of("night_choice", "vote", "open_task", "task_step").contains(action)) {
            Game current = room.getGame();
            if (current.isFinished()) addGameState(deliveries, room);
            else if (action.equals("task_step") || action.equals("open_task")) {
                boolean changed = completedBefore != current.tasksFor(controller.getId(), now).completed();
                for (String recipient : changed ? room.playerIdsSnapshot() : List.of(playerId)) deliveries.add(new Delivery(recipient, taskStateFor(current, recipient)));
            } else addGameStateFor(deliveries, room, List.of(playerId));
            addDeveloperInspector(deliveries, room); deliverAll(deliveries);
        } else {
            addForPlayers(deliveries, room.playerIdsSnapshot(), stateOf(room)); addGameState(deliveries, room); deliverAll(deliveries); publishDeveloper(room);
        }
    }
    private Role gameRole(Room room, String id) { return room.getGame().participant(id).role(); }
    private Role roleOf(String wire) { return java.util.Arrays.stream(Role.values()).filter(role -> role.wireValue().equals(wire)).findFirst().orElseThrow(); }

    private void handlePracticeStart(PlayerState player) {
        Room existing = player.getRoomId() == null ? null : roomManager.findRoom(player.getRoomId());
        if (existing != null && existing.developer() != null) { deliver(error(player, "invalid_action", "Solo Practice uses an ordinary Room.")); return; }
        if (player.getRoomId() == null) {
            deliver(error(player, "not_in_room", "Join a Room before practicing."));
            return;
        }
        Room room = roomManager.findRoom(player.getRoomId());
        if (!player.getId().equals(room.getHostPlayerId())) {
            deliver(error(player, "not_host", "Only the Host can start Solo Practice."));
        } else if (!room.getPhase().equals("lobby")) {
            deliver(error(player, "invalid_phase", "Solo Practice starts in the Lobby."));
        } else if (room.playerIdsSnapshot().size() != 1) {
            deliver(error(player, "practice_blocked", "Solo Practice needs the Host alone in the Room."));
        } else {
            Participant host = new Participant(player.getId(), player.getDisplayName(), player.getColour(),
                    player.getAvatarPreset(), player.getSeat(), Role.VILLAGER);
            room.startGame(Game.soloPractice(host, roomManager.currentTimeMillis(), room.getTownMap()));
            List<Delivery> deliveries = new ArrayList<>();
            addForPlayers(deliveries, room.playerIdsSnapshot(), stateOf(room));
            addGameState(deliveries, room);
            deliverAll(deliveries);
        }
    }

    private void handlePracticeAdvance(PlayerState player, ClientMessage.AdvancePractice message) {
        withGame(player, (room, game) -> {
            if (!game.isPractice()) {
                deliver(error(player, "invalid_action", "Next phase is available only in Solo Practice."));
            } else if (!player.getId().equals(room.getHostPlayerId())) {
                deliver(error(player, "not_host", "Only the Host can advance Solo Practice."));
            } else if (game.round() != message.round() || !game.phase().wireValue().equals(message.phase())) {
                deliver(error(player, "invalid_phase", "That practice phase has already ended."));
            } else {
                game.advancePractice(roomManager.currentTimeMillis());
                List<Delivery> deliveries = new ArrayList<>();
                addGameState(deliveries, room);
                deliverAll(deliveries);
            }
        });
    }

    private void handleStart(PlayerState player) {
        Room existing = player.getRoomId() == null ? null : roomManager.findRoom(player.getRoomId());
        if (existing != null && existing.developer() != null) { deliver(error(player, "invalid_action", "Use Start setup in the developer panel.")); return; }
        String roomId = player.getRoomId();
        if (roomId == null) {
            deliver(error(player, "not_in_room", "Join a Room before starting."));
            return;
        }
        roomManager.serialized(List.of(roomId), () -> {
            Room room = roomManager.findRoom(roomId);
            if (!player.getId().equals(room.getHostPlayerId())) {
                deliver(error(player, "not_host", "Only the Host can start the game."));
                return null;
            }
            if (!room.getPhase().equals("lobby")) {
                deliver(error(player, "invalid_phase", "The game has already started."));
                return null;
            }
            List<PlayerState> members = room.playerIdsSnapshot().stream().map(playersById::get)
                    .filter(Objects::nonNull).sorted(Comparator.comparingInt(PlayerState::getSeat)).toList();
            String blocked = startBlockedReason(members, room.getRoleSetup());
            if (blocked != null) {
                deliver(error(player, "start_blocked", blocked));
                return null;
            }
            List<Role> roles = roleAssignment.apply(room.getRoleSetup().deal(members.size()));
            if (roles.size() != members.size()) throw new IllegalStateException("Role assignment must cover every Player");
            List<Participant> roster = new ArrayList<>();
            for (int index = 0; index < members.size(); index++) {
                PlayerState member = members.get(index);
                roster.add(new Participant(member.getId(), member.getDisplayName(), member.getColour(),
                        member.getAvatarPreset(), member.getSeat(), roles.get(index)));
            }
            room.startGame(new Game(roster, roomManager.currentTimeMillis(), room.getTownMap()));
            List<Delivery> deliveries = new ArrayList<>();
            addForPlayers(deliveries, room.playerIdsSnapshot(), stateOf(room));
            addGameState(deliveries, room);
            deliverAll(deliveries);
            return null;
        });
    }

    private static String startBlockedReason(List<PlayerState> members, RoleSetup setup) {
        if (members.size() < RoomRules.MIN_PLAYERS)
            return "At least " + RoomRules.MIN_PLAYERS + " Players must be in the Room to start.";
        if (members.size() < setup.minimumPlayers())
            return "This deal of " + plural(setup.mafia(), "Mafia", "Mafia") + ", " + plural(setup.doctors(), "Doctor", "Doctors")
                    + " and " + plural(setup.sheriffs(), "Sheriff", "Sheriffs") + " needs at least " + setup.minimumPlayers()
                    + " Players, so one is left a Villager.";
        if (members.stream().anyMatch(member -> !member.isConnected()))
            return "Every Player must be connected to start.";
        if (members.stream().anyMatch(member -> !member.isReady()))
            return "Every Player must be Ready to start.";
        return null;
    }

    private static String plural(int count, String one, String many) {
        return count + " " + (count == 1 ? one : many);
    }

    /** Movement is answered only through the next field state, never with an error per step. */
    private void handleMove(PlayerState player, ClientMessage.Move message) {
        withGame(player, (room, game) -> {
            Participant actor = game.participant(player.getId());
            String before = game.areaAt(actor.x(), actor.y());
            double x = actor.x(), y = actor.y();
            long now = roomManager.currentTimeMillis();
            var beforeTasks = game.tasksFor(player.getId(), now);
            if (!game.move(player.getId(), message.x(), message.y(), message.facing(), now)) return;
            var afterTasks = game.tasksFor(player.getId(), now);
            if (!java.util.Objects.equals(beforeTasks.activeTaskId(), afterTasks.activeTaskId()))
                deliverAll(List.of(new Delivery(player.getId(), new ServerMessage.TaskState(afterTasks))));
            String area = game.areaAt(actor.x(), actor.y());
            double walked = walkedSinceFootstep.merge(player.getId(), Math.hypot(x - actor.x(), y - actor.y()), Double::sum);
            String kind = !before.equals(area) ? area.equals("Outdoors") ? "exit" : "enter"
                    : walked >= 24 && now - lastFootsteps.getOrDefault(player.getId(), 0L) >= 400 ? "footstep" : null;
            if (kind == null) return;
            lastFootsteps.put(player.getId(), now);
            walkedSinceFootstep.put(player.getId(), 0.0);
            long eventId = soundIds.incrementAndGet();
            List<Delivery> deliveries = new ArrayList<>();
            for (String listenerId : room.playerIdsSnapshot()) {
                double gain = game.movementSoundGain(listenerId, player.getId());
                if (gain > 0) deliveries.add(new Delivery(listenerId, new ServerMessage.SoundEvent(eventId, game.round(), kind, player.getId(), gain)));
            }
            deliverAll(deliveries);
        });
    }

    private void handleNightChoice(PlayerState player, ClientMessage.NightChoice message) {
        withGame(player, (room, game) -> answerPrivateSubmission(player, room,
                game.submitNightChoice(player.getId(), message.round(), message.targetPlayerId())));
    }

    private void handleMeetingVote(PlayerState player, ClientMessage.MeetingVote message) {
        withGame(player, (room, game) -> answerPrivateSubmission(player, room,
                game.submitBallot(player.getId(), message.round(), message.targetPlayerId())));
    }

    private void answerPrivateSubmission(PlayerState player, Room room, Game.Rejection rejection) {
        if (rejection != null) deliver(error(player, rejection.code(), rejection.message()));
        else {
            List<Delivery> deliveries = new ArrayList<>();
            addGameStateFor(deliveries, room, List.of(player.getId()));
            publishDeveloperInspector(room);
            deliverAll(deliveries);
        }
    }

    private ServerMessage.TaskState taskStateFor(Game game, String playerId) {
        return new ServerMessage.TaskState(game.tasksFor(playerId, roomManager.currentTimeMillis()));
    }

    private void handleTask(PlayerState player, java.util.function.Function<Game, Game.Rejection> action) {
        withGame(player, (room, game) -> {
            if (!room.getTownMap().tasksEnabled()) {
                deliver(error(player, "invalid_task", "Tasks are disabled in this Town Map."));
                return;
            }
            int completed = game.tasksFor(player.getId(), roomManager.currentTimeMillis()).completed();
            Game.Rejection rejection = action.apply(game);
            if (rejection != null) { deliver(error(player, rejection.code(), rejection.message())); return; }
            List<Delivery> deliveries = new ArrayList<>();
            publishDeveloperInspector(room);
            boolean changed = completed != game.tasksFor(player.getId(), roomManager.currentTimeMillis()).completed();
            if (game.isFinished()) addGameState(deliveries, room);
            else for (String recipient : changed ? room.playerIdsSnapshot() : List.of(player.getId()))
                deliveries.add(new Delivery(recipient, taskStateFor(game, recipient)));
            deliverAll(deliveries);
        });
    }

    private void handleChat(PlayerState player, ClientMessage.SendChat message) {
        withGame(player, (room, game) -> {
            Game.Rejection rejection = game.submitChat(player.getId(), message.channel(), message.text());
            if (rejection != null) {
                deliver(error(player, rejection.code(), rejection.message()));
                return;
            }
            ChatEntry entry = game.lastChatEntry();
            List<Delivery> deliveries = new ArrayList<>();
            for (String memberId : room.playerIdsSnapshot()) {
                if (game.participant(memberId) != null && entry.isReadableBy(memberId)) {
                    deliveries.add(new Delivery(memberId, new ServerMessage.ChatMessage(entry.channel(),
                            entry.round(), entry.senderPlayerId(), entry.senderName(), entry.text())));
                }
            }
            deliverAll(deliveries);
        });
    }

    private void withGame(PlayerState player, BiConsumer<Room, Game> action) {
        String roomId = player.getRoomId();
        if (roomId == null) {
            deliver(error(player, "not_in_room", "Join a Room first."));
            return;
        }
        roomManager.serialized(List.of(roomId), () -> {
            Room room = roomManager.findRoom(roomId);
            Game game = room == null ? null : room.getGame();
            if (game == null) deliver(error(player, "invalid_phase", "The Game has not started."));
            else if (game.participant(player.getId()) == null)
                deliver(error(player, "invalid_action", "You are not a participant in this Game."));
            else action.accept(room, game);
            return null;
        });
    }



    private ServerMessage.RoomState stateOf(Room room) {
        return new ServerMessage.RoomState(room.getPhase(), room.getHostPlayerId(), ServerMessage.RoleSetupView.of(room.getRoleSetup()), room.getTownMap().id(),
                room.playerIdsSnapshot().stream().map(playersById::get).map(this::viewOf).toList());
    }

    private void addGameState(Collection<Delivery> deliveries, Room room) {
        refreshDayVoice(deliveries, room);
        if (room.developer() != null) {
            addForPlayers(deliveries, room.playerIdsSnapshot(), developerStatus(room));
            addDeveloperInspector(deliveries, room);
        }
        Game game = room.getGame();
        if (game != null) for (String playerId : room.playerIdsSnapshot())
            if (game.participant(playerId) != null) deliveries.add(new Delivery(playerId, taskStateFor(game, playerId)));
        addGameStateFor(deliveries, room, room.playerIdsSnapshot());
    }

    private void addGameStateFor(Collection<Delivery> deliveries, Room room, Collection<String> playerIds) {
        Game game = room.getGame();
        if (game == null) return;
        for (String playerId : playerIds) {
            if (game.participant(playerId) != null) {
                if (game.isPractice()) deliveries.add(new Delivery(playerId, new ServerMessage.PracticeState(game.practiceTargets())));
        deliveries.add(new Delivery(playerId, gameStateFor(game, playerId)));
                if (game.hasField()) deliveries.add(new Delivery(playerId, fieldStateFor(game, playerId)));
            }
        }
    }

    /** Builds one recipient's complete authorized view; nothing here is merely hidden in the client. */
    private ServerMessage.GameState gameStateFor(Game game, String playerId) {
        Participant self = game.participant(playerId);
        List<ServerMessage.RosterView> roster = game.roster().stream()
                .map(member -> new ServerMessage.RosterView(member.playerId(), member.displayName(), member.colour(),
                        member.avatarPreset(), member.seat(), member.status()))
                .toList();
        Game.Outcome outcome = game.outcome();
        List<Game.Ballot> revealed = game.revealedBallots();
        List<ServerMessage.RoleView> roles = game.isFinished()
                ? game.roster().stream().map(member -> new ServerMessage.RoleView(member.playerId(), member.role())).toList()
                : null;
        return new ServerMessage.GameState(game.isPractice() ? "practice" : "competitive", game.phase().wireValue(), game.round(),
                game.remainingMillis(roomManager.currentTimeMillis()), roster,
                outcome == null ? null : new ServerMessage.OutcomeView(outcome.kind(), outcome.callerPlayerId(),
                        outcome.bodyPlayerId(), outcome.deaths(), outcome.eliminatedPlayerId(), outcome.eliminatedRole()),
                revealed == null ? null : revealed.stream().map(GameWebSocketHandler::ballotView).toList(),
                game.winner(), roles, selfViewOf(game, self));
    }

    private static ServerMessage.BallotView ballotView(Game.Ballot ballot) {
        return new ServerMessage.BallotView(ballot.voterPlayerId(), ballot.targetPlayerId());
    }

    private static ServerMessage.SelfView selfViewOf(Game game, Participant self) {
        boolean mafia = self.role() == Role.MAFIA;
        boolean sheriff = self.role() == Role.SHERIFF;
        return new ServerMessage.SelfView(self.role(), self.role().faction(), self.status(), self.killedByMafia(),
                mafia ? game.mafiaTeam() : null,
                sheriff ? self.investigations().stream().map(result -> new ServerMessage.InvestigationView(
                        result.round(), result.targetPlayerId(), result.mafia())).toList() : null,
                game.hasBallot(self.playerId()), game.acceptedBallot(self.playerId()),
                game.nightChoiceFor(self.playerId()));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        synchronized (session) {
            PlayerState player = playersBySession.get(session.getId());
            if (player == null) return;
            String roomId = player.getRoomId();
            roomManager.serialized(roomId == null ? List.of() : List.of(roomId), () -> {
                if (player.getSession() != session || !playersBySession.remove(session.getId(), player)) return null;
                outboxes.remove(player.getId());
                if (roomId == null) {
                    lastFootsteps.remove(player.getId());
                    walkedSinceFootstep.remove(player.getId());
                    playersById.remove(player.getId());
                    return null;
                }
                voice.revokePlayer(player.getId());
                dayVoicePeers.remove(player.getId());
                player.setDisconnectedUntil(roomManager.currentTimeMillis() + 120_000);
                Room room = roomManager.findRoom(roomId);
                List<Delivery> deliveries = new ArrayList<>();
                addForPlayers(deliveries, room.playerIdsSnapshot(), stateOf(room));
                deliverAll(deliveries);
                return null;
            });
        }
    }

    private void retireAbandonedDeveloperRoom(Room room) {
        if (room.developer() == null || room.playerIdsSnapshot().stream().map(playersById::get).anyMatch(member -> !member.isSimulated())) return;
        for (String id : room.playerIdsSnapshot()) { room.removePlayer(id); playersById.remove(id); }
        roomManager.removeDeveloperRoom(room);
    }

    private List<Delivery> endMembership(PlayerState player, String roomId,
                                         ServerMessage.DepartureReason reason, boolean acknowledgeLeave) {
        voice.revokePlayer(player.getId());
        dayVoicePeers.remove(player.getId());
        Room room = roomManager.findRoom(roomId);
        boolean hostDeparted = player.getId().equals(room.getHostPlayerId());
        Game game = room.getGame();
        // Leave and expiry end participation; the Game Roster entry and its Seat remain.
        if (game != null) { if (room.developer() == null) game.forfeit(player.getId()); else game.removeDeveloper(player.getId()); }
        lastFootsteps.remove(player.getId());
        walkedSinceFootstep.remove(player.getId());
        RoleSetup previousSetup = room.getRoleSetup();
        room.removePlayer(player.getId());
        if (room.developer() != null) {
            room.developer().roles.remove(player.getId()); room.developer().simulated.remove(player.getId());
            if (player.getId().equals(room.developer().controllerId)) room.developer().controllerId = null;
            retireAbandonedDeveloperRoom(room);
        }
        if (hostDeparted) room.playerIdsSnapshot().stream().map(playersById::get)
                .filter(member -> member.isConnected() && !member.isSimulated()).findFirst()
                .ifPresent(successor -> room.setHostPlayerId(successor.getId()));
        roomManager.membershipEnded(room);
        List<Delivery> pendingDeliveries = new ArrayList<>();
        addForPlayers(pendingDeliveries, room.playerIdsSnapshot(),
                new ServerMessage.PlayerLeft(player.getId(), reason));
        if ((hostDeparted || !previousSetup.equals(room.getRoleSetup())) && !room.playerIdsSnapshot().isEmpty()) {
            addForPlayers(pendingDeliveries, room.playerIdsSnapshot(), stateOf(room));
        }
        if (game != null) addGameState(pendingDeliveries, room);
        if (acknowledgeLeave) {
            pendingDeliveries.add(new Delivery(player.getId(), new ServerMessage.RoomLeft(roomId)));
        }
        publishDeveloper(room);
        return pendingDeliveries;
    }

    private ServerMessage.PlayerView viewOf(PlayerState player) {
        return new ServerMessage.PlayerView(
                player.getId(), player.getDisplayName(), player.getColour(), player.getAvatarPreset(),
                player.getSeat(), player.isReady(), player.isConnected(), player.getX(), player.getY(), player.getFacing()
        );
    }

    private static Delivery error(PlayerState player, String code, String message) {
        return new Delivery(player.getId(), new ServerMessage.ErrorMessage(code, message));
    }

    private static void addForPlayers(Collection<Delivery> deliveries, Collection<String> playerIds,
                                      ServerMessage message) {
        playerIds.forEach(playerId -> deliveries.add(new Delivery(playerId, message)));
    }

    private void deliverAll(Collection<Delivery> deliveries) {
        deliveries.forEach(this::deliver);
    }

    private void deliver(Delivery delivery) {
        ConnectionOutbox outbox = outboxes.get(delivery.playerId());
        if (outbox == null) return;
        TextMessage textMessage = new TextMessage(objectMapper.writeValueAsString(delivery.message()));
        if (!outbox.enqueue(textMessage)) {
            PlayerState player = playersById.get(delivery.playerId());
            if (player != null && player.getSession().isOpen()) {
                WebSocketSession failedSession = player.getSession();
                outboundExecutor.execute(() -> {
                    try { failedSession.close(CloseStatus.SESSION_NOT_RELIABLE); }
                    catch (IOException ignored) { /* Lifecycle cleanup follows closure. */ }
                });
            }
        }
    }

    private record Delivery(String playerId, ServerMessage message) {}
}
