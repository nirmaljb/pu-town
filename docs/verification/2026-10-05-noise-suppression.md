# Microphone noise suppression (#52)

Settings remembers the suppression preference and disables its control with an
explicit unsupported message when getSupportedConstraints does not report it.
Supported capture combines suppression with the selected device; changing it
updates the isolated local test and queues current authorized publication capture
without changing device selection, speaking mode or microphone-arming intent.

Frontend checks cover supported/unsupported constraints, storage across reload,
retained device and speaking mode, getUserMedia constraints and an existing local
test stream. Browser automation remains waived; hardware suppression quality and
browser-specific constraint application remain unverified.

Full frontend suite: 98 passed; typecheck and build passed. Standards and Spec
reviews found no remaining findings.
