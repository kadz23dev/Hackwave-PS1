# HealTest — Product Requirements Document (build-level detail)

**Version:** 1.0 · 11 Oct 2026
**Inputs:** `ps.md` (problem statement + seven features) and `harness.md` (Antigravity build harness).
**Audience:** coding agents on lower-tier models (Antigravity Flash/Pro) and the humans supervising them.
**Companion:** `HealTest-WORKSPLIT.md` (one task card per backlog item T01–T22, M01–M05, and the human Phase 0).

> This PRD **replaces** the earlier `self-healing-tests-PRD-prompt.md` (which was Python-based). Where this file and `harness.md` disagree, this file states the resolution explicitly in §17 "Harness gaps resolved". Once humans accept them, copy §5–§12 into `docs/contract.md` and lock it.

---

## HOW A CODING AGENT MUST READ THIS DOCUMENT

1. Read only the sections your task card names. Do not read the whole file every time.
2. Names in `code font` (files, functions, types, JSON keys, table columns, CSS tokens) are **exact**. Do not rename them.
3. "MUST" is mandatory. "SHOULD" is the default unless a test proves it impossible. "MAY" is optional.
4. If something is ambiguous, do **not** invent behaviour. Write `BLOCKED: <question>` in `ralph/progress.md` and stop.
5. Never weaken a test, never edit a locked path (`harness.md` §5, invariant 1), and never let an LLM produce a verdict.

---

## 1. Problem

End-to-end (E2E) tests written as selectors (`click("#checkout-button")`) break whenever the UI is renamed, moved or redesigned, even when the user's workflow still works. Teams spend time repairing selectors instead of checking product behaviour. Worse, naive "AI self-healing" tools fix *everything*, including genuine bugs. They find another path, see "Order confirmed" on screen, and report success while the backend failed.

## 2. Product vision

**HealTest** is an intent-aware E2E testing and governance platform.

- A test is an **intent**: a goal, approved test data, and expected outcomes written in **backend terms**.
- HealTest finds the UI actions itself, stores them as a **step plan**, and replays the plan on later runs.
- When the UI changes, it **detects** the break, **explains** it from evidence, **proposes a repair** that may only use elements it actually observed, **validates** the repair with deterministic oracles, routes it for **approval** when policy demands, **stores** everything in an append-only history, and **reuses** validated repairs with zero LLM calls.
- It **never** heals over a real application failure. Verdicts come only from deterministic oracles (backend state and network status), never from an LLM and never from UI text alone.

**Pipeline (one workflow, not seven products):**

```
Detect → Explain → Propose repair → Validate → Approve → Store → Reuse
```

**Tagline:** *Steps may heal. Outcomes may not.*

## 3. Users and primary use cases

| User | Wants | HealTest gives |
|---|---|---|
| QA / SDET | Tests that survive redesigns | Intent files, automatic repair, verdicts with exit codes |
| Developer | To know if their PR broke a flow or just moved a button | Change report: HARMLESS_UI vs BREAKING_UI vs APP_BUG |
| Tech lead / reviewer | Control over what the AI changed | Dashboard: diff, repair preview, approve/reject/rollback, audit trail |
| AI client (P1) | To inspect and trigger HealTest | MCP server (read-only server + operator server) |

## 4. Scope

**P0 (MVP, the demo):** change detection, repair engine, deterministic validation, guardrails G1–G7, SQLite history, dashboard D1–D7, CLI, demo script, scenarios A/B/C.
**P1:** MCP servers (M01–M03), plugin host + one GitHub-issue plugin (M04–M05).
**P2 / non-goals:** editing the target app's source code (only a proposed PR, P2), Slack/CI/IDE plugins, scheduled monitoring, pixel-level visual diff, multi-browser support, login flows.

**Decision settled (ps.md §9):** "Fix" means **repair the test automation**. HealTest never writes to the target application's files.

---

## 5. Tech stack (exact)

| Concern | Choice | Notes |
|---|---|---|
| Runtime | Node 22, ESM (`"type": "module"`) | |
| Language | TypeScript `strict: true`, target ES2022, module NodeNext | `tsc` builds `src/` → `dist/` |
| Browser | `playwright` (Chromium only) | `npx playwright install chromium` once |
| DB | `better-sqlite3` | synchronous, file at `.healtest/healtest.sqlite` |
| Schemas | `zod` | every external input (YAML, LLM JSON, HTTP body) is parsed with zod |
| YAML | `yaml` | intent files |
| CLI | `commander` | |
| LLM (fallback only) | `@google/genai`, model from env `HEALTEST_LLM_MODEL` (default `gemini-2.5-flash`) | verify the SDK method names with a 5-line script before using them |
| HTTP server | `node:http` (no Express) | API + static dashboard, bound to `127.0.0.1` |
| Tests | `vitest` | `tests/unit`, `tests/integration`, `tests/guardrails` |
| Lint | `eslint` + `typescript-eslint` | `--max-warnings 0` |
| Dev runner | `tsx` | for scripts during development only |
| Dashboard | plain HTML/CSS/JS | no framework, bundler, CDN or web fonts |

Allowed dependencies: exactly the packages above, plus `@types/node` and `@types/better-sqlite3`. Anything else needs a one-line justification in `ralph/progress.md` (AGENTS.md invariant 11).

**`package.json` scripts.** These add to the ones in harness §10.1:
```json
{
  "build": "tsc -p tsconfig.json",
  "demo": "npm run build && node dist/demo.js",
  "serve": "npm run build && node dist/cli.js serve",
  "healtest": "node dist/cli.js",
  "fixtures": "node fixtures/server.mjs --all"
}
```

---

## 6. System architecture

```
                        intents/checkout.intent.yaml  (human, locked, sha256)
                                      │
 ┌────────────────────────────────────▼─────────────────────────────────────┐
 │ pipeline/run.ts  (orchestrator — one call = one CLI `run`)               │
 │                                                                          │
 │  intent/load ─► browser/session ─► snapshot/capture ─► governance/reuse  │
 │                        │                                   │ plan?       │
 │          no plan ──────┼─────────────── plan ──────────────┘             │
 │             ▼          ▼                                                 │
 │       planner/plan   executor/replay ──fail──► diff/differ ─► change rpt │
 │             │          │                           │                     │
 │             │          │                    match/matcher                │
 │             │          │            single │ ambiguous │ none            │
 │             │          │      repair-match │ NEEDS_REV │ planner(tail)   │
 │             ▼          ▼                   ▼           ▼                 │
 │        oracle/runner (backend_state, network_status, dom_state*)         │
 │                                 │                                        │
 │        validate/validation (fresh context, strict replay, oracles)       │
 │                                 │                                        │
 │        classify/verdict ─► explain/templates ─► governance/policy        │
 │                                 │                                        │
 │        db/repo  (append-only audit, change→repair→validation links)      │
 └─────────────────────────────────┬────────────────────────────────────────┘
                                   │
                  server/api (127.0.0.1, CSRF) ─► dashboard/ (D1–D7)
                                   │
                          P1: mcp/readonly, mcp/operator, plugins/github-issue
```
`*` dom_state oracles are supporting evidence only and never sufficient on their own (G5).

### 6.1 Source layout (exact)

