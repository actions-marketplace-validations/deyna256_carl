# carl

**C**ode **A**utomated **R**eview with **L**LM — a GitHub Action that reviews pull requests using AI via OpenRouter.

## How it works

On every PR open or push, carl:
1. Reads the PR diff
2. Loads review guidelines from `.github/carl.md`
3. Sends both to an LLM via OpenRouter
4. Posts a new review comment on the PR on every run

If the PR diff exceeds the configured token limit, carl fails with an error and skips the review.  
If OpenRouter is unavailable, carl posts a comment indicating it could not complete the review.

## Configuration

### 1. Add your OpenRouter API key to GitHub Secrets

`Settings → Secrets and variables → Actions → New repository secret`

Name: `OPENROUTER_API_KEY`

### 2. Create `.github/carl.yml`

```yaml
model: anthropic/claude-sonnet-4-5  # any OpenRouter-supported model
guidelines: .github/carl.md         # path to your review prompt
max_diff_chars: 20000               # diff size limit in characters; exceeding this fails the action
max_files: 10                        # if exceeded, the review is skipped with an error
ignore:
  - "*.lock"
  - "dist/**"
```

### 3. Create `.github/carl.md` — your review prompt

```md
Review the code for:
- Logic errors and edge cases
- Security issues (hardcoded secrets, injections)
- Missing test coverage for new logic

Ignore stylistic nitpicks unless they affect readability significantly.
```

### 4. Add the workflow

```yaml
# .github/workflows/carl.yml
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: deyna256/carl@v1
        with:
          openrouter-api-key: ${{ secrets.OPENROUTER_API_KEY }}
```

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `openrouter-api-key` | yes | — | Your OpenRouter API key |
| `config-path` | no | `.github/carl.yml` | Path to carl config file |

## Project structure

```
carl/
├── action.yml
├── src/
│   ├── index.ts       # entry point, orchestration
│   ├── config.ts      # reads carl.yml + carl.md
│   ├── diff.ts        # fetches and filters PR diff
│   ├── ai.ts          # calls OpenRouter
│   └── comment.ts     # posts PR review comment
├── tests/
│   ├── config.test.ts
│   ├── diff.test.ts
│   ├── ai.test.ts
│   └── comment.test.ts
└── dist/              # compiled bundle, committed to main
```

## CI

| Job | Trigger | Steps |
|---|---|---|
| `ci` | PR, push to main | lint → typecheck → test → build |
| `release` | push `v*` tag | lint → typecheck → test → build → commit dist/ → create release |

- **Linting:** ESLint + Prettier  
- **Type checking:** `tsc --noEmit`  
- **Tests:** Vitest (unit + snapshot); integration tests (real OpenRouter call, mocked GitHub API) run on main only  
- **Build:** `@vercel/ncc` bundles into `dist/index.js`  
- **Versioning:** semver tags (`v1.0.0`) + floating major tag (`v1` → latest `v1.x`)

## Requirements

- GitHub repository (public or private)
- OpenRouter account with API key
- Any model available on OpenRouter
