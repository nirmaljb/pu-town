---
status: accepted
---

# Roam the town with server-owned sight

The Game was a discussion at one table: a timed Night of target lists, then a Meeting. It now plays like Among Us. After the Role Reveal every Player walks a town about twice the size of the screen. The Mafia kill at close range and can Vanish, the Doctor Shields, the Sheriff Scans, and anyone can Report a Body or press the Emergency button in the Town Hall. A Villager who stays beside another Player for too long is pushed away (Crowding). Any of those, or the Roam running out, calls a Meeting, which seats everyone back at their Seat for discussion and voting. Tables of four to ten Players are dealt one, two or three Mafia with one Doctor and one Sheriff.

This supersedes ADR 0013. Movement returns, and so does a narrow form of ADR 0001: the client walks its own Avatar and sends absolute positions with `move`, and the server accepts each only if it is inside the town, clear of every obstacle and within a speed allowance of the last accepted position. It never answers a refused step with an error. It keeps the old position and advances that Player's `correction` counter instead, and the client adopts the kept position when it sees the counter change. The same counter carries the server's own moves: the start of a Roam and a Crowding push.

Sight is the server's, as every other private fact already is. Ten times a second, each Participant receives a `field_state` built for them alone. It holds the Avatars within their Vision, the Bodies within their Vision and their own ability timers. A Vanished Mafia is simply absent from a Village Player's field, and a Ghost from every living Player's. A kill is announced only to the killer, the victim and the Mafia, and the Roster shows the victim as living to everyone else until the Meeting Call reveals every death. Targeted abilities refuse a Player the actor cannot see with the same message as one out of reach, so aiming at a hidden Player reveals nothing. The client's darkness overlay is only presentation, never the enforcement.

The outbound queue stays strictly ordered and still evicts nothing (ADR 0004's coalescing is not restored). A field state is small and replaces nothing in the client, which draws the newest one. A connection too slow for ten a second is closed and recovers a complete snapshot, as any other slow connection is. Field states are built and queued under the Room lock, like every other Game message, and written outside it.

The cost is a server tick per Room during the Roam and client prediction for one Avatar. Restoring the seated-only Game would mean removing `move`, `use_ability` and `field_state` together.