```
src/
  cli.ts                  commander entry: scan, run, diff, repair, validate, approve, reject, rollback, report, serve
  demo.ts                 narrated demo (§14)
  config.ts               paths, env vars, numeric constants (§10.6)
  types.ts                zod schemas + inferred TS types (§7)
  db/
    index.ts              open DB, run migrations, export `db`
    migrations/001_init.sql        DDL from harness §13.2 (unchanged)
    migrations/002_plans.sql       additions from §8.2
    repo.ts               ALL reads/writes; each state change = 1 transaction + 1 audit_log row
  intent/load.ts          parse YAML → zod → sha256 → deepFreeze
  browser/session.ts      launch Chromium, context, page, network capture
  snapshot/capture.ts     page → PageSnapshot (§9.1)
  snapshot/hash.ts        contentHash (§9.2)
  match/text.ts           normalize, tokenSetRatio, levenshteinRatio
  match/synonyms.ts       synonym groups
  match/score.ts          similarity(target, element) (§10.1)
  match/matcher.ts        findReplacement(target, snapshot) → single | ambiguous | none (§10.2)
  diff/differ.ts          diffSnapshots(base, head) → ChangeItem[] (§10.3)
  diff/severity.ts        severity rules
  diff/report.ts          buildChangeReport(...)
  executor/executor.ts    executeStep(page, step, element, intent)
  executor/guards.ts      URL allowlist, action budget, data-key check, forbidden-name check
  oracle/runner.ts        runOracles(intent, target, networkLog, page) → OracleResult[]
  planner/lexicon.ts      field and button lexicons (§10.4)
  planner/heuristic.ts    HeuristicPlanner.nextAction(...)
  planner/llm.ts          LlmPlanner.nextAction(...) (fallback only)
  planner/plan.ts         planAndExecute(...) loop
  llm/client.ts           LlmClient interface + mode switch (off | record | replay | live)
  llm/gemini.ts           GeminiClient
  llm/replay.ts           record/replay store at .healtest/llm-cache/
  repair/engine.ts        replayWithRepair(...) (§11 step 6b)
  validate/validation.ts  runValidation(repairId) (§11 step 7)
  classify/verdict.ts     decideVerdict(...) (§10.5) and classifyChange(...)
  explain/templates.ts    explainChange, explainVerdict (§10.7)
  governance/policy.ts    load policy.json, canAutoAccept(...)
  governance/reuse.ts     findPlanForRun(...)
  governance/approvals.ts approve, reject, resolveCandidate, rollback
  pipeline/run.ts         runIntent(...) orchestrator (§11)
  server/http.ts          tiny router on node:http
  server/api.ts           /api/* handlers (§12.2)
  server/csrf.ts          per-process token
tests/
  unit/  integration/  guardrails/  helpers/fixtures.ts  helpers/db.ts
```

---

## 7. Core types (`src/types.ts`) — exact shapes

Define each type as a zod schema named `<Type>Schema` and export `type <Type> = z.infer<typeof <Type>Schema>`.

```ts
export type Verdict = 'PASS' | 'HEALED_PASS' | 'APP_BUG' | 'NEEDS_REVIEW' | 'FAIL_UNREPAIRABLE';
export type Classification = 'HARMLESS_UI' | 'BREAKING_UI' | 'APP_BUG' | 'AMBIGUOUS';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ChangeKind =
  'ELEMENT_RENAMED' | 'ELEMENT_REMOVED' | 'ELEMENT_ADDED' | 'ELEMENT_MOVED' |
  'ATTR_CHANGED' | 'LAYOUT_SHIFT' | 'FLOW_CHANGED';
export type ActionType = 'click' | 'fill' | 'check' | 'select';
export type Provenance = 'planner' | 'replay' | 'repair-match' | 'repair-replan' | 'llm' | 'human';

export interface BBox { x: number; y: number; w: number; h: number }   // CSS px, viewport 1280x800, page coords

export interface ElementRecord {
  ref: string;                    // "e1", "e2"… in DOM order, unique within ONE snapshot
  role: string;                   // button | link | textbox | checkbox | combobox | radio
  name: string;                   // accessible name (§9.1 order), whitespace-collapsed
  tag: string;                    // lowercase tagName
  text: string;                   // innerText trimmed, max 80 chars
  label: string;                  // associated <label> text or ""
  attrs: Record<string, string>;  // only: id, name, type, placeholder, aria-label, data-testid, href, and every data-* attribute
  nearText: string;               // context heading (§9.1), max 80 chars
  bbox: BBox;
  visible: boolean;
  enabled: boolean;
  empty: boolean;                 // textbox/select with no value; false for others
  checked: boolean | null;        // checkbox/radio only
  selector: string;               // unique CSS selector at capture time (§9.1)
}

export interface PageSnapshot {
  id?: number;                    // DB id once stored
  pagePath: string;               // URL pathname, e.g. "/cart"
  url: string;
  title: string;
  headings: string[];             // h1–h3 texts
  elements: ElementRecord[];      // visible elements only
  ariaYaml: string;               // await page.locator('body').ariaSnapshot()
  contentHash: string;            // §9.2
  screenshotPath: string | null;  // .healtest/screenshots/<hash12>-<pagePath slug>.png
}

export interface TargetFingerprint {
  role: string; name: string; tag: string; text: string; label: string;
  attrs: Record<string, string>; nearText: string; bbox: BBox; selector: string;
  snapshotId: number;             // snapshot where this element was observed (G2)
  ref: string;                    // element ref inside that snapshot
}

export interface Step {
  stepId: string;                 // "s1", "s2", … renumbered whenever a plan is rebuilt
  action: ActionType;
  pagePath: string;               // page where the step runs
  target: TargetFingerprint;
  dataKey: string | null;         // for fill/select: key in intent.data (G3); null for click/check
  provenance: Provenance;
}

export interface Candidate { ref: string; snapshotId: number; score: number; role: string; name: string }

export interface MatchResult {
  kind: 'single' | 'ambiguous' | 'none';
  best: Candidate | null;
  candidates: Candidate[];        // top 5, sorted by score desc
  reason: string;                 // one human sentence
}

export interface NetworkEvent { method: string; url: string; path: string; status: number; ts: number }

export interface OracleResult { oracleId: string; type: string; ok: boolean; supportingOnly: boolean; detail: Record<string, unknown> }

export interface ChangeItem {
  kind: ChangeKind;
  before: Partial<ElementRecord> & { pagePath?: string } | null;
  after: (Partial<ElementRecord> & { pagePath?: string; snapshotElementId?: string }) | null;
  evidence: string;               // one short sentence, e.g. "name 'Checkout'→'Proceed to payment', id removed"
}

export interface ChangeReport {
  changeId: number;               // DB id; display as chg_0042 (§17 G2)
  baseSnapshotId: number; headSnapshotId: number;
  kind: ChangeKind;               // the most severe item's kind
  severity: Severity; classification: Classification; confidence: number;
  evidence: ChangeItem[];
  affectedSteps: string[];        // stepIds
  explanation: string;            // templated (§10.7)
}

export interface RepairProposal {
  repairId: number; changeId: number;
  proposer: 'heuristic' | 'llm' | 'reuse';
  status: 'proposed' | 'needs_review' | 'validated' | 'rejected' | 'approved' | 'applied' | 'rolled_back';
  steps: Array<Step & { score?: number; alternatives?: Candidate[] }>;
  pendingChoice: { stepId: string; candidates: Candidate[] } | null;  // set only when status = needs_review
  explanation: string;
  validationRunId: number | null;
}

export interface RunOutcome {
  runId: number; verdict: Verdict; exitCode: 0 | 1 | 10 | 11 | 12;
  classification: Classification | null;
  changeIds: number[]; repairId: number | null; validationRunId: number | null;
  reusedRepairId: number | null; llmCalls: number;
  explanation: string;
  oracleResults: OracleResult[];
}
```

