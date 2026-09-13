# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `nirmaljb/pu-town`.
Use the `gh` CLI from this repository.

## Conventions

- Create: `gh issue create --title "..." --body-file <path>`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open --json number,title,body,labels`
- Comment: `gh issue comment <number> --body-file <path>`
- Add labels: `gh issue edit <number> --add-label "..."`
- Remove labels: `gh issue edit <number> --remove-label "..."`
- Close: `gh issue close <number>`

For multiline bodies, write the exact text to a temporary file
and pass it with `--body-file`.

The CLI infers the repository from the Git remote.
Use `--repo nirmaljb/pu-town` when running elsewhere.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

Existing local tickets under `.scratch/` remain available as
reference material. This setup does not migrate them.
