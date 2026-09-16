package dev.lpa.pu_go.websocket.handler;

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
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

@Component
public class GameWebSocketHandler extends TextWebSocketHandler {
    private static final List<String> COLOURS = List.of("#4F8CFF", "#FF8066", "#FFD166", "#65D6A4", "#C792EA", "#56DDE0", "#F48FB1", "#D6D3C4", "#F29F38", "#A5CF45");
    private final RoomManager roomManager;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ClientMessageDecoder decoder = new ClientMessageDecoder(objectMapper);
    private final Map<String, PlayerState> playersBySession = new ConcurrentHashMap<>();
    private final Map<String, PlayerState> playersById = new ConcurrentHashMap<>();
    private final Map<String, ConnectionOutbox> outboxes = new ConcurrentHashMap<>();
    private final Executor outboundExecutor;
    private final Supplier<String> playerIdSupplier;
    private final LongSupplier nanoTime;

    @Autowired
    public GameWebSocketHandler(RoomManager roomManager) {
        this(roomManager, Executors.newCachedThreadPool(), () -> UUID.randomUUID().toString(), System::nanoTime);
    }

    GameWebSocketHandler(RoomManager roomManager, Executor outboundExecutor,
                         Supplier<String> playerIdSupplier, LongSupplier nanoTime) {
        this.roomManager = roomManager;
        this.outboundExecutor = outboundExecutor;
        this.playerIdSupplier = playerIdSupplier;
        this.nanoTime = nanoTime;
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
                ClientMessage incoming = decoded instanceof ClientMessage.CreateRoom create
                        ? new ClientMessage.JoinRoom(1, "join_room", roomManager.createRoom().getRoomId(), create.displayName()) : decoded;
                List<String> rooms = new ArrayList<>();
                if (player.getRoomId() != null) rooms.add(player.getRoomId());
                if (incoming instanceof ClientMessage.JoinRoom join) rooms.add(join.roomId());
                if (incoming instanceof ClientMessage.RecoverRoom recover) rooms.add(recover.roomId());
                roomManager.serialized(rooms, () -> {
                    if (playersBySession.get(session.getId()) != player || player.getSession() != session) return null;
                    if (player.getRoomId() != null) expireMembershipsAndFindRoom(player.getRoomId());
                    if (incoming instanceof ClientMessage.RecoverRoom recover) handleRecovery(player, recover);
                    else if (incoming instanceof ClientMessage.JoinRoom join) handleJoin(player, join);
                    else if (incoming instanceof ClientMessage.Ping) deliver(new Delivery(player.getId(), new ServerMessage.Pong()));
                    else if (incoming instanceof ClientMessage.LeaveRoom) handleLeave(player);
                    else if (incoming instanceof ClientMessage.SelectAvatar selection) handleAvatarSelection(player, selection);
                    else if (incoming instanceof ClientMessage.SetReady ready) handleReady(player, ready);
                    else if (incoming instanceof ClientMessage.StartGame) handleStart(player);
                    else if (incoming instanceof ClientMessage.MovePlayer move) handleMove(player, move);
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

    @org.springframework.scheduling.annotation.Scheduled(fixedDelay = 1_000)
    public void expireMemberships() {
        for (String code : roomManager.roomIdsSnapshot()) {
            roomManager.serialized(List.of(code), () -> expireMembershipsAndFindRoom(code));
        }
    }

    /** Room lock is held; expiry and recovery share the same ordering boundary. */
    private Room expireMembershipsAndFindRoom(String code) {
        Room room = roomManager.findRoom(code);
        if (room == null) return null;
        var expired = room.playerIdsSnapshot().stream().map(playersById::get)
                .filter(member -> member.getDisconnectedUntil() != null
                        && roomManager.currentTimeMillis() >= member.getDisconnectedUntil())
                .sorted(java.util.Comparator.comparingLong(PlayerState::getDisconnectedUntil)).toList();
        for (PlayerState member : expired) {
            long endedAt = member.getDisconnectedUntil();
            deliverAll(endMembership(member, code, ServerMessage.DepartureReason.EXPIRED, false));
            member.setRoomId(null);
            member.setRecoveryToken(null);
            playersById.remove(member.getId(), member);
            if (room.playerIdsSnapshot().isEmpty()) room.setEmptySince(endedAt);
        }
        transferDisconnectedHost(room);
        return roomManager.findRoom(code);
    }

    private boolean hostGraceElapsed(Room room) {
        PlayerState host = playersById.get(room.getHostPlayerId());
        return host != null && host.getDisconnectedUntil() != null
                && roomManager.currentTimeMillis() >= host.getDisconnectedUntil() - 105_000;
    }

    private void transferDisconnectedHost(Room room) {
        if (room.playerIdsSnapshot().isEmpty() || !hostGraceElapsed(room)) return;
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
            Room room = expireMembershipsAndFindRoom(message.roomId());
            if (room == null) { deliver(error(connection, "room_not_found", "Room not found")); return null; }
            PlayerState member = room.playerIdsSnapshot().stream().map(playersById::get)
                    .filter(candidate -> message.recoveryToken().equals(candidate.getRecoveryToken())).findFirst().orElse(null);
            if (member == null) { deliver(error(connection, "recovery_expired", "Your place in the Room expired")); return null; }
            if (connection.getRoomId() != null) { deliver(error(connection, "invalid_phase", "Leave before recovering another membership.")); return null; }
            boolean firstReturnAfterGrace = hostGraceElapsed(room);
            WebSocketSession retiredSession = member.getSession();
            playersBySession.remove(retiredSession.getId(), member);
            ConnectionOutbox outbox = outboxes.remove(connection.getId());
            playersById.remove(connection.getId());
            member.setSession(connection.getSession());
            member.setDisconnectedUntil(null);
            if (firstReturnAfterGrace) room.setHostPlayerId(member.getId());
            member.setLastAcceptedMovementNanos(nanoTime.getAsLong());
            playersBySession.put(member.getSession().getId(), member);
            outboxes.put(member.getId(), outbox);
            if (retiredSession.isOpen()) outboundExecutor.execute(() -> {
                try { retiredSession.close(new CloseStatus(4001, "Connection replaced")); }
                catch (IOException ignored) { /* Retired sessions already have no authority. */ }
            });
            deliver(new Delivery(member.getId(), new ServerMessage.RoomSnapshot(member.getId(), message.roomId(),
                    member.getRecoveryToken(), room.getPhase(), room.getHostPlayerId(), stateOf(room).players())));
            List<Delivery> deliveries = new ArrayList<>();
            addForPlayers(deliveries, room.playerIdsSnapshot().stream().filter(id -> !id.equals(member.getId())).toList(), stateOf(room));
            deliverAll(deliveries);
            return null;
        });
    }

    private void handleJoin(PlayerState player, ClientMessage.JoinRoom message) {
        String oldRoomId = player.getRoomId();
        List<String> involvedRooms = oldRoomId == null ? List.of(message.roomId()) : List.of(oldRoomId, message.roomId());
        roomManager.serialized(involvedRooms, () -> {
            Room room = expireMembershipsAndFindRoom(message.roomId());
            if (room == null) {
                deliver(error(player, "room_not_found", "Room not found"));
                return null;
            }
            if (!room.containsPlayer(player.getId()) && !room.getPhase().equals("lobby")) {
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
                        .filter(java.util.Objects::nonNull).map(PlayerState::getColour).toList();
                player.setColour(COLOURS.stream().filter(colour -> !usedColours.contains(colour)).findFirst().orElseThrow());
                player.setAvatarPreset(room.getAvatarCollection().randomId());
                player.setDisplayName(message.displayName());
                Integer seat = null;
                if (room.getPhase().equals("lobby")) {
                    var occupied = room.playerIdsSnapshot().stream().map(playersById::get)
                            .map(PlayerState::getSeat).toList();
                    seat = java.util.stream.IntStream.range(0, RoomRules.CAPACITY)
                            .filter(index -> !occupied.contains(index)).findFirst().orElseThrow();
                }
                player.setRecoveryToken((UUID.randomUUID().toString() + UUID.randomUUID()).replace("-", ""));
                player.setMovementSequence(0);
                player.setMovementEpoch(0);
                player.setFacing(seat == null || seat == 0 ? "down" : seat < 5 ? "left" : seat == 5 ? "up" : "right");
                player.setReady(false);
                player.setSeat(seat);
                player.setX(seat == null ? RoomRules.SPAWN_X : RoomRules.seatX(seat));
                player.setY(seat == null ? RoomRules.SPAWN_Y : RoomRules.seatY(seat));
                player.setLastAcceptedMovementNanos(nanoTime.getAsLong());
                room.addPlayer(player.getId());
                List<String> existingPlayers = room.playerIdsSnapshot().stream()
                        .filter(playerId -> !playerId.equals(player.getId())).toList();
                addForPlayers(pendingDeliveries, existingPlayers, new ServerMessage.PlayerJoined(viewOf(player)));
            }
            List<ServerMessage.PlayerView> snapshotPlayers = room.playerIdsSnapshot().stream()
                    .map(playersById::get)
                    .filter(java.util.Objects::nonNull)
                    .map(this::viewOf)
                    .toList();
            pendingDeliveries.add(new Delivery(player.getId(),
                    new ServerMessage.RoomSnapshot(player.getId(), message.roomId(), player.getRecoveryToken(), room.getPhase(), room.getHostPlayerId(), snapshotPlayers)));
            deliverAll(pendingDeliveries);
            return null;
        });
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

    private void handleStart(PlayerState player) {
        String roomId = player.getRoomId();
        if (roomId == null) {
            deliver(error(player, "not_in_room", "Join a Room before starting."));
            return;
        }
        roomManager.serialized(List.of(roomId), () -> {
            Room room = roomManager.findRoom(roomId);
            if (!player.getId().equals(room.getHostPlayerId())) {
                deliver(error(player, "not_host", "Only the Host can start the game."));
            } else if (!room.getPhase().equals("lobby")) {
                deliver(error(player, "invalid_phase", "The game has already started."));
            } else {
                room.startGame();
                List<String> starting = room.playerIdsSnapshot();
                for (int index = 0; index < starting.size(); index++) {
                    PlayerState member = playersById.get(starting.get(index));
                    member.setSeat(null);
                    member.setFacing("down");
                    member.setX(RoomRules.spawnX(index));
                    member.setY(RoomRules.spawnY(index));
                    member.setLastAcceptedMovementNanos(nanoTime.getAsLong());
                }
                List<Delivery> deliveries = new ArrayList<>();
                addForPlayers(deliveries, room.playerIdsSnapshot(), stateOf(room));
                deliverAll(deliveries);
            }
            return null;
        });
    }

    private ServerMessage.RoomState stateOf(Room room) {
        return new ServerMessage.RoomState(room.getPhase(), room.getHostPlayerId(),
                room.playerIdsSnapshot().stream().map(playersById::get).map(this::viewOf).toList());
    }

    private void handleMove(PlayerState player, ClientMessage.MovePlayer message) {
        String roomId = player.getRoomId();
        if (roomId == null) {
            deliver(error(player, "not_in_room", "Join a room before moving."));
            return;
        }
        roomManager.serialized(List.of(roomId), () -> {
            if (message.epoch() != player.getMovementEpoch() || message.sequence() <= player.getMovementSequence()) {
                correctMovement(player);
                return null;
            }
            player.setMovementSequence(message.sequence());
            long now = nanoTime.getAsLong();
            if (!roomManager.findRoom(roomId).getPhase().equals("playing") ||
                    !RoomRules.acceptsMovement(player, message.x(), message.y(), now)) {
                player.setMovementEpoch(player.getMovementEpoch() + 1);
                correctMovement(player);
                return null;
            }
            player.setFacing(message.facing());
            player.setX(message.x());
            player.setY(message.y());
            player.setLastAcceptedMovementNanos(now);
            Room room = roomManager.findRoom(roomId);
            List<Delivery> pendingDeliveries = new ArrayList<>();
            addForPlayers(pendingDeliveries, room.playerIdsSnapshot(),
                    new ServerMessage.PlayerMoved(player.getId(), message.x(), message.y(), player.getFacing(), player.getMovementSequence(), player.getMovementEpoch()));
            deliverAll(pendingDeliveries);
            return null;
        });
    }

    private void correctMovement(PlayerState player) {
        deliver(new Delivery(player.getId(), new ServerMessage.MovementCorrection(player.getId(),
                player.getX(), player.getY(), player.getFacing(), player.getMovementSequence(), player.getMovementEpoch())));
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
                    playersById.remove(player.getId());
                    return null;
                }
                player.setDisconnectedUntil(roomManager.currentTimeMillis() + 120_000);
                Room room = roomManager.findRoom(roomId);
                List<Delivery> deliveries = new ArrayList<>();
                addForPlayers(deliveries, room.playerIdsSnapshot(), stateOf(room));
                deliverAll(deliveries);
                return null;
            });
        }
    }

    private List<Delivery> endMembership(PlayerState player, String roomId,
                                         ServerMessage.DepartureReason reason, boolean acknowledgeLeave) {
        Room room = roomManager.findRoom(roomId);
        boolean hostDeparted = player.getId().equals(room.getHostPlayerId());
        room.removePlayer(player.getId());
        if (hostDeparted) room.playerIdsSnapshot().stream().map(playersById::get)
                .filter(PlayerState::isConnected).findFirst()
                .ifPresent(successor -> room.setHostPlayerId(successor.getId()));
        roomManager.membershipEnded(room);
        List<Delivery> pendingDeliveries = new ArrayList<>();
        addForPlayers(pendingDeliveries, room.playerIdsSnapshot(),
                new ServerMessage.PlayerLeft(player.getId(), reason));
        if (hostDeparted && !room.playerIdsSnapshot().isEmpty()) {
            addForPlayers(pendingDeliveries, room.playerIdsSnapshot(), stateOf(room));
        }
        if (acknowledgeLeave) {
            pendingDeliveries.add(new Delivery(player.getId(), new ServerMessage.RoomLeft(roomId)));
        }
        return pendingDeliveries;
    }

    private ServerMessage.PlayerView viewOf(PlayerState player) {
        return new ServerMessage.PlayerView(
                player.getId(), player.getDisplayName(), player.getColour(), player.getAvatarPreset(), player.getSeat(), player.isReady(), player.isConnected(), player.getX(), player.getY(), player.getFacing(), player.getMovementSequence(), player.getMovementEpoch()
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
        String movementPlayerId = delivery.message() instanceof ServerMessage.PlayerMoved moved
                ? moved.playerId() : null;
        if (!outbox.enqueue(textMessage, movementPlayerId)) {
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