---

## 8. Data contracts

### 8.1 Intent file (`intents/checkout.intent.yaml`, human-owned, locked)

```yaml
name: checkout-valid-card
site: gizmo-shop
goal: Complete checkout with a valid credit card.
startPath: /
allowedOrigins:                       # G3 URL allowlist; every navigation must start with one of these
  - http://127.0.0.1:4101
  - http://127.0.0.1:4102
  - http://127.0.0.1:4103
  - http://127.0.0.1:4104
actionBudget: 50                      # G3; exceeding it → FAIL_UNREPAIRABLE
data:                                 # G3 approved data set; the ONLY values HealTest may type
  product: Gizmo Mini
  email: alice@example.com
  name: Alice Tester
  address: 12 Test Street, Pune
  cardNumber: "4242424242424242"
  expiry: "12/30"
  cvc: "123"
planner:
  doneWhen: { pathPattern: "^/confirmation" }   # planner stops here; this is NOT a verdict
expected:                             # oracles; verdicts come only from these (G4, G5)
  - id: order-created
    type: backend_state
    request: { method: GET, path: /__state }
    select: orders
    where: { email: "{{data.email}}" }
    expect:
      count: 1
      fields: { status: PAID, totalCents: 1999, cardLast4: "4242", sku: GZ-MINI }
  - id: no-server-errors
    type: network_status
    urlPattern: "^/api/"
    forbidStatusAtLeast: 500
  - id: order-api-ok
    type: network_status
    urlPattern: "^/api/orders$"
    method: POST
    requireStatusIn: [200, 201]
  - id: confirmation-shown
    type: dom_state
    textAny: ["order confirmed", "thank you"]
    supportingOnly: true
```

Loader rules (`intent/load.ts`):
- Parse with `yaml`, validate with `IntentSchema`. Any unknown key is an error (`.strict()`).
- Hash: `sha256(fileBytes)` as lowercase hex.
- Return `deepFreeze(intent)`. Any mutation throws in strict mode (G1).
- `{{data.X}}` templates resolve only against `intent.data`. An unknown key is a load error.
- Every run stores `intent_sha256`. If the intent row with the same `name` has a different sha256, insert a new `intents` row (never update). Runs always reference the exact version used.

### 8.2 Database

Migration `001_init.sql` = harness §13.2 DDL, **verbatim**, including all triggers. Also add the append-only trigger pairs for `approvals`, `validation_runs` and `oracle_results` that harness only mentions in a comment.

Migration `002_plans.sql`. These are additions, needed but missing from harness §13.2 (§17 G3). The human must approve them and copy them into `docs/contract.md`:

```sql
ALTER TABLE runs ADD COLUMN kind TEXT NOT NULL DEFAULT 'run' CHECK (kind IN ('run','validation'));
ALTER TABLE runs ADD COLUMN target_origin TEXT NOT NULL DEFAULT '';
ALTER TABLE runs ADD COLUMN llm_calls INTEGER NOT NULL DEFAULT 0;
ALTER TABLE runs ADD COLUMN reused_repair_id INTEGER REFERENCES repairs(id);
ALTER TABLE runs ADD COLUMN explanation TEXT NOT NULL DEFAULT '';
ALTER TABLE runs ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '{}';   -- network log, step results

CREATE TABLE step_plans(
  id INTEGER PRIMARY KEY,
  intent_id INTEGER NOT NULL REFERENCES intents(id),
  site_id INTEGER NOT NULL REFERENCES sites(id),
  steps_json TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('baseline','repair')),
  repair_id INTEGER REFERENCES repairs(id),
  start_hash TEXT NOT NULL,                 -- contentHash of startPath page when plan was made
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TRIGGER plans_no_upd BEFORE UPDATE ON step_plans BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER plans_no_del BEFORE DELETE ON step_plans BEGIN SELECT RAISE(ABORT,'append-only'); END;

ALTER TABLE known_good ADD COLUMN step_plan_id INTEGER REFERENCES step_plans(id);
ALTER TABLE repairs ADD COLUMN step_plan_id INTEGER REFERENCES step_plans(id);
```

Rules:
- `audit_log`, `approvals`, `validation_runs`, `oracle_results` and `step_plans` are append-only (triggers).
- `repairs.status` may be UPDATEd, but only through `repo.ts` functions, each writing an `audit_log` row in the same transaction. The `repair_needs_validation` trigger blocks `validated|approved|applied` without a passing validation run.
- `known_good` is append-only by convention. The "current" known-good for a page is the row with the max `id`. Rollback inserts a new row pointing to the previous plan.
- `runs.verdict` is set once at the end of a run. Insert the run row with verdict `'FAIL_UNREPAIRABLE'` as a placeholder and update it exactly once at the end (the only allowed update on `runs`).
- Data directory: `.healtest/` (gitignored), holding `healtest.sqlite`, `screenshots/` and `llm-cache/`. Override it with env `HEALTEST_HOME`.

### 8.3 `policy.json` (human-owned config, repo root)

```json
{ "autoAccept": { "classification": ["HARMLESS_UI"], "maxCandidates": 1, "requireAllOracles": true },
  "match": { "strong": 0.60, "margin": 0.10, "selectorVerify": 0.85 } }
```

---

## 9. Perception

### 9.1 `snapshot/capture.ts` — `captureSnapshot(page, opts) → PageSnapshot`

Implement it as ONE `page.evaluate()` call running a JS function that returns raw element data, then post-process it in TypeScript.

1. **Query:** `a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=checkbox]`.
2. **role:** the explicit `role` attribute, else `a→link`, `button→button`, `input[type=checkbox]→checkbox`, `input[type=radio]→radio`, `input[type=submit|button]→button`, `select→combobox`, other `input`/`textarea→textbox`.
3. **name**, first non-empty in this order: `aria-label` → text of the `aria-labelledby` element(s) → `<label for=id>` text → wrapping `<label>` text → `placeholder` → `innerText` → `value` (buttons only) → `title`. Collapse whitespace and trim.
4. **label:** the `<label for>` or wrapping label text, else `""`.
5. **nearText:** walk up from the element through at most 6 ancestors. At each ancestor, find the first descendant `h1,h2,h3,h4,legend` that is not inside the element itself and take its text. Stop at the first hit. Example: "Add to cart" inside `<article><h3>Gizmo Mini</h3>…` → `"Gizmo Mini"`.
6. **visible:** `rect.width>0 && rect.height>0`, computed style not `display:none`/`visibility:hidden`, and no `hidden` attribute up the tree.
7. **enabled:** `!el.disabled && el.getAttribute('aria-disabled') !== 'true'`.
8. **empty:** for textbox/select, `el.value.trim() === ''`; else `false`. **checked:** for checkbox/radio, `el.checked`; else `null`.
9. **selector**, first one that is unique (`document.querySelectorAll(sel).length === 1`): `#id` (CSS-escaped) → `[data-testid="…"]` → `tag[name="…"]` → the nth-of-type path from `body`.
10. **ref:** number visible elements `e1..eN` in DOM order. Also set the attribute `data-healtest-ref="eN"` on the live element so the executor can do `page.locator('[data-healtest-ref="eN"]')`. Refs are recomputed on every capture.
11. **Screenshot** (only when `opts.screenshot`): full page PNG to `.healtest/screenshots/`.
12. **ariaYaml:** `await page.locator('body').ariaSnapshot()`. Do NOT use `page.accessibility` (removed from Playwright).
13. **Determinism:** the same page must give byte-identical `elements` JSON (no timestamps, no random values).

