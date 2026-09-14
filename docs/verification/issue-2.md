# Issue #2 verification — 2026-09-14

The browser check used two actual Phaser clients and the local WebSocket backend. A temporary development page paused `game.loop` with `sleep()` and resumed it with `wake()` after a real timer, while displaying received snapshot/join/departure messages. This characterizes the suspected suspended-frame mechanism; it does not claim to reproduce every browser's automatic background-tab throttling or operating-system suspension policy.

- Baseline commit `00be8c7`: 15 seconds without game frames caused the returning client to close its healthy socket. Its Player ID changed from `4b7d9a23-9c22-4c5f-9b48-0241286bdbbc` to `0a7d8bdc-336c-42f8-8912-a4bd1527e048`, preset changed from `townsperson-5` to `townsperson-6`, and Host transferred. The observer recorded `player_left` followed by `player_joined`.
- Updated client: a 15-second pause resumed with no socket close or replacement snapshot. Both clients retained the same membership.
- Updated client: the repeated 65-second pause (04:25:56–04:27:01 UTC) retained Player ID `96eab978-6c96-4133-8b60-ac6d53a20e1f`, preset `townsperson-4`, Seat and Host. The observer recorded no departure or join, and both clients still showed two Players. An earlier long-pause attempt was invalidated by the previously running backend stopping; both sockets closed and `/health` became unreachable. The backend was restarted before the successful repeat.
- Explicitly closing the updated client's real WebSocket showed the reconnecting overlay and rejoined after approximately 550 ms. The observer recorded the actual departure and replacement membership. This remains the expected pre-#3 behavior: this ticket prevents false Disconnect, while #3–#6 implement membership recovery, refresh/takeover, Host policy, and recovery UX.
- The restarted backend returned `{"status":"healthy"}` from `/health`.

Automated verification: all 39 frontend tests passed, including independent heartbeat operation over two minutes without frames, full and shorter timer suspension, a fresh response deadline, bounded foreground grace, genuine missing-pong failure despite Room traffic, and existing frame ordering/movement-cap tests. Typecheck and production build passed; Vite reported its existing large-bundle advisory. No backend source or wire schema changed in this slice, so backend unit tests were not rerun.

Review: Standards found no introduced violations. Spec review found a shorter-timer-suspension gap; a failing regression test was added, the gap was fixed, and the follow-up review found no remaining substantive issue.
