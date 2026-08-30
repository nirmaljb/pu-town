package dev.lpa.pu_go.websocket.handler;

import dev.lpa.pu_go.websocket.support.RecordingWebSocketSession;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;

import java.util.ArrayDeque;
import java.util.Queue;
import java.util.concurrent.Executor;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConnectionOutboxTest {
    @Test
    void structuralEventsKeepOrderWhileQueuedMovementForOnePlayerIsCoalesced() {
        RecordingWebSocketSession session = new RecordingWebSocketSession("session-1");
        PausedExecutor executor = new PausedExecutor();
        ConnectionOutbox outbox = new ConnectionOutbox(session, executor, 4);

        outbox.enqueue(new TextMessage("joined"), null);
        outbox.enqueue(new TextMessage("move-1"), "player-1");
        outbox.enqueue(new TextMessage("move-2"), "player-1");
        outbox.enqueue(new TextMessage("left"), null);
        executor.runNext();

        assertEquals(java.util.List.of("joined", "move-2", "left"), session.payloads());
    }

    @Test
    void aFullQueueDiscardsMovementBeforeStructuralEventsAndRejectsStructuralOverflow() {
        RecordingWebSocketSession session = new RecordingWebSocketSession("session-1");
        PausedExecutor executor = new PausedExecutor();
        ConnectionOutbox outbox = new ConnectionOutbox(session, executor, 2);

        assertTrue(outbox.enqueue(new TextMessage("joined"), null));
        assertTrue(outbox.enqueue(new TextMessage("move"), "player-1"));
        assertTrue(outbox.enqueue(new TextMessage("left"), null));
        assertFalse(outbox.enqueue(new TextMessage("snapshot"), null));
        executor.runNext();

        assertEquals(java.util.List.of("joined", "left"), session.payloads());
    }

    private static final class PausedExecutor implements Executor {
        private final Queue<Runnable> work = new ArrayDeque<>();

        @Override public void execute(Runnable command) { work.add(command); }
        void runNext() { work.remove().run(); }
    }
}