### 9.2 `snapshot/hash.ts` — `contentHash(elements)`

`sha256(JSON.stringify(sorted))`, where `sorted` is elements mapped to `[role, normalizeName(name), tag, attrs.id ?? '', attrs.name ?? '', attrs.type ?? '', dataAttrs sorted]` and sorted lexicographically. `normalizeName` lowercases, replaces every digit run with `#` (so "Cart (1)" equals "Cart (2)") and collapses spaces. **bbox is excluded.** Purpose: page identity for reuse lookup, and deduplicating stored snapshots (do not insert a new snapshot row if `(page_id, content_hash)` already exists; reuse the existing row id).

---

## 10. Algorithms (exact)

### 10.1 `match/score.ts` — `similarity(t: TargetFingerprint, e: ElementRecord) → number in [0,1]`

```
nameSim   = synonymBoost(t.name, e.name, tokenSetRatio(norm(t.name), norm(e.name)))
roleSim   = t.role === e.role ? 1 : (isClickable(t.role) && isClickable(e.role) ? 0.5 : 0)
attrSim   = (# of keys K in {id,name,type,placeholder,data-testid} where t.attrs[K] && t.attrs[K] === e.attrs[K])
            / max(1, # of those keys present in t.attrs)
textSim   = max(tokenSetRatio(t.label, e.label), synonymBoost(t.text, e.text, tokenSetRatio(t.text, e.text)))
nearSim   = tokenSetRatio(norm(t.nearText), norm(e.nearText))
posSim    = 1 - min(1, dist(center(t.bbox), center(e.bbox)) / 640)

score = 0.35*nameSim + 0.20*roleSim + 0.15*attrSim + 0.10*textSim + 0.10*nearSim + 0.10*posSim
```
- `isClickable(r)` = `r === 'button' || r === 'link'`.
- `norm(s)` = lowercase, strip punctuation except spaces, collapse whitespace, replace digit runs with `#`.
- `tokenSetRatio(a,b)`: split into token sets A and B. **If either is empty, return 0.** Two empty labels are "no information", not a match; otherwise every element with no label would look identical. With `I = A∩B`, build `sI = sorted(I).join(' ')`, `sA = sI + ' ' + sorted(A\I).join(' ')` and `sB = sI + ' ' + sorted(B\I).join(' ')` (trimmed). Return `max(lev(sI,sA), lev(sI,sB), lev(sA,sB))`, where `lev(x,y) = 1 - levenshtein(x,y)/max(len(x),len(y),1)`. Implement Levenshtein yourself in `match/text.ts` (about 20 lines, iterative two-row DP).
- `synonymBoost(a, b, sim)`: if `norm(a)` and `norm(b)` both *contain a phrase from* the same group in `match/synonyms.ts`, return `max(sim, 0.85)`, else `sim`.

`match/synonyms.ts`:
```ts
export const SYNONYM_GROUPS: string[][] = [
  ['cart', 'bag', 'basket', 'trolley', 'shopping bag'],
  ['add to cart', 'add to bag', 'add to basket'],
  ['checkout', 'check out', 'proceed to payment', 'proceed to checkout', 'go to payment'],
  ['pay now', 'pay', 'place order', 'complete order', 'confirm order', 'complete purchase'],
  ['card number', 'card no', 'credit card', 'cc number'],
  ['expiry', 'expiry date', 'expiration', 'exp date', 'mm yy'],
  ['cvc', 'cvv', 'security code'],
  ['email', 'email address', 'e mail'],
  ['address', 'shipping address', 'street address', 'delivery address'],
  ['full name', 'name', 'cardholder name'],
  ['continue', 'next'],
];
```
When a test fails, extend synonyms. **Never change the weights or the thresholds in `policy.json`.**

### 10.2 `match/matcher.ts` — `findReplacement(t, snap, policy) → MatchResult`

1. Candidates = `snap.elements` filtered to `visible && enabled`, and to a compatible role (`same role`, or both clickable).
2. **Context anchoring.** If `t.nearText` is non-empty and at least one candidate has `tokenSetRatio(norm(t.nearText), norm(c.nearText)) ≥ 0.9`, keep only those candidates. This stops "Add to bag" under *Gizmo Pro* from competing with the one under *Gizmo Mini*.
3. **Forbidden names.** Drop candidates whose `norm(name)` matches `/\b(remove|delete|logout|log out|cancel|clear)\b/`.
4. Score every remaining candidate with `similarity`. Sort descending. Keep the top 5 as `candidates`.
5. Decide:
   - If `top.score < policy.match.strong` → `kind: 'none'`.
   - If there is a second candidate with `second.score ≥ policy.match.strong` and `top.score - second.score < policy.match.margin` → `kind: 'ambiguous'` (G6).
   - Else → `kind: 'single'`, `best = top`.
6. `reason` is a template, e.g. `"Best match 'Proceed to payment' (button) score 0.66; next 'Shopping bag' 0.31."`

Also `resolveBySelector(page, snap, t, policy)`. Find the element in `snap` whose `selector === t.selector`, or failing that, the snapshot element matched by `page.locator(t.selector)` count 1. Accept it only if `similarity(t, el) ≥ policy.match.selectorVerify` (0.85). This catches a reused id on a different control.

### 10.3 `diff/differ.ts` — `diffSnapshots(base, head) → ChangeItem[]`

1. **Pair elements** base→head greedily. For each base element in order, pick the unpaired head element with the max `similarity(baseAsTarget, head)`. A pair exists if that score is ≥ 0.45.
2. For each pair:
   - `norm(name)` differs → `ELEMENT_RENAMED`
   - any of id, data-testid, name or class-free selector differs → `ATTR_CHANGED`
   - center moved > 120 px → `ELEMENT_MOVED`
   - only size/position moved 24–120 px → `LAYOUT_SHIFT`

   One pair may yield several items.
3. Unpaired base elements → `ELEMENT_REMOVED`. Unpaired head elements → `ELEMENT_ADDED`.
4. `FLOW_CHANGED` is not produced here. The repair engine adds it when it has to replan (§11 step 6b "none").
5. Sort items by kind priority: FLOW_CHANGED > ELEMENT_REMOVED > ELEMENT_RENAMED > ATTR_CHANGED > ELEMENT_MOVED > ELEMENT_ADDED > LAYOUT_SHIFT.

`diff/severity.ts` (deterministic, per the `change-classification` skill):
- any oracle failed or 5xx observed → `CRITICAL`
- FLOW_CHANGED or REMOVED affecting a step → `HIGH`
- RENAMED/ATTR/MOVED affecting more than one step → `MEDIUM`
- otherwise → `LOW`

`confidence` = the best candidate score for match repairs, `1.0` for an APP_BUG with failed backend oracle, `0.5` for AMBIGUOUS.

### 10.4 Planner (`planner/lexicon.ts`, `planner/heuristic.ts`, `planner/plan.ts`)

