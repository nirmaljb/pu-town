package dev.lpa.pu_go.game;

import java.util.Set;

/**
 * One retained chat message. A public entry has no recipient restriction; a Mafia entry
 * carries the living Mafia who were entitled to it when it was sent, so a later Elimination
 * neither erases earlier messages nor grants continuing private access.
 */
public record ChatEntry(ChatChannel channel, int round, String senderPlayerId, String senderName, String text,
                        Set<String> recipients) {
    public ChatEntry {
        recipients = recipients == null ? null : Set.copyOf(recipients);
    }

    public boolean isReadableBy(String playerId) {
        return recipients == null || recipients.contains(playerId);
    }
}
