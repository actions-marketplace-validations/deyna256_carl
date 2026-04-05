# Project structure

## Repository layout

```
carl/
├── action.yml              # GitHub Action metadata — inputs, runtime
├── Justfile                # local development commands
├── src/
│   ├── index.ts            # entry point, orchestration
│   ├── config.ts           # reads carl.yml + carl.md
│   ├── diff.ts             # fetches PR diff, filters files, fetches linked issues
│   ├── ai.ts               # builds prompt, calls OpenRouter
│   └── comment.ts          # posts review comment to GitHub
├── tests/
│   ├── config.test.ts
│   ├── diff.test.ts
│   ├── ai.test.ts
│   └── comment.test.ts
├── docs/
│   ├── config.md           # configuration reference
│   └── structure.md        # this file
├── dist/                   # compiled bundle — committed to repo, built by release workflow
└── .github/
    ├── carl.yml            # carl reviewing its own PRs
    ├── carl.md
    └── workflows/
        ├── carl.yml        # dogfooding workflow
        ├── ci.yml          # lint, typecheck, test, build
        └── release.yml     # build + tag + publish
```

---

## Source modules

### `src/index.ts` — orchestration

Entry point. Reads action inputs, validates the GitHub context, and runs the full pipeline. All error handling lives here — each error type maps to either `core.setFailed()` (hard failure) or a fallback comment (soft failure for OpenRouter outages).

### `src/config.ts` — configuration

Reads and validates `carl.yml` with `js-yaml`. Applies defaults for any missing fields. Reads the guidelines Markdown file. Throws `ConfigError` on any invalid field — which causes a hard failure in `index.ts`.

### `src/diff.ts` — GitHub data

Two responsibilities:

1. **Diff fetching** — paginates `pulls.listFiles` via Octokit, applies glob filters with `micromatch`, builds the diff string.
2. **Linked issue fetching** — queries `closingIssuesReferences` via GraphQL to find issues that this PR closes. No text parsing — uses the official GitHub API.

### `src/ai.ts` — OpenRouter

Builds the prompt from guidelines, PR title/body, linked issue content, and the diff. Calls the OpenRouter Chat Completions API with a 60-second timeout via `AbortController`. Throws `AiError` with the HTTP status code so `index.ts` can distinguish client errors (bad API key → hard fail) from server errors (outage → fallback comment).

### `src/comment.ts` — GitHub review

Posts the review using `pulls.createReview` with `event: 'COMMENT'` — a dismissible formal review rather than a plain issue comment. Also provides `buildFallbackComment` for the outage case.

---

## Data flow

```
action inputs
    │
    ▼
loadConfig()          carl.yml + carl.md
    │
    ▼
getFilteredDiff()     paginated listFiles → micromatch filter → diff string
    │
fetchLinkedIssues()   GraphQL closingIssuesReferences
    │
    ▼
buildPrompt()         guidelines + PR title/body + issues + diff
    │
    ▼
callOpenRouter()      POST /api/v1/chat/completions
    │
    ▼
postReviewComment()   pulls.createReview
```

---

## CI/CD

### `ci` workflow — PR and push to main

Four jobs run in parallel; `build` starts only after all pass:

```
format ─┐
lint    ├─→ build
typecheck┤
test   ─┘
```

### `release` workflow — push `v1.2.3` tag

Runs sequentially: format-check → lint → typecheck → test → build → commit `dist/` to main → force-update semver tag to include dist → update floating major tag (`v1`) → create GitHub Release.

The semver tag trigger uses `v[0-9]+.[0-9]+.[0-9]+` to avoid triggering on floating major tag pushes (`v1`, `v2`).

---

## Tech stack

| Concern        | Tool                    |
| -------------- | ----------------------- |
| Runtime        | Node.js 20              |
| Language       | TypeScript (strict)     |
| GitHub API     | `@actions/github`       |
| HTTP client    | Native `fetch`          |
| Config parsing | `js-yaml`               |
| Glob filtering | `micromatch`            |
| Bundler        | `@vercel/ncc`           |
| Tests          | Vitest                  |
| Lint           | ESLint + typescript-eslint |
| Format         | Prettier                |
| Task runner    | just                    |
