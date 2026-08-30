# PU Town

PU Town is a shared top-down game world in which players occupy isolated rooms and see one another move in real time.

## Language

**Player**:
An active participant in the game world.
_Avoid_: User, avatar

**Player ID**:
A server-issued identifier for one player's current connected session. It, rather than a display name, determines player identity.
_Avoid_: Username, display name

**Display Name**:
A player-chosen label shown beside their avatar; it need not be unique.
_Avoid_: Player ID, username

**Avatar**:
The visible in-world representation of a player. An avatar may change appearance without changing the player it represents.
_Avoid_: Player

**Room**:
An isolated multiplayer space whose state is shared only among its current players.
_Avoid_: Lobby, channel

**Room Snapshot**:
The complete set of current players and their positions sent to one player after they join or rejoin a room.
_Avoid_: Initial state, player list

**Spawn Point**:
A valid in-room position at which a player may begin a room membership.
_Avoid_: Starting tile

**Join**:
The transition by which a connected player becomes a member of a room and receives that room's current state.
_Avoid_: Connect

**Room Membership**:
The period from a successful join until a leave or disconnect, during which a player's state is shared with the room.
_Avoid_: Connection, session

**Disconnect**:
The end of a player's network connection without an acknowledged Leave. It ends the current room membership and may trigger reconnection when the client remains active.
_Avoid_: Leave, logout

**Leave**:
A player's acknowledged, intentional exit from their current room. Leaving does not trigger automatic reconnection.
_Avoid_: Disconnect, logout

**Reconnect**:
The creation of a new network connection after a disconnect, followed by rejoining the previous room with a newly issued Player ID.
_Avoid_: Resume
