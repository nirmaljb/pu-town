package dev.lpa.pu_go.game;

import java.util.Set;

/** One retained message with the immutable recipient set authorized when it was sent. */
public record ChatEntry(ChatChannel channel, int round, String senderPlayerId, String senderName, String text,
                        Set<String> recipients) {
    public ChatEntry {
        recipients = recipients == null ? null : Set.copyOf(recipients);
    }

    public boolean isReadableBy(String playerId) {
        return recipients == null || recipients.contains(playerId);
    }
}