**Field lexicon.** This maps an element's `label || name` to an intent data key. Test the patterns **in this order**; the first match wins:
```ts
export const FIELD_PATTERNS: Array<[dataKey: string, re: RegExp]> = [
  ['email',      /\be-?mail\b/i],
  ['cardNumber', /\b(card\s*(number|no\.?)|credit\s*card|cc)\b/i],
  ['expiry',     /\b(expiry|expiration|exp(\.|\s)?date|mm\s*\/\s*yy)\b/i],
  ['cvc',        /\b(cvc|cvv|security\s*code)\b/i],
  ['name',       /\b(full\s*name|name|cardholder)\b/i],
  ['address',    /\b(address|street)\b/i],
];
```
**Button stages.** The click priority runs from the highest stage index to the lowest:
```ts
export const STAGES = [
  { id: 'add',      re: /\badd to (cart|bag|basket)\b/i },
  { id: 'cart',     re: /\b(cart|bag|basket|trolley)\b/i },
  { id: 'checkout', re: /\b(checkout|check out|proceed to (payment|checkout)|go to payment)\b/i },
  { id: 'continue', re: /\b(continue|next)\b/i },
  { id: 'pay',      re: /\b(pay( now)?|place order|complete order|confirm order|complete purchase)\b/i },
] as const;
export const FORBIDDEN_NAME = /\b(remove|delete|logout|log out|cancel|clear|continue shopping)\b/i;
```
**`HeuristicPlanner.nextAction(state) → PlannedAction | {done} | {stuck} | {ambiguous, candidates}`**, where state = `{ snap, intent, completedSteps, clickedOnPath: Set<string>, productAdded: boolean }`:
1. If `new RegExp(intent.planner.doneWhen.pathPattern).test(snap.pagePath)` → `{done}`.
2. **Fill.** Take the first element with role `textbox` and `empty`, where `FIELD_PATTERNS` maps it to a dataKey present in `intent.data` → `{action:'fill', ref, dataKey}`.
3. **Check.** Take the first checkbox with `checked === false` whose name matches `/\b(agree|terms|accept)\b/i` → `{action:'check', ref}`.
4. **Click.** Clickable candidates = visible, enabled, not `FORBIDDEN_NAME`, and `ref+name` not already in `clickedOnPath` for this path. For each stage from `pay` down to `add`:
   - skip `add` if `productAdded`; for `add`, require `norm(c.nearText)` to contain `norm(intent.data.product)`
   - skip `cart` if `!productAdded`, or if the current page heading already contains cart/bag/basket
   - a candidate whose name matches the `add` stage regex is **never** a `cart` candidate ("Add to cart" contains "cart"). In general, each candidate belongs only to the highest stage its name matches, checking `pay → checkout → continue → add → cart`.
   - collect candidates whose name matches `stage.re`
     - none → next stage
     - exactly 1 → `{action:'click', ref}`
     - ≥ 2 → if all have the same `norm(name)` and different nearText, use context. Otherwise → `{ambiguous, candidates}` (G6, Scenario C)
5. Nothing found → `{stuck}`.

**`planAndExecute(session, intent, opts) → { steps, status: 'done'|'stuck'|'ambiguous'|'budget'|'app_error', ambiguity?, llmCalls }`**:
```
loop until budget exhausted (count = completedSteps.length + new steps ≤ intent.actionBudget):
  snap = captureSnapshot(page, {screenshot:false}); store snapshot (dedup)
  a = heuristic.nextAction(state)
  if a.stuck and llmMode !== 'off': a = llmPlanner.nextAction(state)   // counts llmCalls
  done → return done; stuck → return stuck; ambiguous → return ambiguous (+candidates)
  guards.checkAction(a, snap, intent)          // throws GuardViolation on G2/G3 breach
  execute; record Step{ provenance: llm ? 'llm' : (opts.repair ? 'repair-replan' : 'planner'),
                        target = fingerprint from snap (BEFORE the action) }
  if action is click on stage 'add' → productAdded = true
  if session.network has status ≥ 500 on path ^/api/ → return app_error   // NEVER work around a server error
```

**LLM planner (fallback only)** (`planner/llm.ts`): the prompt is the intent goal, the data **keys only** (never values), completed steps (one line each), the current path, headings, and the element list as lines `e7 | button | "Place order" | near:"Payment" | enabled`. Required JSON reply: `{"action":"click|fill|check|done|stuck","ref":"e7"|null,"dataKey":"cardNumber"|null,"reason":"…"}`. Parse it with zod. `ref` must exist in the snapshot (G2) and `dataKey` must exist in `intent.data` (G3). Otherwise reject → treat as `stuck`. The LLM can never return a verdict, a selector or a value.

### 10.5 `classify/verdict.ts` — `decideVerdict(input) → { verdict, classification, exitCode }`

Input: `{ toolError, appError, oracleResults, plannerStatus, repaired, replanned, ambiguous, reusedRepair, planIsKnownGood }`. **First matching row wins:**

| # | Condition | Verdict | Classification | Exit |
|---|---|---|---|---|
| 1 | `toolError` (crash, bad intent, origin not allowed) | — (no verdict; run marked FAIL_UNREPAIRABLE with explanation) | null | 1 |
| 2 | `appError` (any 5xx on `^/api/`) OR any non-`supportingOnly` oracle `ok=false` | `APP_BUG` | `APP_BUG` | 10 |
| 3 | `ambiguous` | `NEEDS_REVIEW` | `AMBIGUOUS` | 11 |
| 4 | `plannerStatus` in `stuck`/`budget`, or guard violation | `FAIL_UNREPAIRABLE` | `BREAKING_UI` if repaired else null | 12 |
| 5 | all oracles ok AND (`repaired` OR (`reusedRepair` AND NOT `planIsKnownGood`)) | `HEALED_PASS` | `BREAKING_UI` if `replanned` else `HARMLESS_UI` | 0 |
| 6 | all oracles ok | `PASS` | null | 0 |

Hard rules:
- **Supporting-only oracles never make a run pass.** If every non-supporting oracle is ok but the only evidence of success is DOM text, that is still a PASS: DOM text is not what passed it. If a supporting oracle fails while all backend oracles pass, record it in the explanation, but the verdict follows the backend.
- **An oracle that throws** (network error, bad JSON) counts as `ok=false`. Never catch it as a pass.
- No LLM is involved anywhere in this file (G5).

### 10.6 Constants (`src/config.ts`)

```ts
export const VIEWPORT = { width: 1280, height: 800 };
export const NAV_TIMEOUT_MS = 8000;      // page.goto / waitForURL
export const ACTION_TIMEOUT_MS = 5000;   // click/fill
export const HOME = process.env.HEALTEST_HOME ?? '.healtest';
export const LLM_MODE = (process.env.HEALTEST_LLM ?? 'off') as 'off'|'record'|'replay'|'live';
export const LLM_MODEL = process.env.HEALTEST_LLM_MODEL ?? 'gemini-2.5-flash';
```
After every action: `await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {})`. No `waitForTimeout` anywhere (testing rule: no sleeps).

### 10.7 `explain/templates.ts` (no LLM)

```
explainChange(step, item, match, goal, oracleIds):
"Step {stepId} ({action} '{oldName}' via {oldSelector}) no longer matches: {item.evidence}.
 Goal '{goal}' is still reachable via {newRole} '{newName}' ({ref}), score {score:.2f}.
 Outcome verified by {oracleIds.join(', ')}."

replan: "Step {stepId} expected '{oldName}' on {oldPath}, but no matching element exists on {curPath}
 (best score {best:.2f} < {strong}). The flow changed; steps {from}–{to} were rebuilt from the intent."

app bug: "The workflow completed in the UI, but the expected outcome did not happen: {failed oracle detail}.
 {5xx summary}. This is an application failure, not a UI change. The repair was rejected."

ambiguous: "Step {stepId} has {n} equally plausible replacements: {name1} ({s1:.2f}), {name2} ({s2:.2f}).
 HealTest will not guess. A human must choose in the dashboard."
```

