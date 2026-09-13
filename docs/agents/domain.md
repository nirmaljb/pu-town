# Domain Docs

This repository uses a single-context layout:

- `CONTEXT.md`: the canonical domain glossary.
- `docs/adr/`: architectural decisions and their rationale.

## Before exploring

Read root `CONTEXT.md` and the ADRs relevant to the work.
Follow the additional source-of-truth requirements in `AGENTS.md`,
including the WebSocket protocol and README.

If domain documentation is absent, proceed silently.
The domain-modeling skill creates it when terms or decisions
are resolved.

## Use the glossary's vocabulary

Use canonical domain terms in issues, proposals, code, and tests.
Respect distinctions such as Player, Player ID, Display Name,
and Avatar.

When a concept is missing, reconsider the terminology or note
the gap for domain-modeling. Keep implementation details out
of `CONTEXT.md`.

## Flag ADR conflicts

Explicitly identify any proposal that contradicts an existing ADR
and explain why the decision should be reconsidered.
