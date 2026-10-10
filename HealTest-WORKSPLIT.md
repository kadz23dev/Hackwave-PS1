# HealTest — Work Split (task cards for lower-tier models)

**Goes with:** `HealTest-PRD.md` (the "what") and `harness.md` (agents, hooks, Ralph loop, verify).
**Put this file in the repo as:** `docs/WORKSPLIT.md` (not locked; agents read it, humans edit it).
**Rule for agents:** open ONLY the card for your task (search for `## T07`, for example) plus the PRD sections it names.

---

## A. How to use this with Antigravity

### A.1 Two ways to run

**Option 1: Ralph loop (unattended, from harness §12).** Replace each line in `ralph/PLAN.md` with a pointer to its card, for example:
```
- [ ] T07 Executor + guards. Card: docs/WORKSPLIT.md "## T07". PRD §10.4, §15 G3. (R-PS-02, R-F4-03)
```
`ralph/PROMPT.md` stays the same. The `ralph-iteration` skill already says "take the first unchecked task".

**Option 2: Manual (recommended for the first 3 tasks, and for weak models).** Open a fresh Antigravity chat per task and paste:
```
You are building HealTest. Read AGENTS.md first.
Your task is card <T##> in docs/WORKSPLIT.md. Read ONLY that card and the PRD sections it lists (docs/PRD.md).
Follow the card's Steps in order. Do not do anything not in the card.
Finish only when every command under "Acceptance" passes in this session. Paste the last 15 lines of output.
Then: commit "T##: <summary>", tick the box in ralph/PLAN.md, write ≤5 lines in ralph/progress.md.
If blocked twice on the same error: write "BLOCKED: <reason>" in ralph/progress.md and stop.
```

### A.2 Model tiers

| Tag | Meaning | Use |
|---|---|---|
| **HUMAN** | a person must do or approve it | Phase 0 (truth sources: intent, fixtures, oracle, locks) |
| **PRO** | Antigravity `pro` model, primary agent | logic where a mistake causes false passes: matcher, planner, orchestrator, verdict, governance |
| **FLASH** | `flash` / `implementer` subagent | mechanical: scaffolding, SQL, CRUD, HTTP routes, HTML/CSS views |
| **FLASH+REVIEW** | flash writes it, then `guardrail-auditor` (pro) reviews | security-relevant but mechanical code |

If you only have one cheap model, still do the PRO cards with it, but split each one into its numbered sub-steps (one chat per sub-step) and run Acceptance after each.

### A.3 Team lanes (for a 3–4 person hackathon team; each person drives one agent)

```
Lane H (human lead)   H1 H2 H3 H4 H5 ─────────────────────────────── demo rehearsal
Lane 1 (engine)            T01 T03 T04 T05 T06 ─ T10 T11 T12 T13 T14 ─ T20 T21 T22
Lane 2 (runtime/data)          T02 ─ T07 T08 T09 ─────────── T15 ─┘
Lane 3 (UI)                                    T16 T17 T18 T19 ──┘
P1 (after T22 green)   M01 M02 M03 M04 M05
```
Merge rule: lanes work on separate branches (`lane1/T05`), and a branch is merged only when `npm run verify` is green. Files are owned per lane (§C) to avoid conflicts.

### A.4 Dependency graph (must-finish-before)

```
H1..H5 ─► T01 ─► T02 ─┬─► T07 ─► T08 ─► T09 ─┐
                T03 ──┤                       ├─► T10 ─► T11 ─► T12 ─► T13 ─► T14 ─► T15 ─► T20 ─► T21 ─► T22
                T04 ─► T05 ─► T06 ────────────┘                                 │
                                                       T02 ─► T16 ─► T17 ─► T18 ─► T19 ─────┘
```

### A.5 Checkpoints (stop and show a human)

| After | Human checks |
|---|---|
| T01 | `npm run verify:fast` is green on an empty suite; hooks block an edit to `intents/` (harness smoke test S2) |
| T06 | `healtest diff` between the v1 and v2 `/cart` snapshots prints RENAMED/MOVED/ATTR items that make sense |
| **T10** | **first end-to-end:** `healtest run` on v1 → PASS, exit 0 |
| **T12** | **core demo:** v2 → HEALED_PASS; v2-bug (fresh DB) → APP_BUG |
| T13 | reuse with 0 LLM calls; v2-ambiguous → NEEDS_REVIEW |
| T19 | click through the dashboard in both themes |
| T21 | `npm run verify:demo` green |

---

## B. Phase 0 — human work (critical path; nothing else starts before H5)

### H1 — Intent file · HUMAN · 20 min
- **Create** `intents/checkout.intent.yaml` exactly as in PRD §8.1. Change the data if you like, but keep the keys `product, email, name, address, cardNumber, expiry, cvc`.
- **Check:** the expected outcomes are in backend terms (order row, HTTP status). The DOM-text oracle has `supportingOnly: true`.

### H2 — Fixtures · HUMAN (an agent may draft; a human reviews line by line) · 2–3 h
- **Create** `fixtures/server.mjs` and `fixtures/{shop-v1,shop-v2,shop-v2-bug,shop-v2-ambiguous}/*.html` per PRD §13. Zero npm dependencies.
- If an agent drafts it, use a **separate chat before the lock**, with this prompt: "Implement PRD §13 exactly. node:http only. Print `LISTENING <variant> <port>`. Do not add features."
- **Review checklist:**
  - [ ] v1 manual purchase works and `GET /__state` shows 1 PAID order, totalCents 1999, cardLast4 "4242"
  - [ ] v2 has all 8 changes in the PRD §13 table
  - [ ] v2 "Place order" is disabled until terms are checked
  - [ ] v2-bug: POST /api/orders → 500, no order, yet the page navigates to "Order confirmed"
  - [ ] v2-ambiguous: "Pay" and "Complete order" both work
  - [ ] `--all` starts 4101–4104; `POST /__reset` empties state
  - [ ] the server has no write path to anything except memory

