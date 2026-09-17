# PU Town

PU Town is a social deduction game in which Players occupy isolated Rooms, gather around one table, and play out a Game of Mafia against the Village in real time.

## Language

**Player**:
A participant in the game world, including one who has been eliminated from the current Game.
_Avoid_: User, avatar

**Player ID**:
A server-issued identifier for a Player's Room Membership, retained when that membership is recovered after a Disconnect. It, rather than a Display Name, determines Player identity.
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
A developer-designed, ready-made cosmetic appearance for a Player's Avatar, selectable from the Published Avatar Collection in the Lobby. Multiple Players may share a preset; it does not determine Player identity, gender, abilities, or gameplay role.
_Avoid_: Player, Player ID

**Published Avatar Collection**:
The set of Avatar Presets a Room offers its Players in the Lobby. A Room keeps the collection it was created with, so Publishing changes what later Rooms offer and never what a running Room offers. Other designs remain drafts unavailable for Player selection.

**Publish**:
The developer act of releasing a set of saved designs as the Published Avatar Collection for Rooms created from then on.
_Avoid_: Save, deploy

**Player Colour**:
A visual marker assigned to a Player that is distinct from those of other current Players in the same Room. It stays with the Room Membership and does not determine Player identity.
_Avoid_: Player ID

**Room**:
An isolated multiplayer space whose state is shared only among its current players.
_Avoid_: Lobby, channel

**Room Snapshot**:
The current Room state a Player receives on Join or Reconnect, including the public information and private information they are entitled to know.
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
The place inside the Town Hall where Players sit in a circle for the Lobby and Meetings.
_Avoid_: Lobby, Room

**Seat**:
An allocated place for one Player in the Meeting Area, retained from the Lobby into the Game.
_Avoid_: Spawn Point

**Game**:
A contest within a Room between the Mafia and Village factions, beginning with role assignment and ending with a faction's victory.
_Avoid_: Room, Lobby

**Game Roster**:
The record of a Game's original Players and their participation, including those who have been eliminated or forfeited. Leaving the Room does not erase a Player from this record.
_Avoid_: Current Room Memberships

**Faction**:
The side a Player belongs to in a Game: Mafia or Village.
_Avoid_: Role

**Role**:
A Player's assigned identity and abilities within a Game: Mafia, Villager, Doctor, or Sheriff. It is independent of their Avatar Preset.
_Avoid_: Faction, Avatar Preset

**Mafia**:
The faction whose members know one another and collectively choose a Night attack; also the Role held by each member of that faction.

**Village**:
The faction comprising Villagers, the Doctor, and the Sheriff.
_Avoid_: Villager when referring to the entire faction

**Villager**:
A Village Role with no special Night action.
_Avoid_: Village when referring to this Role

**Doctor**:
The Village Role that can protect one living Player from a Night attack, including themselves, but cannot protect the same Player on consecutive Nights.

**Sheriff**:
The Village Role that can investigate another living Player at Night to learn whether they belong to the Mafia faction.

**Night**:
The Game phase in which living Mafia privately discuss and choose an attack, the Doctor chooses protection, and the Sheriff chooses an investigation.

**Meeting**:
The Game phase in which living Players discuss publicly and then vote on whether to eliminate a Player.
_Avoid_: Lobby

**Elimination**:
The loss of a Player's ability to act, chat, or vote in the current Game. Elimination alone does not end Room Membership; the Player may remain to watch public proceedings.
_Avoid_: Leave, Disconnect

**Forfeit**:
A living Player's removal from active Game participation because they Leave or their recovery window expires.
_Avoid_: Disconnect

**Room Code**:
A shareable code that identifies the Room a Player wants to join. Anyone with the code may join while the Room is a Lobby; a started game admits no new Players.
_Avoid_: Lobby code, invite link

**Spawn Point**:
A valid in-room position at which a player may begin a room membership.
_Avoid_: Starting tile

**Join**:
The transition by which a connected Player begins a new Room Membership in a Lobby and receives that Room's current state. Joining is unavailable after the game starts; recovering an existing membership is Reconnect.
_Avoid_: Connect

**Room Membership**:
The period during which a Player belongs to a Room, including a temporary Disconnect while the membership remains recoverable. It ends on Leave or when recovery is no longer available.
_Avoid_: Connection, session

**Disconnect**:
The loss of a Player's network connection without an acknowledged Leave. A Disconnect does not itself end a recoverable Room Membership; switching tabs alone is not a Disconnect.
_Avoid_: Leave, logout

**Leave**:
A player's acknowledged, intentional exit from their current room. Leaving does not trigger automatic reconnection.
_Avoid_: Disconnect, logout

**Reconnect**:
The restoration of a Player's connection after a Disconnect, recovering the existing Room Membership when it remains available.
_Avoid_: New Join
