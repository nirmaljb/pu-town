# Use a versioned explicit WebSocket contract

WebSocket traffic uses versioned, message-specific contracts rather than one permissive message shape shared by every operation. This adds some backend DTOs and frontend schemas, but prevents fields from leaking between message types, makes malformed input rejectable at the boundary, and lets future clients detect incompatible protocol changes instead of failing unpredictably.

The version 1 message families are `join_room`, `leave_room`, and `move_player` from client to server, and `room_snapshot`, `player_joined`, `player_moved`, `player_left`, `room_left`, and `error` from server to client.