---

## 11. Orchestrator — `pipeline/run.ts` `runIntent(intentPath, target, opts) → RunOutcome`

```
1  intent = loadIntent(intentPath)                                  // G1 (hash + freeze)
   site   = repo.upsertSite(intent.site, allowlist = intent.allowedOrigins)
   intentRow = repo.upsertIntentVersion(intent)
   if origin(target) ∉ intent.allowedOrigins → toolError (exit 1)    // G3
2  POST {target}/__reset            (fixture endpoint; ignore 404 for real sites)
3  run = repo.insertRun({ kind:'run', intent, target })
4  session = openSession(); network capture on; goto target + startPath
   startSnap = capture(screenshot: true); store
5  plan = governance.findPlanForRun(intent, site, startSnap.contentHash)
       // order: (a) newest repair in status validated|approved|applied whose step_plan.start_hash == hash
       //        (b) newest known_good plan for this intent+site
       //        (c) null
   reusedRepairId = (a) ? repair.id : null

6a NO PLAN (first run / baseline):
     r = planAndExecute(session, intent, { repair:false })
     if r.status === 'ambiguous' → store change(classification AMBIGUOUS) + repair(needs_review) → verdict row 3
     oracles = runOracles(...)
     verdict = decideVerdict(...)
     if PASS → insert step_plans(origin 'baseline', start_hash) + known_good(actor 'system:baseline') + audit
6b PLAN EXISTS (replay with repair):
     newSteps = []; repaired = false; replanned = false
     for step in plan.steps:
        snap = capture(screenshot: true); store
        el = resolveBySelector(page, snap, step.target)
        if el: execute(step, el); newSteps.push(step with provenance 'replay'); check 5xx → break to 7
        else:                                                         // DETECT
           base = repo.snapshot(step.target.snapshotId)
           items = diffSnapshots(base, snap)
           m = findReplacement(step.target, snap)
           if m.kind === 'single':
              change = report(items, affected=[step.stepId]); repaired = true
              newStep = { ...step, target: fingerprint(m.best), provenance:'repair-match' }
              execute; newSteps.push(newStep); continue
           if m.kind === 'ambiguous':
              change = report(..., classification AMBIGUOUS)
              repair = repo.insertRepair(status 'needs_review', pendingChoice {stepId, candidates})
              → verdict NEEDS_REVIEW; go to 8
           if m.kind === 'none':                                      // flow changed
              items.unshift({ kind:'FLOW_CHANGED', ... })
              change = report(items, affected = remaining stepIds); repaired = replanned = true
              r = planAndExecute(session, intent, { repair:true, completed:newSteps })
              newSteps.push(...r.steps); handle r.status (ambiguous → needs_review repair; stuck/budget → row 4)
              break
7  IF repaired:
      plan' = renumber(newSteps); step_plans insert (origin 'repair', start_hash = startSnap.contentHash)
      repair = repo.insertRepair(change, proposer 'heuristic' or 'llm' if any llm step, status 'proposed', step_plan_id)
      v = runValidation(repair.id)          // fresh browser context, POST /__reset, STRICT replay of plan'
                                            // (no matching, no planner; any step not found → FAIL_UNREPAIRABLE)
                                            // then runOracles; inserts runs(kind 'validation'),
                                            // validation_runs, oracle_results
      if v.verdict passes → repo.setRepairStatus(repair, 'validated')
           if policy.canAutoAccept(classification, candidatesCount, oracles)
               → status 'applied' + known_good(step_plan_id, actor 'system:policy')
      else → repo.setRepairStatus(repair, 'rejected')   // Scenario B
      verdict = decideVerdict(...) using the VALIDATION run's oracles
   ELSE:
      oracles = runOracles(...) on this run; verdict = decideVerdict(...)
8  explanation = templates(...); repo.finishRun(run, verdict, explanation, llmCalls, evidence)
   every insert above wrote audit_log in the same transaction
   print summary (one line per phase); return RunOutcome; CLI exits with exitCode
```

**Approval actions (`governance/approvals.ts`)**, each one = insert `approvals` row + status change + audit:
- `approve(repairId, actor, reason)`: requires status `validated`. Then status `approved` → `applied`, and insert `known_good` (step_plan_id).
- `reject(repairId, actor, reason)`: status `rejected`.
- `resolveCandidate(repairId, candidateRef, actor)`: only for `needs_review`. Build a new plan using the chosen candidate for `pendingChoice.stepId` (provenance `human`), then run validation. During this validation run, the planner may continue after the chosen step until `doneWhen`. A new ambiguity keeps the status `needs_review`. Pass → `validated`, which the human can then `approve`.
- `retry(repairId)`: re-run `runValidation`.
- `rollback(repairId, actor, reason)`: requires `applied`. Insert approvals(`rollback`), status `rolled_back`, and insert a `known_good` row pointing at the previous known-good plan (G7).

---

## 12. Interfaces

### 12.1 CLI (`src/cli.ts`, commander) — harness §13.1 plus details

| Command | Behaviour | Exit |
|---|---|---|
| `healtest run <intent> --target <url> [--db <path>] [--llm off\|record\|replay\|live]` | `runIntent` | 0/10/11/12/1 |
| `healtest scan <site> --target <url> [--paths / /cart …]` | capture and store snapshots, with screenshots | 0/1 |
| `healtest diff <baseSnapId> <headSnapId> [--json]` | print `ChangeItem[]`; pure | 0 |
| `healtest repair <changeId>` | re-run the matcher for that change's affected step against the head snapshot; insert a proposed repair | 0/11 |
| `healtest validate <repairId>` | `runValidation` | 0/10/12 |
| `healtest approve <repairId> --actor X --reason "…"` | approve | 0/1 |
| `healtest reject <repairId> --actor X --reason "…"` | reject | 0/1 |
| `healtest resolve <repairId> --candidate <ref> --actor X` | resolveCandidate | 0/10/11 |
| `healtest rollback <repairId> --actor X --reason "…"` | rollback | 0/1 |
| `healtest report <runId> [--json]` | RunOutcome + change + repair | 0 |
| `healtest serve [--port 4300]` | API + dashboard | — |

Console output format is one line per phase, plain text, with no colour codes when `NO_COLOR` is set. The example below is **illustrative**: tests assert the phase tags and the verdict, not exact step numbers or scores. (Expected real behaviour on v2: s1 is repaired by match, "Add to cart" → "Add to bag". The cart link probably scores below `strong` against "Shopping bag", so the flow is replanned from s2.)
```
[intent]   checkout-valid-card sha=3f2a…  target=http://127.0.0.1:4102
[plan]     reuse: none · known-good plan #1 (7 steps, baseline)
[replay]   s1 click 'Add to cart' … FAIL (selector #add-GZ-MINI not found)
[detect]   chg_0003 ELEMENT_RENAMED HIGH — name 'Add to cart'→'Add to bag', id removed
[repair]   s1 → e4 button 'Add to bag' score 0.79 (single)
[detect]   chg_0004 FLOW_CHANGED HIGH — 'Card number' not on /checkout/details
[replan]   s5–s10 rebuilt from intent (heuristic, 0 LLM calls)
[validate] run #7 fresh context · order-created ✓ · no-server-errors ✓ · order-api-ok ✓
[verdict]  HEALED_PASS (BREAKING_UI) · repair rep_0002 validated · awaiting approval
```

### 12.2 Local API (`server/api.ts`) — 127.0.0.1 only

