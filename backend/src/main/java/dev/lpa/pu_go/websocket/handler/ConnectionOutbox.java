package dev.lpa.pu_go.websocket.handler;

import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * A bounded, ordered outbound queue drained off the Room lock. Every event a Game publishes
 * is structural or a chat message, so nothing here is replaceable: an overflowing queue
 * refuses the event and its connection is closed, leaving Reconnect to deliver a fresh
 * Room Snapshot and authorized Game state.
 */
final class ConnectionOutbox {
    static final int DEFAULT_CAPACITY = 256;

    private final WebSocketSession session;
    private final Executor executor;
    private final int capacity;
    private final List<TextMessage> messages = new ArrayList<>();
    private final AtomicBoolean draining = new AtomicBoolean();
    private boolean failed;

    ConnectionOutbox(WebSocketSession session, Executor executor) {
        this(session, executor, DEFAULT_CAPACITY);
    }

    ConnectionOutbox(WebSocketSession session, Executor executor, int capacity) {
        if (capacity < 1) throw new IllegalArgumentException("capacity must be positive");
        this.session = session;
        this.executor = executor;
        this.capacity = capacity;
    }

    boolean enqueue(TextMessage message) {
        synchronized (messages) {
            if (failed || messages.size() == capacity) return false;
            messages.add(message);
        }
        scheduleDrain();
        return true;
    }

    private void scheduleDrain() {
        synchronized (messages) {
            if (!failed && draining.compareAndSet(false, true)) executor.execute(this::drain);
        }
    }

    private void drain() {
        try {
            while (session.isOpen()) {
                TextMessage next;
                synchronized (messages) {
                    if (messages.isEmpty()) return;
                    next = messages.remove(0);
                }
                session.sendMessage(next);
            }
        } catch (IOException | IllegalStateException ignored) {
            // A failed write cannot establish which events arrived. End this transport;
            // recovery supplies a complete authorized snapshot instead of replaying it.
            synchronized (messages) { failed = true; }
            try { session.close(CloseStatus.SESSION_NOT_RELIABLE); }
            catch (IOException | IllegalStateException closeFailure) { /* Failure remains latched even if close fails. */ }
        } finally {
            draining.set(false);
            synchronized (messages) {
                if (!failed && !messages.isEmpty() && session.isOpen()) scheduleDrain();
            }
        }
    }
}
