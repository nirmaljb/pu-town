# Task workload tuning (#56)

The controlled-clock WebSocket measurement drives four through ten connected
Players concurrently through accepted 16-pixel moves every 100 ms, navigates the
existing collision map and same-area Task range, submits correct sequence values,
and waits for authoritative interaction timers. It completes all Village original
assignments through public requests and observes immediate Village victory. No
Mafia choices, ballots, elimination, Forfeits or conversation delays are modeled.
This is an optimistic automated movement simulation, not a human playtest.

Before tuning, all seven Player counts completed in round one. Concurrent travel
was 32–35.9 seconds; timed work added 18 seconds. Three assignments still contain
nine earned stages: three repair, four sequence, two pickup/delivery. The tuned
120-second interaction at every stage leaves travel time within a three-minute
Day and permits one earned stage per Day in this focused scenario. Pending work
is canceled by phase changes while earned stages remain. It does not add a round
quota, deadline, failure penalty or delayed victory.

| Players | Before rounds | Tuned rounds | Tuned concurrent travel | Time to immediate victory |
| --- | --- | --- | --- | --- |
| 4 | 1 | 9 | 88.4 s | 45 min 31.3 s |
| 5 | 1 | 9 | 69.6 s | 45 min 31.3 s |
| 6 | 1 | 9 | 86.4 s | 45 min 31.3 s |
| 7 | 1 | 9 | 86.4 s | 45 min 31.3 s |
| 8 | 1 | 9 | 86.4 s | 45 min 31.3 s |
| 9 | 1 | 9 | 99.5 s | 45 min 31.3 s |
| 10 | 1 | 9 | 99.5 s | 45 min 31.3 s |

Travel rises because every new Day restores retained Seats. The final delivery
returns to the same ledger location, so final victory time is identical. Nine
complete cycles would take longer; victory here ends during the ninth Day.

The benchmark has perfect cooperation and successful navigation, with no human
reaction delay. Interrupted two-minute work, social play and transferred Forfeit
assignments can extend completion beyond ten rounds; faction victory can end it
much earlier. A stage's long stationary interaction is an intentional initial
tuning tradeoff, requiring human feedback before asserting balanced or enjoyable
play. The user waived browser automation; no human nine-round playtest is claimed.

Backend full suite: 119 passed, including all count measurements, exact timing,
Ghost earned steps, Forfeit accounting, Fake Task privacy and immediate victory.
Frontend full suite: 103 passed; typecheck and production build passed. Clients
already render the server timer, so the timing change needs no hard-coded client
constant or wire-shape change. Protocol and gameplay documentation were updated.