| Method + path | Returns |
|---|---|
| `GET /api/session` | `{ csrf }` (per-process random token) |
| `GET /api/sites` | `[{ id, name, baseUrl, lastScanAt, openChanges, health: Verdict }]` |
| `GET /api/pages?siteId=` | `[{ id, path, snapshotCount, knownGoodSnapshotId }]` |
| `GET /api/pages/:id/snapshots` | `[{ id, versionLabel, contentHash, capturedAt, hasScreenshot }]` |
| `GET /api/snapshots/:id` | PageSnapshot without `ariaYaml` (add `?aria=1` to include it) |
| `GET /api/snapshots/:id/screenshot` | PNG |
| `GET /api/changes?severity=&classification=&limit=` | ChangeReport summaries, newest first |
| `GET /api/changes/:id` | full ChangeReport + base/head snapshot ids + linked repairs |
| `GET /api/repairs/:id` | RepairProposal + validation runs + oracle results + approvals |
| `GET /api/runs?limit=` / `GET /api/runs/:id` | RunOutcome rows |
| `GET /api/audit?entity=&id=&limit=` | audit rows |
| `POST /api/repairs/:id/{approve\|reject\|retry\|rollback\|resolve}` | header `X-CSRF-Token`, body `{ confirm: true, actor, reason, candidateRef? }` → updated repair |

Rules: reject a POST without a valid token or without `confirm:true` → 403/400. Error format is `{ error: { code, message } }`. Serve `dashboard/*` at `/`. No CORS headers. Snapshot content is untrusted: the API returns data, and the dashboard renders it with `textContent` only.

### 12.3 Dashboard (D1–D7)

Follow harness §16 exactly (tokens, status semantics, layout). Files: `dashboard/index.html`, `dashboard/app.css`, `dashboard/app.js` and the locked `dashboard/tokens.css`. Use a single page with hash routes:

| Route | View | Requirement |
|---|---|---|
| `#/` | **D1** sites table + monitored pages + recent runs with verdict badges | R-F5-01 |
| `#/changes` | **D4** timeline (newest first) + left filter rail (severity checkboxes, classification select) | R-F5-04 |
| `#/changes/:id` | **D2** before/after screenshots side by side · **D3** two-column mono diff (before element vs after element: role, name, selector, attrs; changed fields highlighted using `--crimson-wash` + a `≠` glyph) · **D5** repair preview (steps table: stepId, action, old target → new target, provenance, score, alternatives) + explanation · **D6** buttons | R-F5-02,03,05,06 |
| `#/repairs/:id` | D5 + D6 + **D7** validation runs, oracle results (icon + text), audit trail for that repair | R-F5-05..07 |
| `#/audit` | **D7** global audit log table with entity filter | R-F5-07 |

D6 behaviour:
- **Approve** and **Rollback** open a native `<dialog>` with actor + reason inputs and a Confirm button.
- **Reject** opens the same dialog.
- **Retry** needs no reason.
- For `needs_review` repairs, show a radio list of candidates and a **Validate choice** button (calls `resolve`).
- After a successful approve, show the `.seal` stamp "APPROVED" (English label).
- Disable buttons that are not valid for the current status.

Theme toggle: `data-theme` on `<html>`, persisted in `localStorage` inside try/catch.

---

## 13. Fixtures (the app under test) — human-reviewed, locked

One zero-dependency script, `fixtures/server.mjs` (node:http only), serves the HTML in `fixtures/<variant>/`.
- `node fixtures/server.mjs --variant shop-v1 --port 4101` serves one variant.
- `--all` starts v1:4101, v2:4102, v2-bug:4103 and v2-ambiguous:4104.
- `--port 0` picks a free port.
- On listen it prints exactly `LISTENING <variant> <port>` (tests parse this line).

**Shared in-memory state per process:** `cart: string[]` (skus), `orders: Order[]`, `requests: {method,path,status}[]`.

| Endpoint | Behaviour |
|---|---|
| `GET /`, `/cart`, … | HTML page of the variant (see the tables below) |
| `POST /api/cart` `{sku}` | push the sku; return `200 {count}` |
| `GET /api/cart` | `{items:[{sku,name,priceCents}], totalCents}` |
| `POST /api/orders` `{email,name,address,cardNumber,expiry,cvc}` | Luhn-valid card (4242424242424242 passes) → create `{id:"ord_<n>", email, sku: cart[0], totalCents: sum, status:"PAID", cardLast4}` → `201 {orderId}`. Invalid card → `402 {error:"card declined"}`. Clear the cart on success. |
| `GET /__state` | `{ orders, cart, requests }` (backend truth for oracles) |
| `POST /__reset` | clear all state → `204` |

Products: `GZ-MINI` "Gizmo Mini" 1999 · `GZ-PRO` "Gizmo Pro" 2999. Each product is an `<article>` with an `<h3>` name, a price and an add button.

**shop-v1 (Version A)**

| Page | Content |
|---|---|
| `/` | header right: `<a id="cart-link" href="/cart">Cart (<span id="cart-count">0</span>)</a>`; per product `<button id="add-GZ-MINI" class="add-btn">Add to cart</button>` (fetch POST /api/cart, update count) |
| `/cart` | `<h1>Your cart</h1>`, items, total, at the bottom `<button id="checkout-button">Checkout</button>` → `/checkout` |
| `/checkout` | `<h1>Checkout</h1>` form: labels "Email" `#email`, "Full name" `#name`, "Address" `#address`, "Card number" `#card-number`, "Expiry (MM/YY)" `#expiry`, "CVC" `#cvc`; `<button id="pay-button" type="submit">Pay now</button>`. Submit → POST /api/orders. 201 → `/confirmation?order=<id>`. Otherwise show `<p role="alert">Payment failed</p>`. |
| `/confirmation` | `<h1>Order confirmed</h1><p>Thank you! Order <span id="order-id">…</span></p>` |

**shop-v2 (Version B, harmless redesign; every change below is deliberate)**

| # | Change | v1 → v2 |
|---|---|---|
| 1 | rename | "Add to cart" → "Add to bag" |
| 2 | id removed | `#add-GZ-MINI` → `<button class="btn" data-action="add">` inside `<article data-sku="GZ-MINI">` |
| 3 | move + rename | top-right "Cart (n)" link → left nav `<button aria-label="Shopping bag">` with a count, navigates to `/bag` |
| 4 | rename + move + id | `/cart` bottom `#checkout-button` "Checkout" → `/bag` (`<h1>Your bag</h1>`) **top** `<button class="btn-primary">Proceed to payment</button>` → `/checkout/details` |
| 5 | flow split | one checkout page → `/checkout/details` (`<h1>Delivery details</h1>`: "Email address" `#user-email`, "Name" `#fullname`, "Shipping address" `#ship-addr`, button "Continue", values kept in sessionStorage) → `/checkout/payment` |
| 6 | label/id change | `/checkout/payment` (`<h1>Payment</h1>`): "Card no." `#cc`, "Expiry date" `#exp`, "Security code" `#sec` |
| 7 | new required step | checkbox `#terms` "I agree to the terms"; "Place order" (`type=submit`) is `disabled` until checked |
| 8 | text change | `/confirmation`: `<h1>Order confirmed</h1>` + `<span data-testid="order-ref">` |

**shop-v2-bug (Scenario B).** Same HTML as v2. `POST /api/orders` returns `500 {"error":"payment gateway timeout"}` and creates **no** order. The payment page JS **ignores the status** and navigates to `/confirmation`, which still shows "Order confirmed". This is the trap for naive AI testers.

