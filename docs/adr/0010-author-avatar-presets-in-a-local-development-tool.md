---
status: superseded in part by ADR-0011
---

# Author Avatar Presets in a local development tool

Developers will compose cosmetic Avatar Presets in a local parts-based editor with hair, face, clothing, colour controls, and an animated preview. Designs are saved into the project, and one shared collection of exactly ten presets is released with the game; additional designs remain drafts. This chooses a development-time authoring boundary over an online editor with developer accounts, trading immediate online publication for a simpler release workflow without a runtime authoring service.

Players will select from that collection in the Lobby, and multiple Players may select the same preset. The implementation provides a local Python/Pillow workshop and a shared publication artifact. The game randomly assigns a published preset on arrival and accepts cosmetic changes while the Room remains in its Lobby.

## Authoring and publication boundary

The initial editor offers curated compatible body/skin, hair, face, top, bottom, and footwear parts with supported colour choices. Developers add source parts through the project. The preview covers standing, walking, and sitting in all four directions; existing seated rendering must remain compatible with the authored appearance.

Developers can create, duplicate, name, edit, and delete drafts. Editing a published design saves a draft without changing the published appearance. An explicit Publish collection action validates and saves exactly ten complete designs in developer-chosen order for the next game release. This keeps draft iteration separate from the artifacts used by Players.

## Selection and membership

A panel beside the Meeting Area provides a private preview on selection; Use character applies the choice and shares it with the Room. Players can change repeatedly during the Lobby without changing Ready. Start locks the last server-accepted selection; a selection arriving after Start cannot change it. The server continues to own Room transitions, with shared changes applied by clients at game-frame boundaries.

New memberships receive a random published preset, so selection is optional and the existing Host Start rules remain unchanged. The accepted choice belongs to the Room Membership and survives Disconnect and same-tab refresh under ADR 0008. Intentional Leave ends that selection; a new membership draws randomly again. This extends Lobby appearance from a fixed assignment to a mutable cosmetic choice while preserving recovery identity and the existing membership lifetime.

## Initial collection and labels

Keep the existing LPC pixel-art style. Recreate the six current presets as editable designs and add four distinct designs for the initial collection. Each preset has a short Player-facing name shown beneath its chooser thumbnail and in its preview; the in-world label remains the Player's Display Name. Renaming a preset preserves its internal identity.

## Release compatibility

Collections change only through a coordinated frontend/backend release with a backend restart, which already clears Rooms in the current system. Running Rooms never receive live collection changes. Exclude the editor and unpublished drafts from the Player build. This avoids migrating retained membership appearances across collection revisions at the cost of requiring a release for publication to reach Players.

All interview decisions above are accepted. The agreed design and approved testing coverage are published in [implementation specification #7](https://github.com/nirmaljb/pu-town/issues/7), labelled ready-for-agent. The protocol documentation, README and operational guidance now describe the implemented behavior. Both builds consume one atomically replaced publication file containing metadata and embedded artwork, avoiding separate frontend/backend catalogues drifting during publication. Deployment still requires a coordinated release and backend restart.
