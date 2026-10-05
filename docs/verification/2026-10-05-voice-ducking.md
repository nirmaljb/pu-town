# Effects and ambience ducking (#53)

Authorized voice activity lowers effects and ambience to a quarter of their
saved level, with short attack and release ramps. Master and voice volumes stay
independent. Slider edits while ducked are saved normally and restored to their
new value when activity ends. Voice output muted by its saved volume cannot drive
remote-voice ducking. Local authorized speaking can still duck nearby effects.

Only current server-authorized audible speakers drive ducking. Vision separately
filters speaking dots, so an audible speaker outside Vision can be heard without
an Avatar indicator. Distant, other-area, sleeping, disconnected and eliminated
speakers cannot drive this state. Grant loss immediately restores levels.

Tests verify saved volumes, edits during activity, restoration and hearing versus
Vision privacy. Full frontend suite: 100 passed; typecheck and build passed.
Browser automation remains waived; listening-quality acceptance is unverified.
