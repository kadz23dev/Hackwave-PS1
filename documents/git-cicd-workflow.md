# HealTest Git & CI/CD Workflow Guide
**Branch Policy: Direct Collaboration on `main`**

This document specifies the exact Git workflow, synchronization commands, and standardized commit messages for Member 1 (Backend) and Member 2 (Frontend) collaborating directly on the `main` branch.

---

## 1. Setup: Switch to `main` Branch

Before starting work, ensure your local workspace is on `main`:

```bash
# Check current branch
git branch

# Switch to main
git checkout main

# Pull latest commits from GitHub
git pull origin main
```

---

## 2. Daily Pull & Push Protocol (Per-Task Workflow)

Whenever you complete any task card (e.g., `B01`, `U01`):

### Step 1: Verify All Tests Pass Locally
```bash
npm test
```

### Step 2: Stage Your Changes
```bash
git add .
```

### Step 3: Commit with the Standard Task Format
```bash
git commit -m "feat(<scope>): <Task ID> - <Short Summary>"
```

### Step 4: Pull Before Pushing (Rebase to Avoid Merge Commits)
Since both team members are committing to `main`, always pull before pushing:
```bash
git pull --rebase origin main
```
*(If there are no conflicts, Git cleanly places your commit on top of the latest remote commit).*

### Step 5: Push Directly to `main`
```bash
git push origin main
```

---

## 3. Standard Commit Message Cheatsheet

### ⚙️ Member 1 — Backend & Core Engine Tasks

| Task | Exact Commit Command |
|---|---|
| **B01** | `git commit -m "feat(backend): B01 - implement multi-variant fixture applications server"` |
| **B02** | `git commit -m "chore(backend): B02 - initialize pure JS package toolchain and vitest"` |
| **B03** | `git commit -m "feat(backend): B03 - sqlite database, migrations, append-only triggers"` |
| **B04** | `git commit -m "feat(backend): B04 - intent loader, zod schemas, and deepFreeze immutability"` |
| **B05** | `git commit -m "feat(backend): B05 - playwright session, snapshotter, and content hashing"` |
| **B06** | `git commit -m "feat(backend): B06 - 6-factor element matcher, differ, and change reporting"` |
| **B07** | `git commit -m "feat(backend): B07 - step executor and security guards"` |
| **B08** | `git commit -m "feat(backend): B08 - deterministic backend oracles and verdict engine"` |
| **B09** | `git commit -m "feat(backend): B09 - heuristic planner and baseline first-run pipeline"` |
| **B10** | `git commit -m "feat(backend): B10 - replay engine, inline repair, and flow replan"` |
| **B11** | `git commit -m "feat(backend): B11 - deterministic fresh-context validation loop"` |
| **B12** | `git commit -m "feat(backend): B12 - governance policy, approvals, rollback, and plan reuse"` |
| **B13** | `git commit -m "feat(backend): B13 - 8-act narrated demo automation script"` |

---

### 🎨 Member 2 — Frontend / UI & Dashboard Tasks

| Task | Exact Commit Command |
|---|---|
| **U01** | `git commit -m "feat(ui): U01 - create vanilla CSS design tokens for dark and light themes"` |
| **U02** | `git commit -m "feat(ui): U02 - lightweight node:http static router and csrf security layer"` |
| **U03** | `git commit -m "feat(ui): U03 - governance REST API endpoints"` |
| **U04** | `git commit -m "feat(ui): U04 - dashboard shell, hash router, and D1 overview table"` |
| **U05** | `git commit -m "feat(ui): U05 - D2 screenshots, D3 selector diff, and D4 changes timeline"` |
| **U06** | `git commit -m "feat(ui): U06 - D5 repair preview, D6 governance action controls, and D7 audit trail"` |

---

## 4. GitHub Actions CI/CD Automation

The file [`.github/workflows/ci.yml`](.github/workflows/ci.yml) automatically triggers on every push to `main`:
1. Installs Node.js 22.
2. Installs dependencies (`npm ci` / `npm install`).
3. Installs Playwright Chromium.
4. Executes test suites (`npm test`).
5. Checks dashboard token compliance and traceability tags.

If any test fails on GitHub, the pipeline turns red, showing the exact test that failed.
