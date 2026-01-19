# Ralphy

[![npm version](https://img.shields.io/npm/v/ralphy-cli.svg)](https://www.npmjs.com/package/ralphy-cli)

![Ralphy](assets/ralphy.jpeg)

Autonomous AI coding loop. Runs AI agents on tasks until done.

## Install

**Option A: [npm](https://www.npmjs.com/package/ralphy-cli)** (recommended)
```bash
npm install -g ralphy-cli

# Then use anywhere
ralphy "add login button"
ralphy --prd PRD.md
```

**Option B: Clone**
```bash
git clone https://github.com/michaelshimeles/ralphy.git
cd ralphy && chmod +x ralphy.sh

./ralphy.sh "add login button"
./ralphy.sh --prd PRD.md
```

Both versions have identical features. Examples below use `ralphy` (npm) - substitute `./ralphy.sh` if using the bash script.

## Two Modes

**Single task** - just tell it what to do:
```bash
ralphy "add dark mode"
ralphy "fix the auth bug"
```

**Task list** - work through a PRD:
```bash
ralphy              # uses PRD.md
ralphy --prd tasks.md
```

## Project Config

Optional. Stores rules the AI must follow.

```bash
ralphy --init              # auto-detects project settings
ralphy --config            # view config
ralphy --add-rule "use TypeScript strict mode"
```

Creates `.ralphy/config.yaml`:
```yaml
project:
  name: "my-app"
  language: "TypeScript"
  framework: "Next.js"

commands:
  test: "npm test"
  lint: "npm run lint"
  build: "npm run build"

rules:
  - "use server actions not API routes"
  - "follow error pattern in src/utils/errors.ts"

boundaries:
  never_touch:
    - "src/legacy/**"
    - "*.lock"
```

Rules apply to all tasks (single or PRD).

## AI Engines

```bash
ralphy              # Claude Code (default)
ralphy --opencode   # OpenCode
ralphy --cursor     # Cursor
ralphy --codex      # Codex
ralphy --qwen       # Qwen-Code
ralphy --droid      # Factory Droid
```

## Task Sources

**Markdown** (default):
```bash
ralphy --prd PRD.md
```
```markdown
## Tasks
- [ ] create auth
- [ ] add dashboard
- [x] done task (skipped)
```

**YAML**:
```bash
ralphy --yaml tasks.yaml
```
```yaml
tasks:
  - title: create auth
    completed: false
  - title: add dashboard
    completed: false
```

**GitHub Issues**:
```bash
ralphy --github owner/repo
ralphy --github owner/repo --github-label "ready"
```

## Parallel Execution

```bash
ralphy --parallel                  # 3 agents default
ralphy --parallel --max-parallel 5 # 5 agents
```

Each agent gets isolated worktree + branch:
```
Agent 1 → /tmp/xxx/agent-1 → ralphy/agent-1-create-auth
Agent 2 → /tmp/xxx/agent-2 → ralphy/agent-2-add-dashboard
Agent 3 → /tmp/xxx/agent-3 → ralphy/agent-3-build-api
```

Without `--create-pr`: auto-merges back, AI resolves conflicts.
With `--create-pr`: keeps branches, creates PRs.

**YAML parallel groups** - control execution order:
```yaml
tasks:
  - title: Create User model
    parallel_group: 1
  - title: Create Post model
    parallel_group: 1  # same group = runs together
  - title: Add relationships
    parallel_group: 2  # runs after group 1
```

## Branch Workflow

```bash
ralphy --branch-per-task                # branch per task
ralphy --branch-per-task --create-pr    # + create PRs
ralphy --branch-per-task --draft-pr     # + draft PRs
ralphy --base-branch main               # branch from main
```

Branch naming: `ralphy/<task-slug>`

## Options

| Flag | What it does |
|------|--------------|
| `--prd FILE` | task file (default: PRD.md) |
| `--yaml FILE` | YAML task file |
| `--github REPO` | use GitHub issues |
| `--github-label TAG` | filter issues by label |
| `--parallel` | run parallel |
| `--max-parallel N` | max agents (default: 3) |
| `--branch-per-task` | branch per task |
| `--base-branch NAME` | base branch |
| `--create-pr` | create PRs |
| `--draft-pr` | draft PRs |
| `--no-tests` | skip tests |
| `--no-lint` | skip lint |
| `--fast` | skip tests + lint |
| `--no-commit` | don't auto-commit |
| `--max-iterations N` | stop after N tasks |
| `--max-retries N` | retries per task (default: 3) |
| `--retry-delay N` | seconds between retries |
| `--dry-run` | preview only |
| `-v, --verbose` | debug output |
| `--init` | setup .ralphy/ config |
| `--config` | show config |
| `--add-rule "rule"` | add rule to config |

## Requirements

**Required:**
- AI CLI: [Claude Code](https://github.com/anthropics/claude-code), [OpenCode](https://opencode.ai/docs/), [Cursor](https://cursor.com), Codex, Qwen-Code, or [Factory Droid](https://docs.factory.ai/cli/getting-started/quickstart)

**npm version (`ralphy-cli`):**
- Node.js 18+ or Bun

**Bash version (`ralphy.sh`):**
- `jq`
- `yq` (optional, for YAML tasks)
- `bc` (optional, for cost calc)

**Both versions:**
- `gh` (optional, for GitHub issues / `--create-pr`)

## Engine Details

| Engine | CLI | Permissions | Output |
|--------|-----|-------------|--------|
| Claude | `claude` | `--dangerously-skip-permissions` | tokens + cost |
| OpenCode | `opencode` | `full-auto` | tokens + cost |
| Codex | `codex` | N/A | tokens |
| Cursor | `agent` | `--force` | duration |
| Qwen | `qwen` | `--approval-mode yolo` | tokens |
| Droid | `droid exec` | `--auto medium` | duration |

---

## Changelog

### v4.1.0
- TypeScript CLI: `npm install -g ralphy-cli`
- cross-platform binaries (macOS, Linux, Windows)
- no dependencies on jq/yq/bc for npm version

### v4.0.0
- single-task mode: `ralphy "task"` without PRD
- project config: `--init` creates `.ralphy/` with rules + auto-detection
- new: `--config`, `--add-rule`, `--no-commit`

### v3.3.0
- Factory Droid support (`--droid`)

### v3.2.0
- Qwen-Code support (`--qwen`)

### v3.1.0
- Cursor support (`--cursor`)
- better task verification

### v3.0.0
- parallel execution with worktrees
- branch-per-task + auto-PR
- YAML + GitHub Issues sources
- parallel groups

### v2.0.0
- OpenCode support
- retry logic
- `--max-iterations`, `--dry-run`

### v1.0.0
- initial release

## Community

- [Discord](https://rasmic.link/discord)

## License

MIT
