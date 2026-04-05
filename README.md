# carl

**C**ode **A**utomated **R**eview with **L**LM — a GitHub Action that reviews pull requests using AI via OpenRouter.

## How it works

On every PR open or push, carl:

1. Reads the PR diff
2. Fetches the linked issue (via GitHub GraphQL) to understand the task being solved
3. Loads review guidelines from `.github/carl.md`
4. Sends diff + PR context + issue to an LLM via OpenRouter
5. Posts a new review comment on the PR on every run

If the PR diff exceeds the configured token limit, carl fails with an error and skips the review.  
If OpenRouter is unavailable, carl posts a comment indicating it could not complete the review.

## Configuration

### 1. Add your OpenRouter API key to GitHub Secrets

`Settings → Secrets and variables → Actions → New repository secret`

Name: `OPENROUTER_API_KEY`

### 2. Create `.github/carl.yml`

```yaml
model: anthropic/claude-sonnet-4-5 # any OpenRouter-supported model
guidelines: .github/carl.md # path to your review prompt
max_diff_chars: 20000 # diff size limit in characters; exceeding this fails the action
max_files: 10 # if exceeded, the review is skipped with an error
ignore:
  - '*.lock'
  - 'dist/**'
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

| Input                | Required | Default              | Description                                      |
| -------------------- | -------- | -------------------- | ------------------------------------------------ |
| `openrouter-api-key` | yes      | —                    | Your OpenRouter API key                          |
| `github-token`       | no       | `${{ github.token }}` | GitHub token with `pull-requests: write` permission |
| `config-path`        | no       | `.github/carl.yml`   | Path to carl config file                         |

### Private repositories

The default `github.token` only works in **public** repositories. For private repositories, create a [fine-grained PAT](https://github.com/settings/personal-access-tokens/new) with:

- **Repository access:** your target repository
- **Permissions:** `Contents` → Read-only, `Pull requests` → Read and write

Add it as a secret (e.g. `GH_PAT`) and pass it explicitly:

```yaml
steps:
  - uses: actions/checkout@v4
    with:
      token: ${{ secrets.GH_PAT }}
  - uses: deyna256/carl@v1
    with:
      openrouter-api-key: ${{ secrets.OPENROUTER_API_KEY }}
      github-token: ${{ secrets.GH_PAT }}
```

## Project structure

```
carl/
├── action.yml
├── Justfile
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

## Development

Requires [just](https://github.com/casey/just).

| Command             | Description                      |
| ------------------- | -------------------------------- |
| `just lint`         | Run ESLint                       |
| `just format`       | Format with Prettier             |
| `just format-check` | Check formatting without writing |
| `just typecheck`    | Run `tsc --noEmit`               |
| `just test`         | Run Vitest                       |
| `just build`        | Bundle with `@vercel/ncc`        |

## CI

### `ci` — PR and push to main

Five jobs run in parallel; `build` starts only after all pass:

```
format ─┐
lint    ├─→ build
typecheck┤
test   ─┘
```

### `release` — push `v*` tag

Sequential: format-check → lint → typecheck → test → build → commit `dist/` → create release

- **Linting:** ESLint + Prettier
- **Type checking:** `tsc --noEmit`
- **Tests:** Vitest (unit + snapshot)
- **Build:** `@vercel/ncc` bundles into `dist/index.js`
- **Versioning:** semver tags (`v1.0.0`) + floating major tag (`v1` → latest `v1.x`)

## Requirements

- GitHub repository (public or private)
- OpenRouter account with API key
- Any model available on OpenRouter
