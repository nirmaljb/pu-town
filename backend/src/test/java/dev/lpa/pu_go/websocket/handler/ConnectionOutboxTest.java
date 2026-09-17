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
    void queuedEventsReachTheConnectionInTheOrderTheRoomCreatedThem() {
        RecordingWebSocketSession session = new RecordingWebSocketSession("session-1");
        PausedExecutor executor = new PausedExecutor();
        ConnectionOutbox outbox = new ConnectionOutbox(session, executor, 4);

        outbox.enqueue(new TextMessage("joined"));
        outbox.enqueue(new TextMessage("night"));
        outbox.enqueue(new TextMessage("chat"));
        outbox.enqueue(new TextMessage("left"));
        executor.runNext();

        assertEquals(java.util.List.of("joined", "night", "chat", "left"), session.payloads());
    }

    @Test
    void aFullQueueRefusesFurtherEventsWithoutEvictingEarlierOnes() {
        RecordingWebSocketSession session = new RecordingWebSocketSession("session-1");
        PausedExecutor executor = new PausedExecutor();
        ConnectionOutbox outbox = new ConnectionOutbox(session, executor, 2);

        assertTrue(outbox.enqueue(new TextMessage("joined")));
        assertTrue(outbox.enqueue(new TextMessage("chat")));
        assertFalse(outbox.enqueue(new TextMessage("left")));
        assertFalse(outbox.enqueue(new TextMessage("game_state")));
        executor.runNext();

        assertEquals(java.util.List.of("joined", "chat"), session.payloads());
    }

    private static final class PausedExecutor implements Executor {
        private final Queue<Runnable> work = new ArrayDeque<>();

        @Override public void execute(Runnable command) { work.add(command); }
        void runNext() { work.remove().run(); }
    }
}
