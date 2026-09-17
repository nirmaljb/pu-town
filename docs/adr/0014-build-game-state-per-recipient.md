---
status: accepted
---

# Build Game state per recipient and let the server own the clock

A Mafia Game is defined by what each Player is not allowed to know. The server therefore builds a separate `game_state` for every recipient: the shared parts — phase, round, countdown, Roster, outcome, disclosed ballots, winner — are identical for everyone, and `self` contains that recipient's own Role, team, locks and private results and nothing else. A recipient who is not Mafia receives `mafiaTeam: null`, not a filtered list. Client-side concealment is never the enforcement, so a client that draws everything it receives still cannot reveal a Role.

This has a consequence that is easy to get wrong: broadcasting the whole Game to everyone whenever any Player acts would leak hidden activity through the countdown alone, because a fresh `remainingMs` arriving mid-Night tells every recipient that someone just acted. An accepted choice therefore updates only the recipients whose authorized view actually changed — an accepted Mafia vote reaches the living Mafia, and a protection, investigation or ballot reaches only its submitter.

The server also owns the clock. Phases advance on fixed durations checked by a periodic sweep, never on everyone having acted, and each new deadline is derived from the deadline it replaces rather than from the current time. A Player who reconnects after several phases elapsed receives the current phase with a correct countdown and no replayed transitions, and no client's clock can hurry or delay a Night. Every submission carries the round it was chosen in, so a choice that arrives after its phase ended is rejected instead of being applied to the next one.

The cost is that `game_state` is built once per recipient rather than serialized once per Room, and that tests must assert the absence of private fields per recipient rather than inspecting one shared payload. Both are accepted: ten recipients is the maximum, and a test that watches every payload a connection ever received is the only honest way to prove a Role stayed private.
