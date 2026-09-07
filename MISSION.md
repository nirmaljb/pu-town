# Mission: Explain PU Town's Spring WebSocket architecture

## Why
Learn how Spring's WebSocket lifecycle connects to PU Town's multiplayer domain logic so the architecture can be explained accurately to another developer and changed with confidence.

## Success looks like
- Trace a connection from the `/ws/game` handshake through join, movement, leave, and disconnect.
- Separate responsibilities supplied by Spring from responsibilities implemented by PU Town.
- Explain how state authority, event ordering, and slow connections are handled.
- Use the project's canonical Player, Room, Join, Leave, and Disconnect language.

## Constraints
- Ground lessons in the current repository and primary Spring documentation.
- Prefer short lessons with retrieval practice and reusable reference material.

## Out of scope
- STOMP, SockJS, and Spring WebFlux WebSockets.
- Authentication, persistence, and multi-server Room coordination.
