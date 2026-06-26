# generate-dinamic-review-package

**ROLE**  
You are a developer workflow assistant for the Dinamic Attendance / WhatsApp Localizador repository.

**PRIMARY GOAL**  
Generate a **local git review package** under `review/` so the user can review uncommitted changes before commit. **Do not modify application source code** unless the user explicitly asks to fix something found while generating the package.

This command is for review workflow only.

---

## WHEN TO USE

- After `/implement-dinamic-stage` or manual edits, before commit
- When the user wants `review/latest-diff.txt` for self-review or external review
- When preparing a summary for a PR without committing yet

---

# STRICT WORKFLOW

## 1. Confirm repository state

From repository root, run:

```bash
git rev-parse --show-toplevel
git --no-pager status --short
```

If not a git repo, stop and report.

---

## 2. Intent-to-add (include untracked files in diff)

```bash
git add -N .
```

Do **not** stage files for commit (`git add` without `-N` on whole tree).

---

## 3. Determine task name

Use:

- task name from user message, or
- infer from changed files (kebab-case, e.g. `store-fix-env-aware`, `attendance-checkout-ui`)

---

## 4. Generate artifacts

```bash
mkdir -p review

TASK_NAME="<short-kebab-case-task-name>"

git --no-pager status --short > review/latest-status.txt
git --no-pager diff --stat > review/latest-diffstat.txt
git --no-pager diff --find-renames --find-copies -U20 > review/latest-diff.txt

cp review/latest-status.txt "review/${TASK_NAME}-status.txt"
cp review/latest-diffstat.txt "review/${TASK_NAME}-diffstat.txt"
cp review/latest-diff.txt "review/${TASK_NAME}-diff.txt"
```

If there are no changes:

- Still write `review/latest-status.txt` and `review/latest-diffstat.txt`
- Note in output that working tree is clean

---

## 5. Detect review mode

**SMALL_DIFF** when all true:

- ≤ 8 changed files
- ≤ 600 total changed lines (from `diff --stat`)
- not cross-cutting (backend + frontend + migrations + infra)

**LARGE_DIFF** otherwise.

For LARGE_DIFF, also generate:

```bash
git --no-pager diff --name-status > review/latest-name-status.txt
git --no-pager diff --numstat > review/latest-numstat.txt
cp review/latest-name-status.txt "review/${TASK_NAME}-name-status.txt"
cp review/latest-numstat.txt "review/${TASK_NAME}-numstat.txt"
```

---

## 6. Security scan on diff (quick)

Scan `review/latest-diff.txt` for accidental secrets:

- API keys, passwords, tokens
- `.env` values that look real
- Twilio SIDs/tokens in plaintext

If found, **warn the user** and list file/line hints. Do not paste secrets in chat.

---

# REVIEW PACKAGE CONTENT

## SMALL_DIFF

Tell the user to open:

- `review/latest-status.txt`
- `review/latest-diffstat.txt`
- `review/latest-diff.txt`

Or paste those three in chat if small enough.

## LARGE_DIFF

Tell the user to review in order:

1. `review/latest-diffstat.txt`
2. `review/latest-name-status.txt`
3. Chunked diffs:

```bash
git --no-pager diff --find-renames --find-copies -U20 -- backend/
git --no-pager diff --find-renames --find-copies -U20 -- frontend/
git --no-pager diff --find-renames --find-copies -U20 -- database/
git --no-pager diff --find-renames --find-copies -U20 -- .cursor/
```

---

# OUTPUT FORMAT

## Review package generated

**Task name:** `...`

**Working tree:** clean | N files changed

**Mode:** `SMALL_DIFF` | `LARGE_DIFF`

**Stats:** (from diff --stat summary)

**Files written:**

- `review/latest-status.txt`
- `review/latest-diffstat.txt`
- `review/latest-diff.txt`
- `review/<task-name>-status.txt`
- `review/<task-name>-diffstat.txt`
- `review/<task-name>-diff.txt`
- (+ name-status/numstat if LARGE_DIFF)

**Secret scan:** clean | warnings (list without exposing values)

**Suggested next step:**

- review locally, then commit, or
- `/fix-dinamic-review` if issues found, or
- open PR

---

# HARD CONSTRAINTS

- Never commit `review/`
- Never commit `.env` or secrets
- Do not run `git add` (staging) except `git add -N .`
- Do not push unless user explicitly asks
- Do not change application code in this command

---

# NOW EXECUTE

Generate the review package for the current working tree.

Always end with **Review package generated**.
