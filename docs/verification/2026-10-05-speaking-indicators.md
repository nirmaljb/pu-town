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

Frontend full suite: 90 passed, typecheck and build passed. Backend full suite:
110 passed. Standards found no documented breaches. The Spec review found that
a local mute or one unsubscription cleared unrelated Townhall dots; both now
remove only the affected Participant from the cached activity.

The extended native Day verifier passed with real SDK active-speaker events
carrying the authorized publisher Player ID while nearby PCM flowed. Foreign
subscription denial and movement/stale-token removal still passed. This confirms
media activity metadata, without asserting browser dots or microphone behavior.
