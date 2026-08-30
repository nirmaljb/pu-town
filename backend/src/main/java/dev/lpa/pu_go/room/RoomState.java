package dev.lpa.pu_go.room;

import dev.lpa.pu_go.player.PlayerInfo;

import java.util.List;

public record RoomState(
        String type,
        List<PlayerInfo> playerList
) {}
