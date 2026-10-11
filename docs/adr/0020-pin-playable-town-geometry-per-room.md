---
status: accepted
---

# Pin playable town geometry per Room

The Host chooses Sunwater Village, Blackthorn Hollow or Neon Ward in the Lobby; Start fixes that choice for the Game and recovery retains it. Each Game uses its chosen town's collision, interiors and Task points for movement, recipient visibility and Hearing, rather than treating map selection as client-only scenery. This extends ADR 0019's alternative designs into playable towns while preserving its shared bounds and Seat circle.

Publish the same generated geometry into backend resources and frontend map assets. Keeping packaged geometry makes startup and play independent of an authoring service, at the cost of coordinated publication and client/server release. The full-town overview contains terrain, the recipient's own position and personal Task points; it never requests or draws additional Participants. Opening it stops local movement, while the server clock continues.
