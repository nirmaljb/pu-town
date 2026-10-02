---
status: accepted
---

# Day, Night and Townhall replace live Roam

The accepted specification in GitHub epic #22 replaces ADR 0015's live hunt with a fixed Day–Night–Townhall cycle: exploration and eventually Tasks by Day, silent private Role choices at Night, and discussion and voting at retained Seats. This trades immediate combat and emergency interruptions for predictable time to explore and simultaneous Night decisions. Ticket #24 establishes the cycle and removes live abilities, Bodies, Report, the Emergency button, Vanish and Crowding; Night choices, Tasks, shared Day Vision, interiors and proximity communication follow in their dependent tickets.

After the eight-second Role Reveal, Day lasts 180 seconds, Night 20, discussion 90, voting 30 and result 6. Each deadline derives from the preceding deadline; private activity cannot shorten Night. Night keeps accepted positions and forbids movement and conversation. Townhall returns Participants to retained Seats; each new Day begins beside those Seats. Position-only recipient field snapshots continue during sleeping Night, including recovery, so a refreshed client never reconstructs positions from public membership data. Role-specific Vision remains until #30 replaces it.

The replacement preserves authoritative movement checks, recipient-specific views, the immutable Game Roster, Disconnect versus Leave, room serialization, bounded ordered outboxes and frame-boundary presentation. The coordinated protocol v1 release removes `use_ability` and all retired field data; old clients must update together with the server. Village elimination victory and Mafia parity still apply; subsequent slices add Night resolution and Task victory without reviving live Roam actions.
