package dev.lpa.pu_go.websocket.handler;

import dev.lpa.pu_go.game.ChatEntry;
import dev.lpa.pu_go.game.Game;
import dev.lpa.pu_go.game.Participant;
import dev.lpa.pu_go.game.Role;
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

    /**
     * The deal for a table of this size: one Mafia for four to six Players, two for seven or
     * eight and three for nine or ten, always with one Doctor and one Sheriff.
     */
    static List<Role> rolesFor(int players) {
        int mafia = players >= 9 ? 3 : players >= 7 ? 2 : 1;
        List<Role> roles = new ArrayList<>();
        for (int index = 0; index < players; index++) {
            roles.add(index < mafia ? Role.MAFIA : index == mafia ? Role.DOCTOR : index == mafia + 1 ? Role.SHERIFF : Role.VILLAGER);
        }
        return List.copyOf(roles);
    }

    private final RoomManager roomManager;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ClientMessageDecoder decoder = new ClientMessageDecoder(objectMapper);
    private final Map<String, PlayerState> playersBySession = new ConcurrentHashMap<>();
    private final Map<String, PlayerState> playersById = new ConcurrentHashMap<>();
    private final Map<String, ConnectionOutbox> outboxes = new ConcurrentHashMap<>();
    private final Executor outboundExecutor;
    private final Supplier<String> playerIdSupplier;
    private final UnaryOperator<List<Role>> roleAssignment;

    @Autowired
    public GameWebSocketHandler(RoomManager roomManager) {
        this(roomManager, Executors.newCachedThreadPool(), () -> UUID.randomUUID().toString(), GameWebSocketHandler::shuffleRoles);
    }

    GameWebSocketHandler(RoomManager roomManager, Executor outboundExecutor,
                         Supplier<String> playerIdSupplier, UnaryOperator<List<Role>> roleAssignment) {
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
                ClientMessage incoming = decoded instanceof ClientMessage.CreateRoom create
                        ? new ClientMessage.JoinRoom(1, "join_room", roomManager.createRoom().getRoomId(), create.displayName()) : decoded;
                List<String> rooms = new ArrayList<>();
                if (player.getRoomId() != null) rooms.add(player.getRoomId());
                if (incoming instanceof ClientMessage.JoinRoom join) rooms.add(join.roomId());
                if (incoming instanceof ClientMessage.RecoverRoom recover) rooms.add(recover.roomId());
                roomManager.serialized(rooms, () -> {
                    if (playersBySession.get(session.getId()) != player || player.getSession() != session) return null;
                    if (player.getRoomId() != null) settleRoom(player.getRoomId());
                    if (incoming instanceof ClientMessage.RecoverRoom recover) handleRecovery(player, recover);
                    else if (incoming instanceof ClientMessage.JoinRoom join) handleJoin(player, join);
                    else if (incoming instanceof ClientMessage.Ping) deliver(new Delivery(player.getId(), new ServerMessage.Pong()));
                    else if (incoming instanceof ClientMessage.LeaveRoom) handleLeave(player);
                    else if (incoming instanceof ClientMessage.SelectAvatar selection) handleAvatarSelection(player, selection);
                    else if (incoming instanceof ClientMessage.SetReady ready) handleReady(player, ready);
                    else if (incoming instanceof ClientMessage.StartGame) handleStart(player);
                    else if (incoming instanceof ClientMessage.Move move) handleMove(player, move);
                    else if (incoming instanceof ClientMessage.UseAbility ability) handleAbility(player, ability);
                    else if (incoming instanceof ClientMessage.MeetingVote vote) handleMeetingVote(player, vote);
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
     * The Roam's heartbeat: Villager crowding advances, and every Participant receives the
     * part of the town they can see along with their own ability timers.
     */
    @org.springframework.scheduling.annotation.Scheduled(fixedRate = 100)
    public void tickFields() {
        for (String code : roomManager.roomIdsSnapshot()) {
            roomManager.serialized(List.of(code), () -> {
                Room room = roomManager.findRoom(code);
                Game game = room == null ? null : room.getGame();
                if (game == null || !game.isRoaming()) return null;
                long now = roomManager.currentTimeMillis();
                game.tick(now);
                List<Delivery> deliveries = new ArrayList<>();
                for (String memberId : room.playerIdsSnapshot()) {
                    if (game.participant(memberId) != null) deliveries.add(new Delivery(memberId, fieldStateFor(game, memberId, now)));
                }
                deliverAll(deliveries);
                return null;
            });
        }
    }

    private static ServerMessage.FieldState fieldStateFor(Game game, String playerId, long now) {
        return new ServerMessage.FieldState(game.round(), game.fieldPlayersFor(playerId, now),
                game.bodiesFor(playerId), game.ownFieldOf(playerId, now));
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
            Room room = settleRoom(message.roomId());
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
            playersBySession.put(member.getSession().getId(), member);
            outboxes.put(member.getId(), outbox);
            if (retiredSession.isOpen()) outboundExecutor.execute(() -> {
                try { retiredSession.close(new CloseStatus(4001, "Connection replaced")); }
                catch (IOException ignored) { /* Retired sessions already have no authority. */ }
            });
            deliver(new Delivery(member.getId(), new ServerMessage.RoomSnapshot(member.getId(), message.roomId(),
                    member.getRecoveryToken(), room.getPhase(), room.getHostPlayerId(), stateOf(room).players())));
            List<Delivery> deliveries = new ArrayList<>();
            addPrivateGameEntry(deliveries, room, member.getId());
            addForPlayers(deliveries, room.playerIdsSnapshot().stream().filter(id -> !id.equals(member.getId())).toList(), stateOf(room));
            deliverAll(deliveries);
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
                player.setX(RoomRules.seatX(seat));
                player.setY(RoomRules.seatY(seat));
                room.addPlayer(player.getId());
                List<String> existingPlayers = room.playerIdsSnapshot().stream()
                        .filter(playerId -> !playerId.equals(player.getId())).toList();
                addForPlayers(pendingDeliveries, existingPlayers, new ServerMessage.PlayerJoined(viewOf(player)));
            }
            List<ServerMessage.PlayerView> snapshotPlayers = room.playerIdsSnapshot().stream()
                    .map(playersById::get)
                    .filter(Objects::nonNull)
                    .map(this::viewOf)
                    .toList();
            pendingDeliveries.add(new Delivery(player.getId(),
                    new ServerMessage.RoomSnapshot(player.getId(), message.roomId(), player.getRecoveryToken(), room.getPhase(), room.getHostPlayerId(), snapshotPlayers)));
            addPrivateGameEntry(pendingDeliveries, room, player.getId());
            deliverAll(pendingDeliveries);
            return null;
        });
    }

    /** A Room Snapshot is followed by exactly the Game state and history its recipient may read. */
    private void addPrivateGameEntry(Collection<Delivery> deliveries, Room room, String playerId) {
        Game game = room.getGame();
        if (game == null || game.participant(playerId) == null) return;
        deliveries.add(new Delivery(playerId, gameStateFor(game, playerId)));
        deliveries.add(new Delivery(playerId, new ServerMessage.ChatHistory(game.historyFor(playerId).stream()
                .map(entry -> new ServerMessage.ChatView(entry.channel(), entry.round(),
                        entry.senderPlayerId(), entry.senderName(), entry.text()))
                .toList())));
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
                return null;
            }
            if (!room.getPhase().equals("lobby")) {
                deliver(error(player, "invalid_phase", "The game has already started."));
                return null;
            }
            List<PlayerState> members = room.playerIdsSnapshot().stream().map(playersById::get)
                    .filter(Objects::nonNull).sorted(Comparator.comparingInt(PlayerState::getSeat)).toList();
            String blocked = startBlockedReason(members);
            if (blocked != null) {
                deliver(error(player, "start_blocked", blocked));
                return null;
            }
            List<Role> roles = roleAssignment.apply(rolesFor(members.size()));
            if (roles.size() != members.size()) throw new IllegalStateException("Role assignment must cover every Player");
            List<Participant> roster = new ArrayList<>();
            for (int index = 0; index < members.size(); index++) {
                PlayerState member = members.get(index);
                roster.add(new Participant(member.getId(), member.getDisplayName(), member.getColour(),
                        member.getAvatarPreset(), member.getSeat(), roles.get(index)));
            }
            room.startGame(new Game(roster, roomManager.currentTimeMillis()));
            List<Delivery> deliveries = new ArrayList<>();
            addForPlayers(deliveries, room.playerIdsSnapshot(), stateOf(room));
            addGameState(deliveries, room);
            deliverAll(deliveries);
            return null;
        });
    }

    private static String startBlockedReason(List<PlayerState> members) {
        if (members.size() < RoomRules.MIN_PLAYERS)
            return "At least " + RoomRules.MIN_PLAYERS + " Players must be in the Room to start.";
        if (members.stream().anyMatch(member -> !member.isConnected()))
            return "Every Player must be connected to start.";
        if (members.stream().anyMatch(member -> !member.isReady()))
            return "Every Player must be Ready to start.";
        return null;
    }

    /** Movement is answered only through the next field state, never with an error per step. */
    private void handleMove(PlayerState player, ClientMessage.Move message) {
        withGame(player, (room, game) ->
                game.move(player.getId(), message.x(), message.y(), message.facing(), roomManager.currentTimeMillis()));
    }

    private void handleAbility(PlayerState player, ClientMessage.UseAbility message) {
        withGame(player, (room, game) -> {
            long now = roomManager.currentTimeMillis();
            Game.AbilityResult result = game.useAbility(player.getId(), message.ability(), message.round(),
                    message.targetPlayerId(), now);
            List<Delivery> deliveries = new ArrayList<>();
            if (result.rejection() != null) deliveries.add(error(player, result.rejection().code(), result.rejection().message()));
            if (result.effect() == null) {
                deliverAll(deliveries);
                return;
            }
            // Only the recipients whose authorized view changed are told: a kill reaches the
            // killer, the victim and the Mafia, while the living Village learns of it only by
            // finding the Body or at the next Meeting.
            switch (result.effect()) {
                case KILLED -> {
                    List<String> told = new ArrayList<>(livingMafiaMembers(room, game));
                    if (!told.contains(result.targetPlayerId())) told.add(result.targetPlayerId());
                    addGameStateFor(deliveries, room, told);
                }
                case MEETING_CALLED, GAME_WON -> addGameState(deliveries, room);
                case SCANNED -> addGameStateFor(deliveries, room, List.of(player.getId()));
                case VANISHED, SHIELDED -> deliveries.add(new Delivery(player.getId(), fieldStateFor(game, player.getId(), now)));
                // The killer's refusal is already queued; the Doctor sees the spent Shield on the next tick.
                case SHIELD_ABSORBED -> { }
            }
            deliverAll(deliveries);
        });
    }

    private void handleMeetingVote(PlayerState player, ClientMessage.MeetingVote message) {
        withGame(player, (room, game) -> {
            Game.Rejection rejection = game.submitBallot(player.getId(), message.round(), message.targetPlayerId());
            if (rejection != null) deliver(error(player, rejection.code(), rejection.message()));
            else {
                List<Delivery> deliveries = new ArrayList<>();
                addGameStateFor(deliveries, room, List.of(player.getId()));
                deliverAll(deliveries);
            }
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

    private List<String> livingMafiaMembers(Room room, Game game) {
        return room.playerIdsSnapshot().stream().filter(memberId -> {
            Participant participant = game.participant(memberId);
            return participant != null && participant.isLiving() && participant.role() == Role.MAFIA;
        }).toList();
    }

    private ServerMessage.RoomState stateOf(Room room) {
        return new ServerMessage.RoomState(room.getPhase(), room.getHostPlayerId(),
                room.playerIdsSnapshot().stream().map(playersById::get).map(this::viewOf).toList());
    }

    private void addGameState(Collection<Delivery> deliveries, Room room) {
        addGameStateFor(deliveries, room, room.playerIdsSnapshot());
    }

    private void addGameStateFor(Collection<Delivery> deliveries, Room room, Collection<String> playerIds) {
        Game game = room.getGame();
        if (game == null) return;
        for (String playerId : playerIds) {
            if (game.participant(playerId) != null) deliveries.add(new Delivery(playerId, gameStateFor(game, playerId)));
        }
    }

    /** Builds one recipient's complete authorized view; nothing here is merely hidden in the client. */
    private ServerMessage.GameState gameStateFor(Game game, String playerId) {
        Participant self = game.participant(playerId);
        List<ServerMessage.RosterView> roster = game.roster().stream()
                .map(member -> new ServerMessage.RosterView(member.playerId(), member.displayName(), member.colour(),
                        member.avatarPreset(), member.seat(), game.statusSeenBy(member, playerId)))
                .toList();
        Game.Outcome outcome = game.outcome();
        List<Game.Ballot> revealed = game.revealedBallots();
        List<ServerMessage.RoleView> roles = game.isFinished()
                ? game.roster().stream().map(member -> new ServerMessage.RoleView(member.playerId(), member.role())).toList()
                : null;
        return new ServerMessage.GameState(game.phase().wireValue(), game.round(),
                game.remainingMillis(roomManager.currentTimeMillis()), roster,
                outcome == null ? null : new ServerMessage.OutcomeView(outcome.kind(), outcome.callerPlayerId(),
                        outcome.bodyPlayerId(), outcome.deaths(), outcome.eliminatedPlayerId(), outcome.eliminatedMafia()),
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
                game.hasBallot(self.playerId()), game.acceptedBallot(self.playerId()));
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
        Game game = room.getGame();
        // Leave and expiry end participation; the Game Roster entry and its Seat remain.
        if (game != null) game.forfeit(player.getId());
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
        if (game != null) addGameState(pendingDeliveries, room);
        if (acknowledgeLeave) {
            pendingDeliveries.add(new Delivery(player.getId(), new ServerMessage.RoomLeft(roomId)));
        }
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
