# Recent worktree consolidation

Target: `live-619e990-tailscale`, starting at `b2d6f12`.

## Integrated work

- Centered Game, Day/Night/Townhall, ballots, Settings, Tasks, proximity text and sounds, and completed Townhall voice were already in the target history. Their feature branches must not replace the newer target tree.
- The Solo Practice branch `implement-39-solo-practice` carries the same implementation already adapted in `643156d`. Its differing lines retain the pre-existing Night-choice additions in the target. Record this equivalent branch as merged without reapplying its older code.
- Imported the short four-Player entry/layout/Leave browser journey from worktree `52d4` into the existing TypeScript Playwright harness. Reuse its endpoint overrides and current accessible region; do not add a second Playwright configuration or duplicate dependencies, layout styles, or Copy code behavior.
- Imported the controlled-clock WebSocket regression for the complete fixed-deadline Day/Night/Townhall cycle and sleeping positions from `52d4`.

## Preserved drafts

Before changing the integration checkout, saved staged and unstaged binary patches and untracked authored files from every dirty worktree under `.scratch/worktree-integration-2026-10-04/` in the main checkout. Other worktrees retain their pending edits.

The integration checkout's staged reverse changes removed newer committed Tasks, sound, proximity and voice work. Restored that checkout to its current branch HEAD after preserving those patches.

The `e664` voice draft contains an alternative authorization controller and dependency manifests, but no `voice/server.mjs` or matching browser consumer. Retained the completed LiveKit implementation and preserved the unfinished alternative. Older planning documents in `2212` and rollback states in `9835` and `924d` are preserved rather than applied over their completed descendants.

## Verification

- Backend: `./mvnw test`, 108 passed.
- Frontend: `npm test`, `npm run typecheck`, `npm run build`.
- Browser: `npm run test:browser -- e2e/game-entry.spec.ts --trace off`, four independent Player contexts using the real backend and frontend. The harness checks `/health` before Create/Join, Ready/Start, centered layout and Leave.
- System temporary storage exceeded its quota. Java and browser runs use a project-local temporary directory; frontend authoring uses the main checkout's Python environment with Pillow.

The full six-minute browser phase-cycle suite and browser media delivery were not rerun for this test-only consolidation.
