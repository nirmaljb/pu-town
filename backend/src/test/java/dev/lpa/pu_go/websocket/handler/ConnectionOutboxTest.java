package dev.lpa.pu_go.websocket.handler;

import dev.lpa.pu_go.websocket.support.RecordingWebSocketSession;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.handler.WebSocketSessionDecorator;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Queue;
import java.util.concurrent.Executor;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
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

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void aFailedSendClosesTheConnectionAndNeverAttemptsFurtherEvents(boolean checkedFailure) {
        RecordingWebSocketSession session = new RecordingWebSocketSession("failed-session");
        List<String> attempted = new ArrayList<>();
        WebSocketSessionDecorator transport = new WebSocketSessionDecorator(session) {
            @Override public void sendMessage(WebSocketMessage<?> message) throws IOException {
                attempted.add(message.getPayload().toString());
                if (checkedFailure) throw new IOException("Transport write failed");
                throw new IllegalStateException("Transport is already writing a partial message");
            }
        };
        PausedExecutor executor = new PausedExecutor();
        ConnectionOutbox outbox = new ConnectionOutbox(transport, executor, 4);
        assertTrue(outbox.enqueue(new TextMessage("joined")));
        assertTrue(outbox.enqueue(new TextMessage("night")));
        assertTrue(outbox.enqueue(new TextMessage("chat")));

        assertDoesNotThrow(executor::runNext);

        assertFalse(session.isOpen());
        assertEquals(CloseStatus.SESSION_NOT_RELIABLE, session.closeStatus());
        assertEquals(List.of("joined"), attempted);
        assertEquals(List.of(), session.payloads());
        assertEquals(0, executor.pending());
        assertFalse(outbox.enqueue(new TextMessage("later field")));
        assertEquals(0, executor.pending());
    }

    private static final class PausedExecutor implements Executor {
        private final Queue<Runnable> work = new ArrayDeque<>();

        @Override public void execute(Runnable command) { work.add(command); }
        void runNext() { work.remove().run(); }
        int pending() { return work.size(); }
    }
}
