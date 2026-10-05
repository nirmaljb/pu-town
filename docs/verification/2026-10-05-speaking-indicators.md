# Authorized speaking indicators (#49)

The server supplies publisher Player IDs as immutable media names. Hidden
receive-only listeners have no name. SDK speaker activity stays in local media
state until the Phaser frame samples it against current membership, living
status, phase, Day visibility and server-issued hearing peers. Avatar dots are
updated in that frame; mute, unsubscription, grant loss and recovery clear them.

Tests cover hidden/distant/Ghost/sleeping speakers, private hearing loss,
Townhall activity, disconnected membership and absent recovery grants. The
backend asserts server-owned publisher identity. Browser automation remains
waived by the user; physical microphone and visual multi-browser acceptance
remain unverified.
