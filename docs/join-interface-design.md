# Join interface design

Design interview complete, awaiting confirmation of shared understanding before implementation. The decisions below are settled.

## Settled decisions

- Opening the game presents an interface requiring a Display Name before creating or joining a Room. Display Names need not be unique and do not represent persistent accounts.
- Each Player receives an automatically assigned colour, unique among current Players in the same Room. Reconnection may assign a different colour. Display Names remain visible alongside colours.
- A Room is the shared game space. Entry starts play immediately, without a waiting area, host privileges, or a Start game action.
- Anyone with a Room Code can join without approval. There is no public Room browser.
- Display the Room Code with a Copy code button. Do not add an invite-link action.
- On disconnection, freeze movement and display a prominent reconnecting overlay. Resume play only after successful rejoin. Allow cancellation back to the join interface.
- Only Create Room creates a Room. Join Room requires an existing code and reports Room not found for an unknown code.
- Trim surrounding whitespace from Display Names and require 1–24 characters. Remember the last submitted Display Name in that browser.
- Detect silent connection loss with a heartbeat. Freeze play after 10 seconds without a response. Attempt reconnection for 30 seconds, then show Retry and Back to join.
- Provide Leave Room, returning to the join interface with the Display Name retained. Intentional leaving does not reconnect automatically.
- Retain an empty Room for 5 minutes, then delete it. Server restart clears Rooms. An expired code reports Room not found and returns the Player to the join interface.
- The server generates 6-character uppercase letter/digit Room Codes, excluding easily confused characters, and prevents collisions with existing Rooms. Accept lowercase code input and trim surrounding whitespace.
- Limit each Room to 8 Players, using a fixed palette of distinct colours. Reject additional joins with Room is full. A disconnect frees the Player's slot; reconnecting can fail if another Player fills it.
- Remove the room and name URL options. They do not prefill the form or bypass it. Prefill the remembered Display Name instead.
- During initial Create or Join, show Connecting, prevent duplicate submissions, and time out after 10 seconds. Preserve the entered name and code, display the failure, and allow retry. Enter the game only after the server confirms Room Membership.

## Confirmation

No product decisions remain open from the interview. Confirm the complete design before implementing it. The existing WebSocket endpoint configuration is infrastructure, separate from the removed room/name entry options.

## Existing behaviour affecting the design

- Joining an unknown Room currently creates it. Empty Rooms remain until server restart.
- Reconnection currently receives a new Player ID and spawn position.
- The game currently joins automatically using URL parameters or defaults.
- A closed socket currently leaves the old world visible and allows local movement; server errors are not displayed.

These are current behaviours, not decisions to preserve.
