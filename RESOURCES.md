# PU Town Spring WebSocket Resources

## Knowledge

- [PU Town `GameWebSocketHandler`](backend/src/main/java/dev/lpa/pu_go/websocket/handler/GameWebSocketHandler.java)
  The primary implementation being studied. Use for: lifecycle callbacks, command routing, membership transitions, and outbound delivery.
- [PU Town WebSocket protocol v1](docs/websocket-protocol-v1.md)
  The exact JSON contract and validation rules. Use for: identifying which behavior belongs to the application protocol.
- [PU Town ADR 0004](docs/adr/0004-serialize-room-events-and-coalesce-movement.md)
  The rationale for per-Room ordering and bounded outbound queues. Use for: explaining concurrency and backpressure decisions.
- [Spring Framework: WebSocket API](https://docs.spring.io/spring-framework/reference/web/websocket/server.html)
  Official Servlet-stack guide to handlers, URL registration, handshakes, concurrent sending, and allowed origins. Use for: distinguishing Spring's infrastructure from PU Town's logic.
- [Spring Framework: `WebSocketHandler` Javadoc](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/web/socket/WebSocketHandler.html)
  Official lifecycle callback contract. Use for: the precise meaning of connection, message, transport-error, and close callbacks.
- [Spring Framework: `TextWebSocketHandler` Javadoc](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/web/socket/handler/TextWebSocketHandler.html)
  Official base-class behavior. Use for: why PU Town overrides text handling and rejects binary messages by default.

## Wisdom (Communities)

- [Stack Overflow: `spring-websocket`](https://stackoverflow.com/questions/tagged/spring-websocket)
  Practitioner questions and failure cases. Use for: testing an explanation against real integration and concurrency problems; verify accepted advice against Spring's official documentation.
