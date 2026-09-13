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

**Facing**:
The direction an Avatar is looking, retained when it stops moving.
_Avoid_: Position, movement

**Avatar Preset**:
A ready-made character appearance assigned to a player's avatar for a room membership. Multiple players may share a preset; it does not determine player identity or gender.
_Avoid_: Player, Player ID

**Player Colour**:
A visual marker assigned to a player that is distinct from those of other current players in the same room. It may change when the player rejoins and does not determine player identity.
_Avoid_: Player ID

**Room**:
An isolated multiplayer space whose state is shared only among its current players.
_Avoid_: Lobby, channel

**Room Snapshot**:
The complete set of current players and their positions sent to one player after they join or rejoin a room.
_Avoid_: Initial state, player list

**Lobby**:
The waiting phase of a Room before its game starts, during which Players gather in the Meeting Area.
_Avoid_: Room

**Host**:
The Player responsible for starting a Room's game, initially the Player who created the Room.
_Avoid_: Room owner

**Ready**:
A Player's declaration that they are prepared for the game to start. A Player who has not made or has withdrawn that declaration is Not Ready.
_Avoid_: Connected, joined

**Town Hall**:
The in-world building containing the Meeting Area.

**Meeting Area**:
The place inside the Town Hall where Players sit in a circle for the Lobby and future morning meetings.
_Avoid_: Lobby, Room

**Room Code**:
A shareable code that identifies the room a player wants to join. Anyone with the code may join that room without approval.
_Avoid_: Lobby code, invite link

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
