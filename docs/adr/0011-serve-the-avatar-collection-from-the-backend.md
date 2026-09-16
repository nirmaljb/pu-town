---
status: accepted
---

# Serve the Avatar Collection from the backend, pinned per Room

Publishing a collection previously reached Players only through a coordinated frontend
and backend release with a backend restart (ADR 0010). The backend now reads the
publication file when it creates a Room and serves that collection, artwork included,
to clients when they join; a Room keeps the collection it was created with for its whole
life. Publishing therefore reaches the next Room created, with no rebuild and no restart.
This trades ADR 0010's build-time bundling — and the ~300KB the client now fetches once
per join instead of receiving in its bundle — for publication that takes effect while the
game is running.

## What this supersedes in ADR 0010

- **Build-time bundling.** The frontend no longer imports the publication file, and the
  backend no longer copies it into its jar as a build resource. The publication file moves
  out of `frontend/src/` into a backend-owned data directory, because nothing in the
  frontend build reads it any more. There is still exactly one publication artifact: the
  backend is now its single reader, which keeps the two catalogues from drifting.
- **Exactly ten presets.** A collection holds at least one preset and has no fixed upper
  bound. Ten was a round number, not a constraint; the chooser grid already scrolls.
- **Private preview then Use character.** Selecting a preset in the chooser now requests it
  from the Room immediately, and the separate Use character button is gone. The Lobby
  already allows unlimited changes, so the extra confirming click bought nothing.

## Rooms pin their collection

A Room resolves the current collection once, at creation. Publishing while Rooms are
running cannot alter a running Room, so no Player's accepted appearance is ever reassigned
or left without artwork, and the collection a Player browses is always the one the Room
will accept. Superseded collections stay in memory only while some Room still references
one; a backend restart already clears Rooms, so nothing needs to outlive the process.

The alternative — swapping collections into running Rooms — was rejected because it
requires reassigning anyone wearing a removed preset, which is a visible, unexplained
appearance change mid-Lobby. Serving removed presets indefinitely was rejected as an
unbounded retention rule with no expiry story.

## Client fetch timing

Clients fetch the collection on join, keyed to the Room's pinned collection, rather than
at page load. At page load a client does not yet know which Room it will enter, so it
cannot know which collection it needs. Fetching at join also overlaps the join screen
instead of delaying it. Every texture and walk animation is still created before the
Phaser scene renders the Room, so nothing downstream has to load artwork on demand.

## Authoring names

Publication no longer refuses names from a slur blocklist; the 1–24 character limit
remains. Preset names are still Player-facing — every Player reads them in their own
chooser — so this moves a content judgement from the tool to the developer authoring the
collection.
