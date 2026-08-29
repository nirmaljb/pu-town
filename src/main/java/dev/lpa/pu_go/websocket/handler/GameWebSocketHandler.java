package dev.lpa.pu_go.websocket.handler;

import dev.lpa.pu_go.player.PlayerState;
import dev.lpa.pu_go.room.Room;
import dev.lpa.pu_go.room.RoomManager;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import dev.lpa.pu_go.websocket.message.GameMessage;
import tools.jackson.databind.ObjectMapper;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class GameWebSocketHandler extends TextWebSocketHandler {
    private final RoomManager roomManager;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Map<String, PlayerState> players = new ConcurrentHashMap<>();

    public GameWebSocketHandler(RoomManager roomManager) {
        this.roomManager = roomManager;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        players.put(session.getId(), new PlayerState(session.getId(), session));
        System.out.println("Session established : " + session.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        GameMessage incoming = objectMapper.readValue(message.getPayload(), GameMessage.class);
        PlayerState player = players.get(session.getId());
        if(player == null) return;

        switch(incoming.getType()) {
            case "join" -> handleJoin(player, incoming);
            case "move" -> handleMove(player, incoming);
            case "chat" -> handleChat(player, incoming);
            default -> System.out.println("Unknown type: " + incoming.getType());
        }
    }

    private void handleJoin(PlayerState player, GameMessage msg) {
        player.setUsername(msg.getUsername());
        player.setRoomId(msg.getRoomId());
        roomManager.getOrCreateRoom(player.getRoomId()).addPlayer(player.getId());
        broadcastToRoom(player.getRoomId(), msg, player.getId());
    }

    private void handleMove(PlayerState player, GameMessage msg) {
        player.setX(msg.getX());
        player.setY(msg.getY());
        msg.setPlayerId(player.getId());
        broadcastToRoom(player.getRoomId(), msg, null);
    }

    private void handleChat(PlayerState player, GameMessage msg) {
        msg.setRoomId(player.getRoomId());
        msg.setPlayerId(player.getId());
        broadcastToRoom(player.getRoomId(), msg, null);
    }

    private void broadcastToRoom(String roomId, GameMessage msg, String excludePlayer) {
        Room room = roomManager.getOrCreateRoom(roomId);
        try {
            TextMessage out = new TextMessage(objectMapper.writeValueAsString(msg));
            for(String playerId: room.getPlayerIds()) {
                if(playerId.equals(excludePlayer)) continue;
                PlayerState p = players.get(playerId);
                if (p != null && p.getSession().isOpen()) {
                    p.getSession().sendMessage(out);
                }
            }
        }catch(Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        PlayerState player = players.get(session.getId());
        if(player != null && player.getRoomId() != null) {
            roomManager.removePlayerFromRoom(player.getRoomId(), player.getId());
        }
        System.out.println("Client discontinued: " + session.getId());
    }
}
