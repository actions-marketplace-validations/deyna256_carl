# Configuration

## `carl.yml`

carl looks for this file at `.github/carl.yml` by default. Override the path via the `config-path` action input.

```yaml
model: anthropic/claude-sonnet-4-5  # any OpenRouter model ID
guidelines: .github/carl.md         # path to your review prompt
max_diff_chars: 20000               # hard limit on diff size in characters
max_files: 10                       # hard limit on number of changed files
ignore:                             # glob patterns — matched files are excluded from the diff
  - '*.lock'
  - 'dist/**'
```

### Fields

| Field            | Default                    | Description                                                                                      |
| ---------------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| `model`          | `anthropic/claude-sonnet-4-5` | Any model ID from [openrouter.ai/models](https://openrouter.ai/models)                        |
| `guidelines`     | `.github/carl.md`          | Path to the Markdown file containing your review prompt                                          |
| `max_diff_chars` | `20000`                    | If the diff exceeds this character count, carl fails the action and skips the review             |
| `max_files`      | `10`                       | If the PR touches more files than this (after ignore filtering), carl fails and skips the review |
| `ignore`         | `[]`                       | Glob patterns (via [micromatch](https://github.com/micromatch/micromatch)) to exclude files      |

### Limits behaviour

Both `max_diff_chars` and `max_files` are hard limits — carl calls `core.setFailed()` and exits. This keeps costs predictable and prevents runaway token usage on large PRs. Use `ignore` to exclude generated files, lock files, and build artifacts before the limits are applied.

---

## `carl.md` — the review prompt

This file is your system prompt. The model receives it as instructions before seeing the diff.

carl automatically prepends context about the PR:

```
PR title: feat: add Redis cache
PR description: Implements exact-match caching for /ask responses.

Linked issue #12: Cache responses to reduce OpenRouter costs
Users are hitting the API repeatedly with identical prompts...

Review the following diff:
```diff
...
```
```

So your guidelines can reference "the linked issue" and the model will know what you mean.

### Example guidelines

```md
## Priority 1 — Task completion
State whether the PR fully, partially, or does not solve the linked issue. If partial, say what's missing.

## Priority 2 — Correctness
- Logic errors and edge cases (null/undefined, empty arrays, off-by-one)
- Missing error handling — errors must not be silently dropped
- Security issues: hardcoded secrets, injection risks, sensitive data in logs

## Priority 3 — Test coverage
Flag new logic paths that have no corresponding test.

## Skip
Formatting and style — handled by the linter.
```

---

## Action inputs

| Input                | Required | Default               | Description                                         |
| -------------------- | -------- | --------------------- | --------------------------------------------------- |
| `openrouter-api-key` | yes      | —                     | Your OpenRouter API key                             |
| `github-token`       | no       | `${{ github.token }}` | GitHub token with `pull-requests: write` permission |
| `config-path`        | no       | `.github/carl.yml`    | Path to carl config file                            |

---

## Private repositories

The default `github.token` only has access to the repository it runs in. For private repositories inside an organization, you need a token with explicit access.

Create a [fine-grained PAT](https://github.com/settings/personal-access-tokens/new):

- **Repository access:** select your target repository
- **Permissions:**
  - `Contents` → Read-only
  - `Pull requests` → Read and write

Add it as a secret (e.g. `GH_PAT`) and pass it to both `actions/checkout` and carl:

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

The workflow also needs `issues: read` if you want carl to fetch linked issue content (which it does by default):

```yaml
permissions:
  pull-requests: write
  issues: read
```
