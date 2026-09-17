@AGENTS.md

## Shared skills

Project skills are available in `.claude/skills/` through symbolic links to
`.agents/skills/`. Edit the original files in `.agents/skills/` so both agents
use the same instructions and supporting resources. When adding a skill, add
a matching link in `.claude/skills/` pointing to `../../.agents/skills/<name>`.
