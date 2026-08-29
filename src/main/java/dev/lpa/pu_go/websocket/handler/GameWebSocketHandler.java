package dev.lpa.pu_go.websocket.handler;

import dev.lpa.pu_go.player.PlayerInfo;
import dev.lpa.pu_go.player.PlayerState;
import dev.lpa.pu_go.room.Room;
import dev.lpa.pu_go.room.RoomManager;
import dev.lpa.pu_go.room.RoomState;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import dev.lpa.pu_go.websocket.message.GameMessage;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;
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

        String type = incoming.getType();
        if(type == null) return;
        switch(type) {
            case "join" -> handleJoin(player, incoming);
            case "move" -> handleMove(player, incoming);
            case "chat" -> handleChat(player, incoming);
            default -> System.out.println("Unknown type: " + incoming.getType());
        }
    }

    private void handleJoin(PlayerState player, GameMessage msg) throws Exception {

        String oldRoomId = player.getRoomId();
        String newRoomId = msg.getRoomId();
        //In case player is already join in the same room
        if(oldRoomId != null && oldRoomId.equals(newRoomId)) {
            sendRoomState(player);
            return;
        }

        //In case player is already joined in some room
        //1. Kick the player out of the old room
        //2. Admit them in the new room
        //3. Let the other players in the older room know
        if(oldRoomId != null) {
            GameMessage message = new GameMessage();

            message.setPlayerId(player.getId());
            message.setType("left");
            message.setRoomId(player.getRoomId());
            message.setUsername(player.getUsername());

            roomManager.removePlayerFromRoom(oldRoomId, player.getId());
            broadcastToRoom(player.getRoomId(), message, null);
        }


        msg.setPlayerId(newRoomId);
        roomManager.getOrCreateRoom(newRoomId).addPlayer(player.getId());
        player.setUsername(msg.getUsername());
        player.setRoomId(newRoomId);

        broadcastToRoom(player.getRoomId(), msg, player.getId());
        sendRoomState(player);
    }

    private void sendRoomState(PlayerState player) throws Exception {
        Room room = roomManager.getOrCreateRoom(player.getRoomId());

        List<PlayerInfo> playersPositionList = new ArrayList<>();

        for(String playerId: room.getPlayerIds()) {
            PlayerState otherPlayer = players.get(playerId);

            if(otherPlayer != null && otherPlayer.getSession().isOpen()) {
                playersPositionList.add(
                        new PlayerInfo(
                                otherPlayer.getId(),
                                otherPlayer.getUsername(),
                                otherPlayer.getX(),
                                otherPlayer.getY()
                        )
                );
            }
        }

        RoomState roomState = new RoomState(
                "room_state",
                playersPositionList
        );

        TextMessage out = new TextMessage(objectMapper.writeValueAsString(roomState));
        broadcastToPlayer(player.getId(), out);
    }

    private void handleMove(PlayerState player, GameMessage msg) {
        if(player.getRoomId() == null) {
            return;
        }
        player.setX(msg.getX());
        player.setY(msg.getY());
        msg.setPlayerId(player.getId());
        broadcastToRoom(player.getRoomId(), msg, null);
    }

    private void handleChat(PlayerState player, GameMessage msg) {
        if(player.getRoomId() == null) {
            return;
        }
        msg.setRoomId(player.getRoomId());
        msg.setPlayerId(player.getId());
        broadcastToRoom(player.getRoomId(), msg, null);
    }

    private void broadcastToPlayer(String playerId, TextMessage msg) throws Exception {
        PlayerState player = players.get(playerId);
        if(player == null || !player.getSession().isOpen()) return;
        player.getSession().sendMessage(msg);
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
        PlayerState player = players.remove(session.getId());
        if(player != null && player.getRoomId() != null) {
            GameMessage message = new GameMessage();

            message.setPlayerId(player.getId());
            message.setType("disconnected");
            message.setRoomId(player.getRoomId());
            message.setUsername(player.getUsername());

            roomManager.removePlayerFromRoom(player.getRoomId(), player.getId());
            broadcastToRoom(player.getRoomId(), message, null);
        }

        System.out.println("Client discontinued: " + session.getId());
    }
}