### H3 — Demo oracle · HUMAN (agent may draft; a human must understand every assertion) · 2 h
- **Create** `oracles/demo.oracle.mjs`. It spawns `npm run fixtures` and runs the CLI through `child_process.spawnSync('node', ['dist/cli.js', ...])` with `HEALTEST_LLM=replay`, using separate `--db` files per scenario. It asserts:
  1. `[R-PS-07] [R-PS-01] [R-F1-01]` v1 run exit 0; `report --json` verdict PASS; `snapshots` has rows; `runs.intent_sha256` equals the sha256 of the intent file.
  2. `[R-PS-08] [R-PS-09] [R-SC-A] [R-PS-03] [R-PS-04] [R-PS-05]` v2 run exit 0; verdict HEALED_PASS; ≥1 `changes` row whose `explanation` contains "no longer matches" or "flow changed"; the repair has status validated or applied; the linked validation run verdict passes; the fixture `/__state` has 1 order after validation.
  3. `[R-PIPE-01]` second v2 run exit 0; `runs.llm_calls = 0`; `reused_repair_id` is not null.
  4. `[R-F3-07]` every `repairs` row has a `change_id`, and every validated repair has a `validation_runs` row.
  5. `[R-SC-B] [R-PS-06]` fresh DB: v1, then v2-bug → exit 10; verdict APP_BUG; repair status rejected; oracle `order-created` ok=0.
  6. `[R-SC-C] [R-F4-06]` fresh DB: v1, then v2-ambiguous → exit 11; repair status needs_review; `proposal_json.pendingChoice.candidates.length >= 2`.
  7. `[R-F4-07]` `DELETE FROM audit_log` throws (open the DB with better-sqlite3 read-write).
  8. `[R-F5-01]`…`[R-F5-07]` start `healtest serve` and GET `/`, `/api/sites`, `/api/changes`, `/api/repairs/<id>` and `/api/audit` → 200 with non-empty JSON; `index.html` contains the ids `view-overview`, `view-changes`, `view-change`, `view-repair` and `view-audit` (the dashboard's agreed DOM contract, T17–T19).
- Exit 0 only if all pass. Print `PASS <n>` / `FAIL <n> <reason>` per assertion.

### H4 — Docs · HUMAN · 1 h
- `docs/requirements.md` = harness §1 block (verbatim).
- `docs/contract.md` = PRD §5–§13 + §17, after you accept or overrule each §17 row.
- `docs/PRD.md` = this PRD. `docs/WORKSPLIT.md` = this file (neither is locked).
- `dashboard/tokens.css` = harness §16.3 (verbatim). `policy.json` = PRD §8.3.
- Write the files from harness §5–§12 (AGENTS.md, rules, agents, skills, hooks, scripts, ralph/) as given. In AGENTS.md "Stack", add: `zod, yaml, commander, @google/genai (fallback only), tsx (dev)`.

### H5 — Lock · HUMAN · 10 min
- `git init`, then `npm init -y`, then `npm run lock` (requires the scripts from H4; `verify.mjs lock` works before T01). Review `harness.lock.json`, then commit "Phase 0".
- Run harness smoke tests S1–S3 and S13 now. Run S4–S12 after T01.

---

## C. File ownership (prevents lane conflicts)

| Lane | Owns |
|---|---|
| 1 engine | `src/intent, snapshot, match, diff, planner, llm, repair, validate, classify, explain, governance, pipeline`, `src/demo.ts` |
| 2 runtime/data | `src/db, browser, executor, oracle`, `src/cli.ts`, `src/config.ts`, `src/types.ts` (types are additive; announce changes) |
| 3 UI | `src/server`, `dashboard/app.js, app.css, index.html` |
| Human | every locked path (harness invariant 1), `policy.json`, `docs/requirements.md`, `docs/contract.md` |

---

## D. Task cards — P0

Card format: **Tier · Lane · Depends · R-IDs · Read** → Files → Steps → Tests (exact names) → Acceptance → Do NOT.

---

## T01 — Scaffold
**FLASH · Lane 2 · Depends H5 · R-PS-01 (scaffold only) · Read PRD §5, §6.1**

**Files:** `package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, `.gitignore`, `src/config.ts`, `src/types.ts` (empty export), `tests/unit/smoke.test.ts`, `tests/helpers/fixtures.ts`.

**Steps:**
1. Install: `npm i playwright better-sqlite3 zod yaml commander @google/genai`, then `npm i -D typescript vitest eslint typescript-eslint @types/node @types/better-sqlite3 tsx`, then `npx playwright install chromium`.
2. `package.json`: `"type":"module"`, plus the scripts from harness §10.1 and PRD §5 merged.
3. Create TWO tsconfig files (verify.mjs runs `npx tsc --noEmit` on the root one, and you may not edit verify.mjs):
   - `tsconfig.json` (typecheck only): `strict`, `target ES2022`, `module NodeNext`, `moduleResolution NodeNext`, `skipLibCheck`, `noEmit: true`, `include: ["src", "tests"]`.
   - `tsconfig.build.json`: `extends ./tsconfig.json`, `noEmit: false`, `rootDir src`, `outDir dist`, `include: ["src"]`.
   - Build script: `"build": "tsc -p tsconfig.build.json && node scripts-dev/copy-sql.mjs"`. `scripts-dev/copy-sql.mjs` does `cpSync('src/db/migrations','dist/db/migrations',{recursive:true})` (create the folder `src/db/migrations/` now, even if empty).
4. `eslint.config.js`: flat config with `typescript-eslint` recommended; ignore `dist`, `.harness`, `.healtest`, `fixtures`, `oracles`, `scripts`, `dashboard/tokens.css`.
5. `.gitignore`: `node_modules dist .harness .healtest`.
6. `src/config.ts`: the constants from PRD §10.6.
7. `tests/helpers/fixtures.ts`: `startFixture(variant): Promise<{ url: string; stop(): Promise<void> }>`. It spawns `node fixtures/server.mjs --variant <v> --port 0` and resolves when stdout has `LISTENING <v> <port>`.
8. `tests/unit/smoke.test.ts`: `it('[R-PS-01] toolchain runs', () => expect(1 + 1).toBe(2))`. This is temporary; T03 adds the real R-PS-01 test.

**Tests:** smoke test above; also `tests/integration/fixtures.test.ts` → `it('fixture v1 starts and /__state is empty')`.

**Acceptance:** `npm run verify:fast` and `npm run verify` exit 0; `npm run build` produces `dist/config.js`.

**Do NOT:** edit `scripts/verify.mjs`; add a framework; touch `fixtures/`.

---

## T02 — Database, migrations, triggers
**FLASH+REVIEW · Lane 2 · Depends T01 · R-F3-01..07 · Read PRD §8.2, harness §13.2, skill db-audit-history**

**Files:** `src/db/index.ts`, `src/db/migrations/001_init.sql`, `src/db/migrations/002_plans.sql`, `src/db/repo.ts`, `tests/helpers/db.ts`, `tests/unit/db.test.ts`.

**Steps:**
1. `001_init.sql`: copy harness §13.2 verbatim. Then add the trigger pairs `*_no_upd` / `*_no_del` for `approvals`, `validation_runs` and `oracle_results`.
2. `002_plans.sql`: copy PRD §8.2 verbatim.
3. `src/db/index.ts`: `openDb(path = join(HOME,'healtest.sqlite')): Database`. Create the directory, set `PRAGMA foreign_keys = ON`, `journal_mode = WAL`, and add a `schema_migrations(version)` table. Apply each `migrations/NNN_*.sql` once, in order, inside a transaction. Find the folder with `fileURLToPath(new URL('./migrations/', import.meta.url))`. This works for both `src` (via tsx/vitest) and `dist` (the T01 build script copies the SQL).
4. `src/db/repo.ts`: a class `Repo(db)` with these methods (each one is a single transaction that also inserts `audit_log(actor, action, entity, entity_id, payload_json)`):
   `upsertSite(name, baseUrl, allowlist)`, `upsertPage(siteId, path)`, `insertSnapshot(pageId, versionLabel, snap)` (dedup on page_id + content_hash; return the existing id), `getSnapshot(id)`, `upsertIntentVersion(name, sha, body)`, `insertRun({intentId, snapshotId, intentSha, kind, targetOrigin})`, `finishRun(runId, {verdict, explanation, llmCalls, evidence, reusedRepairId})`, `insertChange(report)`, `insertStepPlan(...)`, `insertRepair(...)`, `setRepairStatus(repairId, status, actor, reason)`, `insertValidationRun(repairId, runId, verdict, oracleSummary)`, `insertOracleResults(validationRunId, results)`, `insertApproval(repairId, decision, actor, reason)`, `insertKnownGood(pageId, snapshotId, repairId, stepPlanId)`, `currentKnownGood(intentId, siteId)`, `listChanges(filter)`, `listAudit(filter)`.
   Store JSON columns with `JSON.stringify`. Return parsed objects.
5. `tests/helpers/db.ts`: `tempDb()` creates a fresh DB in `os.tmpdir()`.

**Tests (one `it` per id; all in `tests/unit/db.test.ts`):**
- `[R-F3-01] persists site and page versions`
- `[R-F3-02] persists a snapshot and dedups identical content_hash`
- `[R-F3-03] persists a change with classification and severity`
- `[R-F3-04] persists proposed and applied repairs`
- `[R-F3-05] persists approval and rejection records`
- `[R-F3-06] persists verdicts, oracle results and known_good rollback references`
- `[R-F3-07] a repair row requires change_id (FK) and links to its validation run`
- `[R-F4-07] UPDATE and DELETE on audit_log abort` (also approvals, validation_runs, oracle_results, step_plans)
- `[R-F4-04] repair cannot become validated without a passing validation_run`
- `every repo write inserts exactly one audit_log row`

**Acceptance:** `npm run verify` exit 0. Then the `guardrail-auditor` reviews `src/db/` (≤10 lines; fix concrete exploits).

**Do NOT:** use UPDATE/DELETE on append-only tables anywhere; build SQL by string concatenation (use `?` params only).

---

## T03 — Intent loader (G1)
**FLASH · Lane 1 · Depends T01 · R-PS-01, R-F4-01 · Read PRD §7 (types), §8.1**

**Files:** `src/types.ts` (add `IntentSchema` and every type from PRD §7 as zod schemas), `src/intent/load.ts`, `tests/unit/intent.test.ts`, `tests/guardrails/intent.test.ts`.

**Steps:**
1. In `src/types.ts`, add all the zod schemas from PRD §7, plus `IntentSchema` matching §8.1 (`.strict()` at every object level). The `expected` items are a discriminated union on `type`: `backend_state | network_status | dom_state`.
2. `loadIntent(path): { intent: Readonly<Intent>; sha256: string; raw: string }`. Read the bytes, compute sha256 hex, parse YAML, validate with zod, resolve `{{data.X}}` strings (throw on an unknown key), then `deepFreeze`.
3. `deepFreeze` is recursive `Object.freeze`.

**Tests:**
- `[R-PS-01] loads an intent as goal + data + expected outcomes, with no selectors` (assert no field named `selector` anywhere)
- `rejects unknown keys`
- `rejects template referencing missing data key`
- `[R-F4-01] mutating a loaded intent throws and sha256 is stable` (guardrails folder)

**Acceptance:** `npm run verify` exit 0.

**Do NOT:** add selector fields to the intent; edit `intents/`.

---

## T04 — Snapshotter
**PRO · Lane 1 · Depends T01, T03 · R-F1-01, R-F3-02 · Read PRD §9**

**Files:** `src/browser/session.ts`, `src/snapshot/capture.ts`, `src/snapshot/hash.ts`, `src/match/text.ts` (only `norm` for now), `tests/integration/snapshot.test.ts`, `tests/unit/hash.test.ts`.

**Steps:**
1. `session.ts`: `openSession({ headless = true }) → { browser, context, page, network: NetworkEvent[], close() }`. Use viewport 1280×800. Listen with `page.on('response', r => network.push({ method: r.request().method(), url: r.url(), path: new URL(r.url()).pathname, status: r.status(), ts: Date.now() }))`. Set `context.setDefaultTimeout(ACTION_TIMEOUT_MS)` and `setDefaultNavigationTimeout(NAV_TIMEOUT_MS)`.
2. `capture.ts`: implement PRD §9.1 steps 1–13 exactly. Put the browser-side function in one constant string or function passed to `page.evaluate`. It must not reference outer TS variables.
3. `hash.ts`: PRD §9.2.
4. Screenshot file name: `<first 12 of contentHash>-<path slug>.png` under `join(HOME,'screenshots')`.

**Tests (start fixtures with `startFixture`):**
- `[R-F1-01] captures a baseline snapshot of v1 /cart including button 'Checkout' with selector #checkout-button`
- `captures v2 /bag with a button named 'Proceed to payment' and nearText 'Your bag'`
- `nearText of 'Add to cart' under Gizmo Mini is 'Gizmo Mini'`
- `two captures of the same page produce identical elements JSON and contentHash`
- `contentHash ignores cart count digits` (unit: names "Cart (1)" vs "Cart (2)")
- `[R-F3-02] snapshot with screenshot is stored once per content_hash` (uses Repo)

**Acceptance:** `npm run verify` exit 0.

**Do NOT:** use `page.accessibility` (removed); use `waitForTimeout`.

---

## T05 — Matcher + differ
**PRO · Lane 1 · Depends T04 · R-F1-02, R-F1-03, R-F1-04, R-F1-05, R-F2-01 · Read PRD §10.1, §10.2, §10.3**

**Files:** `src/match/text.ts`, `src/match/synonyms.ts`, `src/match/score.ts`, `src/match/matcher.ts`, `src/diff/differ.ts`, `tests/unit/text.test.ts`, `tests/unit/score.test.ts`, `tests/integration/matcher.test.ts`, `tests/integration/differ.test.ts`.

**Steps:**
1. `text.ts`: `levenshtein`, `levRatio`, `tokenSetRatio` (empty → 0), `norm`. Copy the formulas from PRD §10.1.
2. `synonyms.ts`: copy the groups. `synonymBoost(a,b,sim)`.
3. `score.ts`: `similarity(t, e)` with the exact weights. Export `elementToTarget(e, snapshotId)` too.
4. `matcher.ts`: `findReplacement(t, snap, policy)` per §10.2 steps 1–6. `resolveBySelector(page, snap, t, policy)`.
5. `differ.ts`: `diffSnapshots(base, head)` per §10.3.
6. Load `policy.json` through a `loadPolicy()` helper (in `src/governance/policy.ts`; create a minimal version now).

**Tests:**
- unit `tokenSetRatio('add to cart','add to bag') > 0.6`; `tokenSetRatio('','') === 0`
- unit `synonymBoost lifts 'Checkout' vs 'Proceed to payment' to ≥ 0.85`
- integration (real fixture snapshots):
  - `[R-F2-01] v1 'Add to cart' (Gizmo Mini) → v2 single match 'Add to bag' under Gizmo Mini`
  - `v1 'Checkout' → v2 /bag: best candidate is 'Proceed to payment'` (kind single, or none if the score is below strong; assert `best.name` either way)
  - `v1 'Pay now' vs v2-ambiguous payment page → kind ambiguous with 'Pay' and 'Complete order'`
  - `forbidden names are never candidates`
  - `resolveBySelector rejects an element that reuses the id but differs in role/name` (build a synthetic snapshot)
- differ:
  - `[R-F1-02] v1 vs v2 home reports ELEMENT_RENAMED for 'Add to cart'` and `ELEMENT_REMOVED/ADDED for cart link vs Shopping bag`
  - `[R-F1-03] reports ATTR_CHANGED when #add-GZ-MINI id is removed`
  - `[R-F1-04] reports ELEMENT_MOVED or LAYOUT_SHIFT for the checkout button moving top`
  - `[R-F1-05]` lives in T11 (flow change). Put a placeholder TODO-free note in progress.md, not a vacuous test.

**Acceptance:** `npm run verify` exit 0.

**Do NOT:** change weights or thresholds to make a test pass. Add synonyms instead, or report BLOCKED with the actual scores printed.

---

## T06 — Change report + severity
**FLASH · Lane 1 · Depends T05, T02 · R-F1-06, R-F3-03 · Read PRD §7 ChangeReport, §10.3 severity, §10.7**

**Files:** `src/diff/severity.ts`, `src/diff/report.ts`, `src/explain/templates.ts` (explainChange only), `src/cli.ts` (add the `diff` command), `tests/unit/report.test.ts`.

**Steps:**
1. `severity(items, affectedSteps, oracleFailed, appError): Severity` per §10.3.
2. `buildChangeReport({ base, head, items, affectedSteps, classification, confidence, explanation }) → Omit<ChangeReport,'changeId'>`. `kind` = the first item after the priority sort.
3. `explainChange(...)`: the template from §10.7.
4. CLI `healtest diff <baseId> <headId> [--json]`: load both snapshots from the DB, print the items (JSON or one line each).

**Tests:**
- `[R-F1-06] change report has severity, classification, confidence and evidence items`
- `[R-F3-03] change report is stored and read back identical`
- `severity is CRITICAL when an oracle failed regardless of items`
- `explanation template contains the old name, old selector and new name`

**Acceptance:** `npm run verify` exit 0; manual `node dist/cli.js diff <v1cartSnap> <v2bagSnap>` prints sensible lines (CHECKPOINT).

---

## T07 — Executor + guards (G3)
**FLASH+REVIEW · Lane 2 · Depends T02, T04 · R-PS-02, R-F4-03 · Read PRD §10.4 (action shapes), §15 G2/G3**

**Files:** `src/executor/guards.ts`, `src/executor/executor.ts`, `tests/guardrails/guards.test.ts`, `tests/integration/executor.test.ts`.

**Steps:**
1. `guards.ts`:
   - `assertOriginAllowed(url, intent)` throws `GuardViolation('ORIGIN')`.
   - `assertDataKey(key, intent)` throws `GuardViolation('DATA')` if the key is not in `intent.data`.
   - `assertBudget(count, intent)` throws `GuardViolation('BUDGET')`.
   - `assertObserved(ref, snap)` throws `GuardViolation('UNOBSERVED')` if the ref is not in `snap.elements`.
   - `assertNotForbidden(name)` throws `GuardViolation('FORBIDDEN')`.
2. `executor.ts`: `executeStep(page, step, el: ElementRecord, intent, snap)`. Call `assertObserved(el.ref, snap)`. Locate with `page.locator('[data-healtest-ref="'+el.ref+'"]')`.
   - `click` → `.click()`
   - `fill` → `assertDataKey` then `.fill(String(intent.data[key]))`
   - `check` → `.check()`
   - `select` → `.selectOption({ label: value })`

   Afterwards wait for networkidle (catch the timeout) and `assertOriginAllowed(page.url())`.
3. Add `page.on('framenavigated')` in session to enforce the allowlist: on an off-list main-frame navigation, record a violation, which the pipeline reads.

**Tests:**
- `[R-PS-02] executes click and fill steps on v1 and reaches /checkout`
- `[R-F4-03] navigation to a non-allowlisted origin throws GuardViolation ORIGIN`
- `[R-F4-03] fill with a dataKey not in intent.data throws GuardViolation DATA`
- `[R-F4-03] exceeding actionBudget throws GuardViolation BUDGET`
- `[R-F4-02] executing a ref not present in the snapshot throws UNOBSERVED`

**Acceptance:** `npm run verify` exit 0, then `guardrail-auditor` on `src/executor/`.

**Do NOT:** ever type a value that does not come from `intent.data`.

---

## T08 — Oracle runner (G4/G5)
**PRO · Lane 2 · Depends T07 · R-F4-04, R-F4-05, R-PS-05 · Read PRD §8.1 expected, §10.5 hard rules**

**Files:** `src/oracle/runner.ts`, `tests/integration/oracles.test.ts`, `tests/guardrails/oracles.test.ts`.

**Steps:**
1. `runOracles(intent, targetOrigin, network: NetworkEvent[], page) → OracleResult[]`, one result per `intent.expected` item, in order:
   - `backend_state`: `fetch(targetOrigin + request.path, { method })` → JSON → `arr = json[select]` → filter items where every `where` key equals → check `expect.count` (if set) and that every filtered item has `expect.fields`. `detail = { expectedCount, actualCount, mismatches: [{field, expected, actual}] }`.
   - `network_status`: filter `network` by `new RegExp(urlPattern).test(path)` (and method if set). `forbidStatusAtLeast` → ok if none ≥ N. `requireStatusIn` → ok if at least one matching request exists and **all** matching statuses are in the list. `detail = { matched: [{method,path,status}] }`.
   - `dom_state`: `(await page.innerText('body')).toLowerCase()` includes any of `textAny`. Set `supportingOnly: true` from the intent.
2. Wrap each oracle in try/catch. An exception → `ok:false, detail:{ error: message }`.
3. Export `allRequiredPass(results) = results.filter(r => !r.supportingOnly).every(r => r.ok)`.

**Tests:**
- `[R-PS-05] backend oracle passes after a real v1 purchase`
- `[R-F4-05] on v2-bug the DOM says 'Order confirmed' but allRequiredPass is false`
- `[R-F4-04] oracle that throws (server stopped) is ok:false, never pass`
- `requireStatusIn fails when no matching request exists`

**Acceptance:** `npm run verify` exit 0.

**Do NOT:** import anything from `src/llm`; read UI text in `backend_state`.

---

## T09 — Verdict + classification
**PRO · Lane 2 · Depends T08 · R-PS-06, R-SC-B · Read PRD §10.5, skill change-classification**

**Files:** `src/classify/verdict.ts`, `tests/unit/verdict.test.ts`, `tests/guardrails/verdict.test.ts`.

**Steps:**
1. `decideVerdict(input) → { verdict, classification, exitCode }`, implementing the §10.5 table rows 1–6 **in order** as plain `if` statements.
2. `exitCodeFor(verdict)`: PASS/HEALED_PASS→0, APP_BUG→10, NEEDS_REVIEW→11, FAIL_UNREPAIRABLE→12.

**Tests:** one `it` per table row (6), plus:
- `[R-PS-06] UI change with passing backend oracles → HEALED_PASS; same UI with failed backend oracle → APP_BUG`
- `[R-SC-B] appError with dom_state ok and backend failed → APP_BUG exit 10`
- `[R-F4-05] verdict.ts has no import from src/llm` (read the file text and assert)
- `supporting-only oracle failing alone does not change PASS`

**Acceptance:** `npm run verify` exit 0.

---

## T10 — Planner + first-run pipeline (CHECKPOINT: v1 PASS)
**PRO · Lane 1 · Depends T05, T06, T08, T09 · R-PS-04, R-F2-03, R-PS-02, R-PS-07 · Read PRD §10.4, §11 steps 1–6a and 8, §10.7**

**Files:** `src/planner/lexicon.ts`, `src/planner/heuristic.ts`, `src/planner/plan.ts`, `src/llm/client.ts` (interface + `NullClient` only; mode off), `src/governance/reuse.ts` (known-good lookup only), `src/pipeline/run.ts` (6a path only), `src/cli.ts` (`run`, `report`), `tests/unit/heuristic.test.ts`, `tests/integration/planner.test.ts`, `tests/integration/run-v1.test.ts`.

**Steps:**
1. `lexicon.ts`: copy FIELD_PATTERNS, STAGES and FORBIDDEN_NAME.
2. `heuristic.ts`: `nextAction(state)` per §10.4 steps 1–5, including the stage-exclusion rule. `productAdded` is derived from completedSteps (any click whose target name matches the `add` stage).
3. `plan.ts`: the `planAndExecute` loop. A new snapshot is captured before every action; the step target is taken from that snapshot.
4. `run.ts`: steps 1–5, 6a and 8 of PRD §11. Print the phase lines from PRD §12.1.
5. CLI `run` (options `--target`, `--db`, `--llm`) and `report <runId> --json`. Exit with `exitCode`.

**Tests:**
- unit (synthetic snapshots):
  - `fills email before address when label is 'Email address'`
  - `'Add to cart' is never a cart-stage candidate`
  - `two different pay-stage names → ambiguous`
  - `doneWhen path → done`
- `[R-PS-04] planner builds a full step list on v2 from intent alone (no stored plan) and reaches /confirmation`
- `[R-F2-03] planner on v2 handles the split checkout and the terms checkbox`
- `[R-PS-07] run on v1 with empty DB → PASS exit 0 and baseline plan + known_good stored`

**Acceptance:** `npm run verify` exit 0, plus manual `npm run build && node dist/cli.js run intents/checkout.intent.yaml --target http://127.0.0.1:4101` prints `[verdict] PASS` (start `npm run fixtures` first). **CHECKPOINT.**

**Do NOT:** call any LLM (mode is off); add verdict logic outside verdict.ts.

---

## T11 — Replay + repair engine (G2, G6)
**PRO · Lane 1 · Depends T10 · R-F2-01, R-F2-02, R-F4-02, R-SC-C, R-F1-05, R-PS-03 · Read PRD §11 step 6b, §10.2, §10.7**

**Files:** `src/repair/engine.ts`, `src/llm/gemini.ts`, `src/llm/replay.ts`, `src/planner/llm.ts`, update `src/pipeline/run.ts` (6b), `tests/integration/repair.test.ts`, `tests/guardrails/repair.test.ts`.

**Steps:**
1. `engine.ts`: `replayWithRepair(session, intent, plan, repo)` implementing §11 6b exactly. Return `{ newSteps, changes: ChangeReport[], repaired, replanned, ambiguity, appError, llmCalls }`.
2. Each detection inserts a change via `repo.insertChange` (with `affected_steps_json`) and adds `FLOW_CHANGED` on replan.
3. Ambiguity: insert a repair with status `needs_review`, `proposal_json.pendingChoice = { stepId, candidates }`.
4. LLM (fallback only when the heuristic is stuck and mode ≠ off): build `GeminiClient.completeJson(system, user)` using `@google/genai`. **First** write `scripts-dev/llm-probe.mjs` to confirm the SDK call shape; delete it after. `replay.ts`: key = sha256(model+system+user) → `.healtest/llm-cache/<key>.json`. Mode `record` = call + save; `replay` = read (on a miss return `stuck`); `live` = call only.
5. Every LLM reply is zod-parsed. `ref` must be in the snapshot and `dataKey` in the intent, else → stuck.

**Tests:**
- `[R-F2-01] replaying the v1 plan on v2 repairs 'Add to cart' to the observed 'Add to bag' element`
- `[R-F2-02] repaired step stores the new selector and target snapshotId`
- `[R-F1-05] replaying v1 plan on v2 records FLOW_CHANGED when card fields are not on the details page`
- `[R-PS-03] each change explanation names the old step, the evidence and the new target`
- `[R-SC-C] v2-ambiguous → needs_review repair with ≥2 candidates and run stops`
- `[R-F4-02] an LLM reply with a ref not in the snapshot is rejected` (use a fake LlmClient)
- `[R-F4-03] an LLM reply with a dataKey not in intent.data is rejected`

**Acceptance:** `npm run verify` exit 0, then **`guardrail-auditor`** (fix concrete exploits; re-verify).

**Do NOT:** let replay "try another path" after a 5xx; let the LLM return selectors or values.

---

## T12 — Validation loop + links (CHECKPOINT: core demo)
**PRO · Lane 1 · Depends T11 · R-F2-04, R-F3-04, R-F3-06, R-F3-07, R-PS-09, R-SC-A, R-SC-B · Read PRD §11 step 7**

**Files:** `src/validate/validation.ts`, update `src/pipeline/run.ts` (step 7), `src/cli.ts` (`validate`), `tests/integration/validation.test.ts`, `tests/integration/run-v2.test.ts`.

**Steps:**
1. `runValidation(repo, repairId, opts) → { runId, validationRunId, verdict, oracleResults }`:
   - open a **new** session (fresh context) and POST `/__reset`
   - insert `runs(kind 'validation')`
   - strict replay of the repair's step plan using only `resolveBySelector` (no matcher, no planner). A missing step → FAIL_UNREPAIRABLE.
   - stop on 5xx
   - `runOracles`, then `decideVerdict` (repaired=true)
   - insert `validation_runs` + `oracle_results`
2. In `run.ts` step 7: insert the step plan + repair (proposed), run `runValidation`, then set the status to validated or rejected per the verdict. `classification` is BREAKING_UI if replanned, else HARMLESS_UI. Policy auto-accept comes in T13; leave it as validated for now.
3. The final run verdict uses the validation oracles.

**Tests:**
- `[R-F2-04] validation reruns the repaired plan in a fresh context against the original intent oracles`
- `[R-F3-04] repair stored with proposal_json steps and step_plan_id`
- `[R-F3-06] validation run stores verdict and per-oracle results`
- `[R-F3-07] change_id → repair_id → validation_run_id links are present`
- `[R-SC-A] [R-PS-09] v1 then v2 → HEALED_PASS exit 0, repair validated, backend has 1 order`
- `[R-SC-B] fresh DB: v1 then v2-bug → APP_BUG exit 10, repair rejected`

**Acceptance:** `npm run verify` exit 0, then **`guardrail-auditor`**. **CHECKPOINT:** run the v1 → v2 → v2-bug commands manually and paste the output.

---

## T13 — Governance: policy, approvals, rollback, reuse
**PRO · Lane 1 · Depends T12 · R-F4-06, R-F4-07, R-F3-05, R-PIPE-01 · Read PRD §8.3, §11 step 5 and "Approval actions", §17 G1**

**Files:** `src/governance/policy.ts` (complete), `src/governance/approvals.ts`, `src/governance/reuse.ts` (full lookup), update `run.ts`, `src/cli.ts` (`approve`, `reject`, `resolve`, `rollback`), `tests/integration/governance.test.ts`, `tests/guardrails/governance.test.ts`.

**Steps:**
1. `canAutoAccept(classification, candidateCount, oracleResults, policy)`.
2. `approvals.ts`: `approve`, `reject`, `resolveCandidate`, `retry`, `rollback` exactly as PRD §11 describes. Each one validates the current status first and throws `InvalidTransition` otherwise.
3. `reuse.ts`: `findPlanForRun(repo, intentId, siteId, startHash)` with lookup order (a) → (b) → (c).
4. `run.ts`: set `runs.reused_repair_id`; count `llm_calls`; after validation, apply the auto-accept policy (status applied + known_good).

**Tests:**
- `[R-PIPE-01] second v2 run reuses the validated repair with 0 LLM calls and HEALED_PASS`
- `after approve, a v2 run returns PASS (repair is known-good)`
- `[R-F4-06] needs_review repair cannot be approved until a candidate is resolved and validated`
- `[R-F3-05] approve and reject write approvals rows with actor and reason`
- `[R-F4-07] rollback inserts a known_good row pointing to the previous plan and v2 run then replays the old plan`
- `HARMLESS_UI single-candidate repair is auto-applied by policy; BREAKING_UI is not`
- `resolveCandidate on v2-ambiguous with 'Complete order' → validated`

**Acceptance:** `npm run verify` exit 0, then **`guardrail-auditor`**.

---

## T14 — Explanations (all templates)
**FLASH · Lane 1 · Depends T13 · R-PS-03 · Read PRD §10.7**

**Files:** `src/explain/templates.ts` (replan, app bug, ambiguous, verdict summary), wire it into `run.ts` → `runs.explanation`, `tests/unit/explain.test.ts`.

**Tests:**
- `[R-PS-03] explanation for HEALED_PASS cites change ids, old and new targets and oracle ids`
- `APP_BUG explanation cites the failed oracle detail and the 5xx path`
- `ambiguous explanation lists each candidate with its score`
- `explanations never contain the card number` (search for the full card number)

**Acceptance:** `npm run verify` exit 0.

---

## T15 — CLI completion + Decision-A guard
**FLASH · Lane 2 · Depends T14 · R-F2-05 · Read PRD §12.1**

**Files:** `src/cli.ts` (`scan`, `repair`; every command uses the `--db` option; exit codes), `tests/integration/cli.test.ts`, `tests/guardrails/decision-a.test.ts`.

**Steps:**
1. Finish every command in the PRD §12.1 table. Unknown errors → print `error: <message>` and exit 1.
2. Decision A guard test: grep `src/**/*.ts` for `writeFile`, `fs.write`, `appendFile`, `rm(` and `unlink` usages. Allowed only under `src/db/`, `src/llm/replay.ts` and `src/snapshot/capture.ts` (screenshots), and the paths written must resolve under `HOME`.

**Tests:**
- `cli exit codes: 0 PASS, 10 APP_BUG, 11 NEEDS_REVIEW, 12 FAIL_UNREPAIRABLE, 1 bad intent path`
- `[R-F2-05] HealTest has no write path outside HEALTEST_HOME (no writes to target app source)`

**Acceptance:** `npm run verify` exit 0.

---

## T16 — Local API
**FLASH+REVIEW · Lane 3 · Depends T02 (data), T13 (actions) · backend for R-F5-01..07 · Read PRD §12.2, rule security.md**

**Files:** `src/server/http.ts`, `src/server/csrf.ts`, `src/server/api.ts`, `src/cli.ts` (`serve`), `tests/integration/api.test.ts`.

**Steps:**
1. `http.ts`: `createServer(routes)`. A route is `{ method, pattern: RegExp, handler(req, res, params, body) }`. Use a JSON body parser with a 1 MB limit and static file serving for `dashboard/`, mapping only known extensions (.html, .css, .js, .png, .svg) and preventing path traversal (`resolve` + `startsWith(dashboardDir)`).
2. `csrf.ts`: `token = randomBytes(24).toString('hex')` at startup; `check(req)` compares header `x-csrf-token` with `timingSafeEqual`.
3. `api.ts`: every endpoint in the PRD §12.2 table. POST handlers call `governance/approvals.ts`.
4. `serve` listens on `127.0.0.1` only (default port 4300) and prints `HealTest dashboard: http://127.0.0.1:4300`.

**Tests:**
- `GET /api/sites returns the seeded site with health badge`
- `POST approve without CSRF → 403; without confirm → 400; valid → 200 and status applied`
- `static server refuses ../ traversal`
- `server binds 127.0.0.1 only`

**Acceptance:** `npm run verify` exit 0, then `guardrail-auditor` on `src/server/`.

---

## T17 — Dashboard shell + D1 overview
**FLASH · Lane 3 · Depends T16 · R-F5-01, R-F5-08 · Read harness §16 (all), rule dashboard.md, PRD §12.3**

**Files:** `dashboard/index.html`, `dashboard/app.css`, `dashboard/app.js`, `tests/integration/dashboard-d1.test.ts`.

**Steps:**
1. `index.html`: `<link rel="stylesheet" href="tokens.css">` then `app.css`. Add the crimson band, a header with nav links (`#/`, `#/changes`, `#/audit`), a theme toggle button, and one `<main>` containing sections with ids `view-overview`, `view-changes`, `view-change`, `view-repair` and `view-audit` (only one is visible at a time). Use `<dialog id="confirm-dialog">`.
2. `app.js`: a hash router; a `api(path, opts)` fetch helper that gets the CSRF token from `/api/session` once; an `el(tag, attrs, ...children)` helper that sets text with `textContent` only (never `innerHTML` with data); `renderOverview()` showing the sites table and recent runs with `badge(verdict)` (icon + text per harness §16.2); and the theme toggle (`document.documentElement.dataset.theme`, localStorage in try/catch).
3. `app.css`: the component classes from harness §16.3 (extend them). **Only `var(--…)` colours.**

**Tests:**
- `[R-F5-01] dashboard overview lists sites and recent runs with verdict badges` (Playwright: open `serve`, assert text)
- `[R-F5-08] dashboard uses only tokens.css colours` (spawn `node scripts/check-dashboard.mjs`, expect exit 0)
- `badges show icon and text label for every verdict`

**Acceptance:** `npm run verify` exit 0 (includes check-dashboard).

**Do NOT:** write any hex/rgb colour outside tokens.css; use red for failure; load any external URL.

---

## T18 — Dashboard D2, D3, D4
**FLASH · Lane 3 · Depends T17 · R-F5-02, R-F5-03, R-F5-04 · Read PRD §12.3, harness §16.4**

**Files:** `dashboard/app.js`, `dashboard/app.css`, `tests/integration/dashboard-d2-d4.test.ts`.

**Steps:**
1. `#/changes`: left rail with severity checkboxes (LOW, MEDIUM, HIGH, CRITICAL) and a classification `<select>`. The list (timeline) is newest first; each row shows chg id, kind, severity badge, classification, time and the first 120 chars of the explanation. Filters re-query `/api/changes?severity=…`.
2. `#/changes/:id`: D2 two `<figure>`s with `<img src="/api/snapshots/<id>/screenshot" alt="Before: <path>">`, using the placeholder text "No screenshot" if missing. D3 is a two-column table for each evidence item, with rows role/name/selector/attrs, before vs after. Mark a changed cell with class `diff-changed` and prefix `≠ `.

**Tests:**
- `[R-F5-02] change view shows before and after screenshots`
- `[R-F5-03] change view shows side-by-side selector diff with changed cells marked`
- `[R-F5-04] severity filter hides LOW changes when unchecked`

**Acceptance:** `npm run verify` exit 0.

---

## T19 — Dashboard D5, D6, D7
**FLASH · Lane 3 · Depends T18 · R-F5-05, R-F5-06, R-F5-07 · Read PRD §12.3 D6 behaviour, harness §16.2 seal**

**Files:** `dashboard/app.js`, `dashboard/app.css`, `tests/integration/dashboard-d5-d7.test.ts`.

**Steps:**
1. D5 (in change and repair views): a steps table (stepId, action, old target → new target, provenance badge, score, alternatives) and the explanation paragraph.
2. D6: Approve / Reject / Retry / Rollback / (needs_review only) a candidate radio list + "Validate choice". Enable each button only for valid statuses. Approve/Reject/Rollback open `#confirm-dialog` with required actor + reason. POST with `confirm:true`. Re-render on success. Show the `.seal` "APPROVED" when the status is approved or applied.
3. D7: validation runs table (verdict badge, time), oracle results (✓/✕ + oracle id + short detail), and the audit trail for the repair. Global `#/audit` table with an entity filter.

**Tests:**
- `[R-F5-05] repair preview shows old and new targets and the explanation`
- `[R-F5-06] approve via dialog sets status applied and shows the seal; reject and rollback require a reason`
- `[R-F5-07] repair view lists validation results and audit rows`
- `needs_review repair shows candidate choices and Validate choice calls resolve`

**Acceptance:** `npm run verify` exit 0, then **CHECKPOINT** (human clicks through both themes).

---

## T20 — `npm run demo`
**FLASH · Lane 1 · Depends T15, T19 · R-PS-07, R-PS-08, R-PS-09 · Read PRD §14**

**Files:** `src/demo.ts`, `tests/integration/demo.test.ts` (short version: acts 1–3 only).

**Steps:**
1. Implement acts 1–8 of PRD §14 by calling `runIntent` / approvals directly (not via a subprocess), printing a banner per act: `═══ ACT 2 · Version B: the redesign ═══`.
2. `--interactive` waits for Enter between acts (readline). `--serve` starts the dashboard at the end.
3. Record LLM calls (`HEALTEST_LLM=record`) once if any act needs them; commit the `.healtest/llm-cache` files used by the demo into `demo-cache/` and point `HEALTEST_HOME` there for replay. In the expected heuristic-only path this folder stays empty, which is fine.

**Tests:**
- `[R-PS-08] demo uses v2 as an intentional UI change of v1 (the v1 plan fails replay on v2)`
- `demo acts 1–3 produce PASS, HEALED_PASS, HEALED_PASS with llmCalls 0`

**Acceptance:** `npm run verify` exit 0 and `npm run demo` completes in under 4 minutes.

---

## T21 — Scenarios green under the demo oracle
**PRO · Lane 1 · Depends T20 · R-SC-A, R-SC-B, R-SC-C · Read harness §17, `oracles/demo.oracle.mjs` (read-only)**

**Steps:**
1. Run `npm run verify:demo`. Fix product code until `trace` and `demo-oracle` pass. Never edit the oracle or the fixtures. If the oracle seems wrong, write BLOCKED with the exact assertion and stop.
2. Run the `spec-auditor` subagent. For every `WEAK` or `MISSING`, strengthen or add the test (never by weakening).

**Acceptance:** `npm run verify:demo` exit 0; spec-auditor reports all P0 R-IDs OK.

---

## T22 — Final audit
**PRO · Lane 1 · Depends T21**

**Steps:** run `guardrail-auditor` (full scope), `spec-auditor`, `node scripts/check-dashboard.mjs` and `node scripts/check-trace.mjs`. Fix concrete findings only. Re-run `npm run verify:demo`. Write `README.md`: problem, idea (intent / oracle / steps), architecture diagram, verdict table, setup on Windows + macOS, demo commands, how to write a new intent, limitations.

**Acceptance:** all green; README present; human rehearses `npm run demo` twice.

---

## E. Task cards — P1 (only after T22 is green; branch `ralph/p1`, `RALPH_PLAN=ralph/PLAN-P1.md`)

## M01 — MCP read-only server
**FLASH+REVIEW · R-F6-01 · Read harness §14, rule mcp.md**
- **Files:** `src/mcp/readonly.ts`, `src/mcp/tools-read.ts`, `tests/integration/mcp-readonly.test.ts`.
- **First** verify the `@modelcontextprotocol/sdk` API with a probe script (harness says the names are unverified).
- Use stdio transport. Tools: `list_monitored_sites`, `get_change_report {changeId}`, `compare_snapshots {baseSnapshotId, headSnapshotId}` (pure, not persisted), `get_run_report {runId}`. Set `readOnlyHint: true`. Output is compact JSON (ids, counts, short strings; never DOM or screenshots). Each call writes `audit_log` (actor `mcp:<clientName>`).
- **Tests:** `[R-F6-01] read-only server registers exactly the four read tools`; `tool output never includes ariaYaml or screenshot bytes`.

## M02 — MCP operator server
**PRO · R-F6-02**
- **Files:** `src/mcp/operator.ts`.
- Refuse to start unless `HEALTEST_OPERATOR=1`. Tools: `scan_website`, `propose_repair`, `validate_repair` (URL allowlist enforced; audited, including denials).
- **Tests:** `[R-F6-02] operator server refuses to start without HEALTEST_OPERATOR=1`; `scan_website on a non-allowlisted origin is denied and audited`.

## M03 — Approval tokens + privileged tools
**PRO, then guardrail-auditor · R-F6-03**
- Add a table `approval_tokens(id, repair_id, token_hash, expires_at, used_at)` via migration `003`.
- Dashboard button "Authorize via MCP" on a repair → `POST /api/repairs/:id/mcp-token` (CSRF) → returns the token once.
- `approve_repair {repairId, approvalToken}` and `rollback_repair {…}`: verify the sha256 hash, repair match, not expired (5 min) and not used. Mark it used in the same transaction. Otherwise return `APPROVAL_REQUIRED`.
- **Tests:** `[R-F6-03] approve_repair without a valid token returns APPROVAL_REQUIRED`; `token is single-use`; `token bound to another repair is rejected`; `expired token rejected`.

## M04 — Plugin host
**PRO · R-F7-01 · Read harness §15, rule plugins.md**
- **Files:** `src/plugins/host.ts`, `src/plugins/manifest.ts` (zod for plugin.json), `tests/guardrails/plugins.test.ts`.
- Run out of process (`child_process.fork`) with input as JSON on stdin and output as JSON on stdout. Validate input and output against the manifest JSON Schemas (write a minimal validator for the subset used, or justify adding `ajv`). Enforce the network allowlist by passing an allowlisted `fetch` wrapper and denying others. Default `dryRun: true`. Redact payloads. Audit every invocation, including dry-run and denied.
- **Tests:** `[R-F7-01] plugin without a valid manifest is refused`; `output not matching outputSchema is rejected and audited`; `wildcard network permission rejected`.

## M05 — github-issue plugin
**FLASH · R-F7-02**
- **Files:** `plugins/github-issue/plugin.json` (harness §15), `plugins/github-issue/index.mjs`.
- Dry-run prints the redacted issue body: change id, classification, severity, explanation, dashboard link, repair status. Live mode needs `GITHUB_TOKEN` from env and a repo in `repoAllowlist`. POST `https://api.github.com/repos/{repo}/issues`.
- **Tests:** `[R-F7-02] dry-run produces a redacted issue body with no DOM or card data`; `repo not in allowlist is denied`.

---

## F. Definition of done (whole project)

1. `npm run verify:demo` exits 0 on a clean clone after `npm ci && npx playwright install chromium && npm run build`.
2. `npm run demo` shows: v1 PASS → v2 HEALED_PASS with explanation → reuse 0 LLM calls → approval seal → v2-bug APP_BUG despite "Order confirmed" → v2-ambiguous NEEDS_REVIEW → human resolve → validated.
3. The guardrail-auditor reports "no exploit found". The spec-auditor reports all P0 OK.
4. The dashboard D1–D7 works in light and dark themes, with keyboard navigation and statuses shown by icon + text.

## G. Common failure modes for lower models (read before starting any card)

| Symptom | Cause | Fix |
|---|---|---|
| Test passes on v2-bug | oracle reads DOM text | backend_state via `/__state` only; `allRequiredPass` ignores supportingOnly |
| Planner clicks "Add to cart" forever | `clickedOnPath` not tracked or `productAdded` not derived | derive from completedSteps; one click per ref per path |
| Every element matches everything | `tokenSetRatio('', '')` returned 1 | empty → 0 |
| Replay clicks the wrong button with a reused id | selector accepted without verification | `resolveBySelector` must check similarity ≥ 0.85 |
| Snapshot hash differs between runs | cart count or bbox in the hash | digits → `#`; bbox excluded |
| `verify` fails on lock | an agent touched fixtures/intents/oracles | `git checkout` that path; never edit locked files |
| Dashboard check fails | a literal colour in app.css/app.js | use `var(--token)` only |
| Flaky timing | `waitForTimeout` | use auto-waiting + `waitForLoadState('networkidle')` with catch |
| Migrations missing in dist | SQL not copied on build | build script copies `src/db/migrations` |
| Hook denies a command | not in the allowlist | use `npm run …` scripts; never bypass |
