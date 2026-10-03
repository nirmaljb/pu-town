package dev.lpa.pu_go.game;

import java.util.Set;

/**
 * One retained chat message, with the Participants entitled to it when it was sent.
 * Later movement and recovery never widen a message's audience.
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