**shop-v2-ambiguous (Scenario C).** Same as v2, except `/checkout/payment` has two adjacent submit buttons, "Pay" and "Complete order", identical in style. Both submit the order correctly, so validation passes after a human chooses one.

---

## 14. Demo script (`npm run demo`) — matches harness §17

`src/demo.ts` starts `fixtures/server.mjs --all` as a child process, waits for 4 `LISTENING` lines, sets `HEALTEST_LLM=replay` unless already set, and uses DB `.healtest/demo.sqlite` (deleted at start). It prints a banner before each act and pauses with Enter when `--interactive` is passed.

| Act | Command (internal call) | Expected |
|---|---|---|
| 1 | run intent on 4101 (v1) | PASS, baseline plan + known_good stored |
| 2 | run intent on 4102 (v2) | detect → explain → repair-match s1, replan the flow → validation → **HEALED_PASS** (BREAKING_UI, repair validated, awaiting approval) |
| 3 | run again on 4102 | reuse repair → **HEALED_PASS**, `llmCalls = 0`, `reusedRepairId` set |
| 4 | approve that repair (actor "demo-lead") | status applied, seal visible in dashboard; a 4th run on 4102 → **PASS** |
| 5 | fresh DB `demo-bug.sqlite`: v1 baseline, then 4103 (v2-bug) | **APP_BUG**, repair rejected, explanation cites `order-created` count 0 and a 500 on POST /api/orders |
| 6 | fresh DB `demo-amb.sqlite`: v1 baseline, then 4104 | **NEEDS_REVIEW**, 2 candidates stored ("Pay", "Complete order") |
| 7 | resolve with candidate "Complete order" → validate → approve | HEALED_PASS validation, approved |
| 8 | print a summary table + `healtest serve` URL | dashboard shows all runs |

`oracles/demo.oracle.mjs` (human-owned) asserts every row through the public CLI exit codes, `healtest report --json`, the SQLite rows and the fixtures' `/__state`.

---

## 15. Guardrails G1–G7 → enforcement points (all must have a negative test in `tests/guardrails/`)

| G | Enforcement | Negative test name |
|---|---|---|
| G1 intent immutable | `deepFreeze`; sha256 stored on every run; repair code receives the frozen object | `[R-F4-01] mutating a loaded intent throws and the run records the original sha` |
| G2 observed elements only | `Step.target.snapshotId/ref` must exist in DB; executor resolves only `data-healtest-ref` from the current snapshot; LLM schema has `ref` only | `[R-F4-02] a repair whose targetRef is not in the stored snapshot is rejected` |
| G3 allowlist, data, budget | `guards.ts`: navigation origin check, `dataKey ∈ intent.data`, step count ≤ actionBudget | `[R-F4-03] navigation to a non-allowlisted origin throws`, `… unknown dataKey rejected`, `… budget exceeded → FAIL_UNREPAIRABLE` |
| G4 deterministic validation | repair → `runValidation` strict replay + oracles before any status beyond proposed | `[R-F4-04] a repair cannot become validated without a passing validation run (trigger)` |
| G5 no AI verdict | verdict.ts has no LLM import; LLM output schema has no verdict field; dom_state oracle `supportingOnly` | `[R-F4-05] an LLM reply claiming success is ignored and the backend oracle decides` |
| G6 ambiguity → human | matcher margin; planner ambiguity | `[R-F4-06] two candidates within margin yield NEEDS_REVIEW with both stored` |
| G7 known-good + audit | append-only triggers; known_good inserted before applied; rollback restores | `[R-F4-07] DELETE FROM audit_log aborts`, `… rollback restores the previous known-good plan` |

---

## 16. Non-functional requirements

- **Determinism:** the same fixture + same DB state gives the same verdict, the same change kinds and the same scores (to 2 decimals). The LLM is off by default and uses replay in the demo.
- **Speed:** a v1 baseline run is under 15 s. A v2 heal (including validation) is under 45 s. The full `npm run demo` is under 4 min.
- **Security:** bind 127.0.0.1. Use a CSRF token for POSTs. Never put secrets in the DB or logs. Mask card numbers in evidence as `**** 4242` (store only the dataKey in steps, never the value). Snapshots are rendered with `textContent` only.
- **Windows support:** use `node:path`. No shell-specific scripts in `src/`. All `npm run` scripts work in PowerShell.
- **Traceability:** every P0 R-ID has a test or oracle containing `[R-ID]` literally, one per ID (not ranges).

---

## 17. Harness gaps resolved (human: accept or overrule, then lock)

| # | Gap in `harness.md` | Resolution in this PRD |
|---|---|---|
| G1 | Reuse ("second v2 run uses stored repair") conflicts with `autoAccept` = HARMLESS_UI only (v2 is BREAKING_UI) | Reuse uses **validated** repairs (also approved/applied). Approval promotes a repair to known-good. A reused, not-yet-approved repair gives HEALED_PASS; once approved, runs give PASS. (§11 step 5, §10.5 row 5) |
| G2 | Change report example uses string ids (`chg_0042`); DDL uses INTEGER | DB stores integers. API/UI display `chg_`/`rep_` + 4-digit zero pad |
| G3 | No storage for step plans; no `llm_calls` column (R-PIPE-01 requires counting) | Migration `002_plans.sql` (§8.2) |
| G4 | Scenario B "repair rejected" cannot happen if v2's validated repair is reused | Scenarios B and C run on fresh DBs seeded by a v1 baseline (§14 acts 5–6) |
| G5 | `npm run demo` runs `dist/demo.js`, but there is no build script | add `build` and chain it (§5) |
| G6 | `PLAN.md` uses ranges (R-F1-02..05); `check-trace.mjs` needs each id literally | tests must tag each id individually |
| G7 | Fixture HTTP contract undefined (`/__state` named only) | §13 fixture contract; `LISTENING` handshake for tests |
| G8 | Which LLM HealTest calls is undecided | Gemini via `@google/genai`, fallback-only, default `off`, `replay` for the demo |
| G9 | a11y snapshot API not named | `locator.ariaSnapshot()`; `page.accessibility` is removed in current Playwright |
| G10 | Scenario C approval needs a candidate choice, but the API has only approve | added `resolve` action (CLI + API + D6) |

## 18. Success metrics (judging)

1. `npm run verify:demo` exits 0 (all oracles and traceability).
2. Live demo: v1 PASS → v2 HEALED_PASS with a visible explanation and diff → reuse with 0 LLM calls → APP_BUG on v2-bug **despite "Order confirmed" on screen** → NEEDS_REVIEW → human resolve + approve → seal.
3. Every repair in the DB links change → repair → validation_run. Audit rows cannot be deleted.
4. Dashboard D1–D7 is readable in both themes. Statuses are never shown by colour alone.

## 19. Risks

| Risk | Mitigation |
|---|---|
| Scores land slightly off the threshold on the fixtures | Extend synonyms; unit tests pin the expected kind (single/ambiguous/none) on real fixture snapshots; never change thresholds |
| Agent edits fixtures/oracles to pass | lock manifest + hooks (harness §9, §10) |
| Planner loops on a page | `clickedOnPath` set + action budget → FAIL_UNREPAIRABLE |
| Playwright blocked by the Antigravity sandbox | harness smoke test S5; relax only the implementer role |
| Live LLM unavailable on stage | heuristic-first; LLM off/replay; nothing in the demo path requires the LLM |
