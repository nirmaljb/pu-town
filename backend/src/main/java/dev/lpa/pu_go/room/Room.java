package dev.lpa.pu_go.room;

import dev.lpa.pu_go.avatar.AvatarCollection;
import dev.lpa.pu_go.game.Game;
import dev.lpa.pu_go.game.RoleSetup;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

public class Room {
    private final String roomId;
    // Pinned at creation: Publishing reaches later Rooms, never this one.
    private final AvatarCollection avatarCollection;
    private String phase = "lobby";
    private Game game;
    private String hostPlayerId;
    // The Host's deal, chosen in the Lobby and fixed once the Game starts.
    private RoleSetup roleSetup = RoleSetup.DEFAULT;
    public RoleSetup getRoleSetup() { return roleSetup; }
    public void setRoleSetup(RoleSetup value) { roleSetup = value; }
    public void setHostPlayerId(String value) { hostPlayerId = value; }
    public String getPhase() { return phase; }
    public String getHostPlayerId() { return hostPlayerId; }
    public Game getGame() { return game; }
    public void startGame(Game startedGame) { phase = "playing"; game = startedGame; }
    private long emptySince;
    public long getEmptySince() { return emptySince; }
    public void setEmptySince(long value) { emptySince = value; }
    private final Set<String> playerIds = new LinkedHashSet<>();

    public Room(String roomId, AvatarCollection avatarCollection) {
        this.roomId = roomId;
        this.avatarCollection = avatarCollection;
    }

    public String getRoomId() { return roomId; }
    public AvatarCollection getAvatarCollection() { return avatarCollection; }
    public List<String> playerIdsSnapshot() { return List.copyOf(playerIds); }
    public void addPlayer(String playerId) { playerIds.add(playerId); if (hostPlayerId == null) hostPlayerId = playerId; }
    public void removePlayer(String playerId) {
        playerIds.remove(playerId);
        if (playerId.equals(hostPlayerId)) hostPlayerId = playerIds.stream().findFirst().orElse(null);
    }
    public boolean containsPlayer(String playerId) { return playerIds.contains(playerId); }
}
