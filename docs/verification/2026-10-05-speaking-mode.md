# Speaking mode and push-to-talk (#51)

Settings remembers open microphone or push-to-talk and a configurable letter,
digit, Space or Shift key. Voice controls arm the microphone separately from
mode selection. Push-to-talk starts only for an authorized publication and an
unblocked key press. Release, blur, hidden document, text focus, Settings,
configuration changes and grant loss clear held input. Release also immediately
mutes an existing capture track; queued capture checks intent again after
asynchronous work so a late permission response cannot keep transmission on.

Frontend tests cover blocked/repeated/wrong keys, release, reset and changed-key
ownership, and persistence through device selection/reload. Browser automation
remains waived; physical key-to-microphone latency and browser permission dialogs
remain unverified. The existing server permissions remain independent of local
mode and are covered by the backend voice policy and WebSocket suites.

Full frontend suite: 96 passed; typecheck and production build passed.
