# Microphone selection and local test (#50)

Settings lists audio input devices, remembers selection, and falls back to the
system default when a remembered device is absent. Capture denial leaves the
Game, listening and text available. Device changes restart only an authorized
active microphone with the selected capture constraints.

The local test suspends existing publication before requesting its own isolated
stream. It connects only to an input-level analyser, with no output or publisher.
Closing Settings, changing device or stopping the test stops every test track.
A canceled outstanding permission request cannot retain capture after completion.

Frontend lifecycle tests verify unavailable-device fallback, isolated capture,
publication-suspension ordering, late permission cancellation and denial. Browser
automation remains waived; physical-device selection and microphone meter
acceptance remain unverified.

Full frontend suite: 93 tests passed. Typecheck and production build passed.

Review fixes guard canceled work before getUserMedia, ignore stale Settings
responses, and avoid reopening a newly enabled track. The early-cancellation
regression failed before the fix and passed afterwards. Full frontend suite:
94 passed, with typecheck and build. No documented Standards breaches found.
