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
        PlayerState player = playersBySession.get(session.getId());
        if (player == null) return;
        synchronized (player) {
            if (playersBySession.get(session.getId()) != player) return;
            try {
                ClientMessage incoming = decoder.decode(message.getPayload());
                if (incoming instanceof ClientMessage.JoinRoom join) handleJoin(player, join);
                else if (incoming instanceof ClientMessage.LeaveRoom) handleLeave(player);
                else if (incoming instanceof ClientMessage.MovePlayer move) handleMove(player, move);
            } catch (InvalidClientMessageException exception) {
                deliver(new Delivery(player.getId(), new ServerMessage.ErrorMessage(exception.code(), exception.getMessage())));
            }
        }
    }

    private void handleJoin(PlayerState player, ClientMessage.JoinRoom message) {
        String oldRoomId = player.getRoomId();
        List<String> involvedRooms = oldRoomId == null ? List.of(message.roomId()) : List.of(oldRoomId, message.roomId());
        roomManager.serialized(involvedRooms, () -> {
            List<Delivery> pendingDeliveries = new ArrayList<>();
            if (oldRoomId != null && !oldRoomId.equals(message.roomId())) {
                pendingDeliveries.addAll(endMembership(player, oldRoomId, ServerMessage.DepartureReason.LEFT, false));
            }

            Room room = roomManager.getOrCreateRoom(message.roomId());
            boolean alreadyJoined = room.containsPlayer(player.getId()) && message.roomId().equals(oldRoomId);
            player.setRoomId(message.roomId());
            if (!alreadyJoined) {
                player.setDisplayName(message.displayName());
                player.setX(RoomRules.SPAWN_X);
                player.setY(RoomRules.SPAWN_Y);
                player.setLastAcceptedMovementNanos(nanoTime.getAsLong());
                room.addPlayer(player.getId());
                List<String> existingPlayers = room.playerIdsSnapshot().stream()
                        .filter(playerId -> !playerId.equals(player.getId())).toList();
                addForPlayers(pendingDeliveries, existingPlayers, new ServerMessage.PlayerJoined(viewOf(player)));
            }
            List<ServerMessage.PlayerView> snapshotPlayers = room.playerIdsSnapshot().stream()
                    .map(playersById::get)
                    .filter(candidate -> candidate != null && candidate.getSession().isOpen())
                    .map(this::viewOf)
                    .toList();
            pendingDeliveries.add(new Delivery(player.getId(),
                    new ServerMessage.RoomSnapshot(player.getId(), message.roomId(), snapshotPlayers)));
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

    private void handleMove(PlayerState player, ClientMessage.MovePlayer message) {
        String roomId = player.getRoomId();
        if (roomId == null) {
            deliver(error(player, "not_in_room", "Join a room before moving."));
            return;
        }
        roomManager.serialized(List.of(roomId), () -> {
            long now = nanoTime.getAsLong();
            if (!RoomRules.acceptsMovement(player, message.x(), message.y(), now)) {
                deliver(error(player, "invalid_movement", "Position is outside the room or exceeds movement speed."));
                return null;
            }
            player.setX(message.x());
            player.setY(message.y());
            player.setLastAcceptedMovementNanos(now);
            Room room = roomManager.getOrCreateRoom(roomId);
            List<Delivery> pendingDeliveries = new ArrayList<>();
            addForPlayers(pendingDeliveries, room.playerIdsSnapshot(),
                    new ServerMessage.PlayerMoved(player.getId(), message.x(), message.y()));
            deliverAll(pendingDeliveries);
            return null;
        });
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        PlayerState player = playersBySession.get(session.getId());
        if (player == null) return;
        synchronized (player) {
            if (!playersBySession.remove(session.getId(), player)) return;
            playersById.remove(player.getId());
            outboxes.remove(player.getId());
            String roomId = player.getRoomId();
            if (roomId == null) return;
            roomManager.serialized(List.of(roomId), () -> {
                deliverAll(endMembership(player, roomId, ServerMessage.DepartureReason.DISCONNECTED, false));
                return null;
            });
        }
    }

    private List<Delivery> endMembership(PlayerState player, String roomId,
                                         ServerMessage.DepartureReason reason, boolean acknowledgeLeave) {
        Room room = roomManager.getOrCreateRoom(roomId);
        room.removePlayer(player.getId());
        List<Delivery> pendingDeliveries = new ArrayList<>();
        addForPlayers(pendingDeliveries, room.playerIdsSnapshot(),
                new ServerMessage.PlayerLeft(player.getId(), reason));
        if (acknowledgeLeave) {
            pendingDeliveries.add(new Delivery(player.getId(), new ServerMessage.RoomLeft(roomId)));
        }
        return pendingDeliveries;
    }

    private ServerMessage.PlayerView viewOf(PlayerState player) {
        return new ServerMessage.PlayerView(
                player.getId(), player.getDisplayName(), player.getX(), player.getY()
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
        try {
            TextMessage textMessage = new TextMessage(objectMapper.writeValueAsString(delivery.message()));
            String movementPlayerId = delivery.message() instanceof ServerMessage.PlayerMoved moved
                    ? moved.playerId() : null;
            if (!outbox.enqueue(textMessage, movementPlayerId)) {
                PlayerState player = playersById.get(delivery.playerId());
                if (player != null && player.getSession().isOpen()) {
                    player.getSession().close(CloseStatus.SESSION_NOT_RELIABLE);
                }
            }
        } catch (IOException ignored) {
            // The WebSocket lifecycle callback removes the disconnected player.
        }
    }

    private record Delivery(String playerId, ServerMessage message) {}
}
