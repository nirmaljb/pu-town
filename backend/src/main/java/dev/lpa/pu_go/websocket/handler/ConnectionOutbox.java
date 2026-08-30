package dev.lpa.pu_go.websocket.handler;

import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;

final class ConnectionOutbox {
    static final int DEFAULT_CAPACITY = 256;

    private final WebSocketSession session;
    private final Executor executor;
    private final int capacity;
    private final List<QueuedMessage> messages = new ArrayList<>();
    private final AtomicBoolean draining = new AtomicBoolean();

    ConnectionOutbox(WebSocketSession session, Executor executor) {
        this(session, executor, DEFAULT_CAPACITY);
    }

    ConnectionOutbox(WebSocketSession session, Executor executor, int capacity) {
        if (capacity < 1) throw new IllegalArgumentException("capacity must be positive");
        this.session = session;
        this.executor = executor;
        this.capacity = capacity;
    }

    boolean enqueue(TextMessage message, String movementPlayerId) {
        synchronized (messages) {
            if (movementPlayerId != null) {
                for (int index = messages.size() - 1; index >= 0; index--) {
                    if (movementPlayerId.equals(messages.get(index).movementPlayerId())) {
                        messages.set(index, new QueuedMessage(message, movementPlayerId));
                        scheduleDrain();
                        return true;
                    }
                }
            }
            if (messages.size() == capacity && !discardOldestMovement()) return false;
            messages.add(new QueuedMessage(message, movementPlayerId));
        }
        scheduleDrain();
        return true;
    }

    private boolean discardOldestMovement() {
        for (int index = 0; index < messages.size(); index++) {
            if (messages.get(index).movementPlayerId() != null) {
                messages.remove(index);
                return true;
            }
        }
        return false;
    }

    private void scheduleDrain() {
        if (draining.compareAndSet(false, true)) executor.execute(this::drain);
    }

    private void drain() {
        try {
            while (session.isOpen()) {
                QueuedMessage next;
                synchronized (messages) {
                    if (messages.isEmpty()) return;
                    next = messages.remove(0);
                }
                session.sendMessage(next.message());
            }
        } catch (IOException ignored) {
            // The WebSocket lifecycle callback removes the disconnected player.
        } finally {
            draining.set(false);
            synchronized (messages) {
                if (!messages.isEmpty() && session.isOpen()) scheduleDrain();
            }
        }
    }

    private record QueuedMessage(TextMessage message, String movementPlayerId) {}
}
