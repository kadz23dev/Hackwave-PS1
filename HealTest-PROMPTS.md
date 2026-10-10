# HealTest — Copy-Paste Prompts for Lower-Tier Models (Antigravity Flash / Pro)

**Use with:** `docs/PRD.md` (HealTest-PRD.md), `docs/WORKSPLIT.md` (HealTest-WORKSPLIT.md), `harness.md` setup (AGENTS.md, rules, hooks).
**How:** one fresh chat per task. Paste **Prompt 0 (session primer)** first, then the task prompt. When something goes wrong, use the recovery prompts in §R.
**Why so long:** small models drift, skip steps, invent APIs and declare "done" early. Each prompt fixes the scope, lists exact names, gives a self-check, and forces evidence (command output) before "done".

---

## Contents

- Prompt 0: session primer (paste first, every chat)
- Phase 0 draft prompts: P-H1 intent, P-H2 fixtures, P-H3 demo oracle (a human reviews every line)
- Task prompts: P-T01 … P-T22
- P1 prompts: P-M01 … P-M05
- §R recovery prompts: R1 failing test · R2 stuck / loop · R3 scope creep · R4 fake "done" · R5 locked file · R6 threshold temptation · R7 hallucinated API · R8 context reset · R9 review triage · R10 explain-back check

---

## Prompt 0 — Session primer (paste at the start of EVERY chat)

```
You are a careful junior engineer building "HealTest", an intent-aware self-healing E2E testing tool
(Node 22, TypeScript strict, Playwright, SQLite via better-sqlite3, Vitest, plain HTML/CSS/JS dashboard).

BEFORE ANYTHING ELSE:
1. Read AGENTS.md completely. Its "Hard invariants" are absolute rules.
2. Read ONLY the task card and PRD sections named in the task prompt that follows. Do not read other cards.
3. Run `git status` and `npm run verify:fast` once and tell me the result in one line, so we know the starting state.

RULES FOR THIS WHOLE CHAT:
- Do exactly ONE task. Never "also fix" other things you notice; list them under "Noticed (not done)" at the end.
- Never edit these locked paths: intents/, oracles/, fixtures/, docs/requirements.md, docs/contract.md,
  harness.lock.json, dashboard/tokens.css, .agents/, AGENTS.md, scripts/hooks/, scripts/verify.mjs,
  scripts/ralph.mjs, scripts/check-*.mjs, .coderabbit.yaml. If you need one changed, STOP and say so.
- Never weaken a test: no .skip, no .only, no loosened assertions, no mocking the thing under test,
  no special-casing a fixture name in product code, no changing thresholds in policy.json.
- Never write placeholder code: no TODO, no "implement later", no empty function bodies, no fake return values.
- Never invent library APIs. If unsure how a library works, write a 5–10 line probe script in scripts-dev/,
  run it, read the output, then delete it.
- An LLM never decides a verdict. Verdicts come only from src/classify/verdict.ts using oracle results.
- Names given in backticks in the PRD/card (files, functions, types, JSON keys, DB columns, test names) are EXACT.
- Work in small steps. After each file: run `npm run verify:fast`. Fix errors before writing the next file.
- No sleeps/waitForTimeout. No external URLs in the dashboard. No literal colours outside tokens.css.
- Every test that proves a requirement has the requirement tag in its name, e.g. it('[R-F4-02] ...').

"DONE" MEANS ALL OF:
  a) `npm run verify` exits 0 in THIS chat (paste the final PASS lines),
  b) every test name listed in the task card exists and passes,
  c) the self-check list in the task prompt is answered YES item by item with file:line evidence,
  d) commit "T##: <summary>", tick the task box in ralph/PLAN.md, add ≤5 lines to ralph/progress.md.

IF STUCK: same error twice after two genuine fix attempts → write "BLOCKED: T##: <exact error + what you tried>"
in ralph/progress.md and stop. Do not try a third random fix.

FINAL MESSAGE FORMAT (always):
  Task: T##
  Files changed: <list>
  Verify: <PASS/FAIL lines>
  Self-check: <each item: YES + file:line>
  Noticed (not done): <list or "none">
  Status: DONE | BLOCKED (<reason>)

Reply "READY" after reading AGENTS.md and running the two commands. Then wait for the task prompt.
```

---

# Phase 0 draft prompts (run BEFORE locking; a human reviews the result line by line)

## P-H1 — Intent file draft

```
TASK H1 (human-owned file; you are drafting for review). Read docs/PRD.md §8.1 only.

Create intents/checkout.intent.yaml with EXACTLY the content structure of PRD §8.1:
- keys in this order: name, site, goal, startPath, allowedOrigins, actionBudget, data, planner, expected
- data keys: product, email, name, address, cardNumber, expiry, cvc (cardNumber/expiry/cvc as quoted strings)
- expected has 4 oracles with ids: order-created (backend_state), no-server-errors (network_status),
  order-api-ok (network_status, method POST, requireStatusIn [200, 201]),
  confirmation-shown (dom_state, supportingOnly: true)
- No CSS selectors anywhere in the file.

Self-check (answer each YES/NO):
1. Is every success condition except confirmation-shown about backend state or HTTP status?
2. Is confirmation-shown marked supportingOnly: true?
3. Does where.email use the template "{{data.email}}" and does that key exist in data?
4. Are all four origins 127.0.0.1:4101–4104 listed?
Then print the file and stop. Do not create any other file.
```

## P-H2 — Fixtures draft (the app under test)

```
TASK H2 (human-owned; you are drafting for review). Read docs/PRD.md §13 only. Nothing else.

GOAL: a zero-dependency fake shop with 4 variants that HealTest will test.

CREATE:
  fixtures/server.mjs
  fixtures/shop-v1/{index.html,cart.html,checkout.html,confirmation.html}
  fixtures/shop-v2/{index.html,bag.html,details.html,payment.html,confirmation.html}
  fixtures/shop-v2-bug/   (copy of shop-v2 HTML; payment.html differs only as specified)
  fixtures/shop-v2-ambiguous/ (copy of shop-v2 HTML; payment.html has two submit buttons)

server.mjs REQUIREMENTS:
- Only `node:http`, `node:fs`, `node:path`, `node:url`. No npm packages.
- CLI: `--variant <name> --port <n>` or `--all` (v1:4101, v2:4102, v2-bug:4103, v2-ambiguous:4104). `--port 0` = random free port.
- After listening print EXACTLY one line per server: `LISTENING <variant> <port>` (tests parse it).
- Routes per variant (map URL path → HTML file):
    v1: / → index.html, /cart → cart.html, /checkout → checkout.html, /confirmation → confirmation.html
    v2*: / → index.html, /bag → bag.html, /checkout/details → details.html, /checkout/payment → payment.html,
         /confirmation → confirmation.html
- In-memory state PER SERVER PROCESS/VARIANT: cart (array of skus), orders (array), requests (array of {method,path,status}).
  Record every request's method, path and final status in `requests`.
- API (all JSON):
    POST /api/cart {sku}            → push sku → 200 {count}
    GET  /api/cart                  → {items:[{sku,name,priceCents}], totalCents}
    POST /api/orders {email,name,address,cardNumber,expiry,cvc}
         v1/v2/v2-ambiguous: Luhn check cardNumber. Valid → order {id:"ord_<n>", email, sku: cart[0],
           totalCents: sum of cart prices, status:"PAID", cardLast4: last 4 digits}; clear cart; 201 {orderId}.
           Invalid → 402 {error:"card declined"}.
         v2-bug: ALWAYS 500 {error:"payment gateway timeout"}; create NO order.
    GET  /__state  → {orders, cart, requests}
    POST /__reset  → clear cart, orders, requests → 204
- Products: GZ-MINI "Gizmo Mini" 1999 · GZ-PRO "Gizmo Pro" 2999.

HTML REQUIREMENTS (inline <script> and <style> allowed; no external URLs):
shop-v1:
  index.html: header with <a id="cart-link" href="/cart">Cart (<span id="cart-count">0</span>)</a> on the RIGHT.
    Two <article> cards, each <h3>Name</h3>, price, and <button id="add-GZ-MINI" class="add-btn">Add to cart</button>
    (id add-GZ-PRO for the other). Click → fetch POST /api/cart → update count.
  cart.html: <h1>Your cart</h1>, item list from GET /api/cart, total, and at the BOTTOM
    <button id="checkout-button">Checkout</button> → location.href="/checkout".
  checkout.html: <h1>Checkout</h1> <form> with <label for> pairs: Email #email, Full name #name, Address #address,
    Card number #card-number, Expiry (MM/YY) #expiry, CVC #cvc, and <button id="pay-button" type="submit">Pay now</button>.
    Submit (preventDefault) → POST /api/orders → 201 → location "/confirmation?order=<id>"; else show
    <p role="alert">Payment failed</p>.
  confirmation.html: <h1>Order confirmed</h1><p>Thank you! Order <span id="order-id"></span></p> (fill from query).
shop-v2 (deliberate harmless redesign):
  index.html: LEFT nav <button aria-label="Shopping bag">🛍 <span class="count">0</span></button> → /bag.
    Cards <article data-sku="GZ-MINI"> <h3>Gizmo Mini</h3> … <button class="btn" data-action="add">Add to bag</button> (NO id).
  bag.html: <h1>Your bag</h1>; at the TOP (before the list) <button class="btn-primary">Proceed to payment</button>
    → /checkout/details. Include the same left-nav Shopping bag button.
  details.html: <h1>Delivery details</h1>; labels: Email address #user-email, Name #fullname,
    Shipping address #ship-addr; <button type="submit">Continue</button> → save to sessionStorage → /checkout/payment.
  payment.html: <h1>Payment</h1>; labels: Card no. #cc, Expiry date #exp, Security code #sec;
    <input type="checkbox" id="terms"><label for="terms">I agree to the terms</label>;
    <button type="submit" id="place" disabled>Place order</button> enabled only while terms is checked.
    Submit → POST /api/orders with details from sessionStorage → 201 → /confirmation?order=<id>;
    else <p role="alert">Payment failed</p>.
  confirmation.html: <h1>Order confirmed</h1> and <span data-testid="order-ref"></span>.
shop-v2-bug: identical to v2 EXCEPT payment.html ignores the response status and ALWAYS navigates to /confirmation.
shop-v2-ambiguous: identical to v2 EXCEPT payment.html has two adjacent submit buttons with identical styling,
  text "Pay" and "Complete order" (both enabled only when terms checked; both submit the same way). No "Place order".

DO NOT: add products, coupons, login, extra buttons like "Continue shopping", "Remove", or anything not listed.

SELF-CHECK (run these and paste output):
  node fixtures/server.mjs --all   (in background) → 4 LISTENING lines
  curl -s -X POST localhost:4101/api/cart -H "content-type: application/json" -d "{\"sku\":\"GZ-MINI\"}"
  curl -s -X POST localhost:4101/api/orders -H "content-type: application/json" -d "{\"email\":\"a@b.c\",\"name\":\"A\",\"address\":\"X\",\"cardNumber\":\"4242424242424242\",\"expiry\":\"12/30\",\"cvc\":\"123\"}"
  curl -s localhost:4101/__state   → 1 order, status PAID, totalCents 1999, cardLast4 "4242"
  same order POST against 4103 → HTTP 500 and /__state has 0 orders
Then list, for each of the 8 v2 changes in PRD §13, the file:line implementing it. Stop.
```

## P-H3 — Demo oracle draft

```
TASK H3 (human-owned; you are drafting for review). Read docs/PRD.md §14 and docs/WORKSPLIT.md "### H3" only.

Create oracles/demo.oracle.mjs — plain Node ESM, imports allowed: node:child_process, node:fs, node:path,
node:crypto, better-sqlite3. It must use ONLY the public surface: the built CLI (node dist/cli.js ...),
SQLite files, the fixtures' /__state, and the HTTP API of `healtest serve`.

Structure:
- const results = []; function check(tag, ok, reason) { results.push(...); console.log(`${ok?'PASS':'FAIL'} ${tag} ${ok?'':reason}`) }
- start fixtures: spawn('node',['fixtures/server.mjs','--all']), wait until 4 "LISTENING" lines (timeout 15 s).
- helper cli(args, db) → spawnSync('node',['dist/cli.js',...args,'--db',db],{env:{...process.env,HEALTEST_LLM:'replay'}})
  returning {status, stdout}.
- helper report(runId, db) → JSON.parse(cli(['report', runId, '--json'], db).stdout)
- helper sql(db, query, ...params) → better-sqlite3 readonly query (except the DELETE test).
- Use a temp dir for 3 DB files: main.sqlite, bug.sqlite, amb.sqlite (delete first).
- Implement assertions 1–8 from WORKSPLIT H3, each check() title starting with its tags, e.g.
  check('[R-SC-B] [R-PS-06] v2-bug yields APP_BUG and rejected repair', ...).
- Get runIds from `SELECT max(id) FROM runs WHERE kind='run'` after each CLI call.
- For assertion 8 start `node dist/cli.js serve --port 4399` and fetch with global fetch; kill it after.
- Finally kill fixtures; process.exit(results.every(r=>r.ok)?0:1).

RULES: no imports from src/ or dist/ internals; no retries that hide failures; every assertion must be able to FAIL.
SELF-CHECK: for each assertion, write one sentence describing a broken implementation it would catch. Stop.
```

---

# Task prompts (P0)

> Each prompt assumes Prompt 0 was pasted first and answered "READY".

## P-T01 — Scaffold

```
TASK T01 — Scaffold. Tier FLASH. Read: docs/WORKSPLIT.md "## T01", docs/PRD.md §5 and §6.1.

GOAL: an empty but fully working TypeScript project where `npm run verify:fast` and `npm run verify` pass.

DO, IN ORDER (run verify:fast after steps 4, 7, 9):
1. npm i playwright better-sqlite3 zod yaml commander @google/genai
   npm i -D typescript vitest eslint typescript-eslint @types/node @types/better-sqlite3 tsx
   npx playwright install chromium
2. package.json: set "type":"module"; keep existing scripts from harness (verify:fast, verify, verify:demo, lock,
   review, ralph) and add: build, demo, serve, healtest, fixtures exactly as WORKSPLIT T01 step 3 / PRD §5.
3. tsconfig.json (noEmit, include src + tests) and tsconfig.build.json (extends, emits src → dist) as in WORKSPLIT T01 step 3.
4. scripts-dev/copy-sql.mjs: import { cpSync, mkdirSync, existsSync } from 'node:fs'; copy src/db/migrations → dist/db/migrations
   if it exists. Create empty folder src/db/migrations with a .gitkeep.
5. eslint.config.js (flat): typescript-eslint recommended; ignores: dist, .harness, .healtest, fixtures, oracles, scripts,
   scripts-dev, dashboard/tokens.css, node_modules.
6. vitest.config.ts: test.include ['tests/**/*.test.ts'], testTimeout 60000, pool 'forks', fileParallelism false
   (Playwright + shared ports).
7. .gitignore: node_modules, dist, .harness, .healtest
8. src/config.ts: constants exactly as PRD §10.6. src/types.ts: `export {}` for now.
9. tests/helpers/fixtures.ts: export async function startFixture(variant: string): Promise<{url:string; stop():Promise<void>}>
   - spawn(process.execPath, ['fixtures/server.mjs','--variant',variant,'--port','0'])
   - read stdout lines until /^LISTENING (\S+) (\d+)$/ → url = `http://127.0.0.1:${port}`; reject after 10 s
   - stop() kills the child and resolves on 'exit'.
10. tests/unit/smoke.test.ts: it('[R-PS-01] toolchain runs', () => expect(1 + 1).toBe(2))
11. tests/integration/fixtures.test.ts: it('fixture v1 starts and /__state is empty') using startFixture('shop-v1')
    and fetch(url + '/__state') → orders length 0.

SELF-CHECK:
[ ] npm run build creates dist/config.js
[ ] npm run verify prints PASS for lock-intact, dashboard, typecheck, lint, unit, integration, guardrails
    (guardrails folder may need one trivial file: tests/guardrails/placeholder.test.ts is NOT allowed; instead
     configure vitest so an empty dir passes: add `passWithNoTests: true` to vitest config)
[ ] no file under fixtures/, intents/, oracles/ changed (git status)
STOP after reporting. Do not start T02.
```

## P-T02 — Database

```
TASK T02 — SQLite schema, migrations, append-only triggers, repository. Tier FLASH (+ guardrail-auditor review).
Read: docs/WORKSPLIT.md "## T02", docs/PRD.md §8.2, harness.md §13.2 (DDL), skill db-audit-history.

GOAL: every piece of history is stored; audit tables cannot be changed or deleted; a repair cannot be
marked validated/approved/applied without a passing validation run.

DO, IN ORDER:
1. src/db/migrations/001_init.sql: copy harness §13.2 DDL CHARACTER FOR CHARACTER. Then append 6 triggers:
   approvals_no_upd/approvals_no_del, validation_runs_no_upd/_no_del, oracle_results_no_upd/_no_del, same body:
   BEGIN SELECT RAISE(ABORT,'append-only'); END;
2. src/db/migrations/002_plans.sql: copy PRD §8.2 SQL block exactly.
3. src/db/index.ts:
   export function openDb(path?: string): Database.Database
   - default path join(HOME,'healtest.sqlite'); mkdirSync(dirname, {recursive:true})
   - pragmas: foreign_keys = ON, journal_mode = WAL
   - CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY)
   - migrations dir = fileURLToPath(new URL('./migrations/', import.meta.url)); readdirSync, sort, apply each
     not-yet-applied file with db.exec inside db.transaction, then insert its version.
4. src/db/repo.ts: export class Repo { constructor(public db: Database.Database) }
   Write ONE private helper: private tx<T>(actor: string, action: string, entity: string, fn: () => {id:number; payload?:unknown; result:T}): T
   that runs fn inside db.transaction and inserts audit_log(actor, action, entity, entity_id, payload_json).
   Implement every method listed in WORKSPLIT T02 step 4 using it. Use only prepared statements with ? params.
   JSON columns: JSON.stringify on write, JSON.parse on read.
   insertSnapshot: if a row with same page_id AND content_hash exists, return its id (still write an audit row
   with action 'snapshot.dedup').
   setRepairStatus: plain UPDATE repairs SET status=? WHERE id=? — the DB trigger enforces validation.
5. tests/helpers/db.ts: export function tempDb(): { db, repo, path } using mkdtempSync(join(tmpdir(),'healtest-')).
6. tests/unit/db.test.ts: write the 10 tests named in WORKSPLIT T02 (exact names). Each test must assert real
   DB rows (SELECT ... ) — not just "no throw". For the trigger tests use expect(() => ...).toThrow(/append-only|requires/).

SELF-CHECK:
[ ] grep -n "UPDATE\|DELETE" src/db/repo.ts shows ONLY the repairs status update and runs finish update
[ ] every public Repo method writes exactly one audit_log row (test proves it)
[ ] npm run verify PASS
Then call the guardrail-auditor subagent with: "Audit src/db/ for ways to delete/modify audit history or mark a
repair validated without a passing validation run. ≤10 lines." Fix only concrete exploit paths it reports.
```

## P-T03 — Intent loader

```
TASK T03 — Types + intent loader (guardrail G1). Tier FLASH.
Read: docs/WORKSPLIT.md "## T03", docs/PRD.md §7 and §8.1.

DO:
1. src/types.ts: for EVERY type in PRD §7 write a zod schema named <Type>Schema and export type <Type> = z.infer<...>.
   Unions use z.enum([...]). Records use z.record(z.string(), z.string()).
   Add IntentSchema for §8.1 with .strict() on every object. expected[] = z.discriminatedUnion('type', [
     BackendStateOracleSchema (id, type:'backend_state', request{method,path}, select, where record, expect{count?, fields record}),
     NetworkStatusOracleSchema (id, type:'network_status', urlPattern, method?, forbidStatusAtLeast?, requireStatusIn?),
     DomStateOracleSchema (id, type:'dom_state', textAny string[], supportingOnly boolean default true) ]).
2. src/intent/load.ts:
   export function loadIntent(path: string): { intent: Readonly<Intent>; sha256: string; raw: string }
   - raw = readFileSync(path,'utf8'); sha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
   - obj = YAML.parse(raw) → IntentSchema.parse(obj)
   - resolve templates: walk all string values in `expected`; replace /\{\{data\.(\w+)\}\}/g with String(intent.data[key]);
     unknown key → throw new Error(`unknown template key data.${key}`)
   - return { intent: deepFreeze(resolved), sha256, raw }
   export function deepFreeze<T>(o: T): Readonly<T> (recursive over objects and arrays)
3. Tests: tests/unit/intent.test.ts (3 tests) + tests/guardrails/intent.test.ts ([R-F4-01]) with exact names from the card.
   For "no selectors": JSON.stringify(intent) must not match /selector|#[a-z-]+-button/i.
   Use temp YAML files written in the test for the negative cases (never edit intents/).

SELF-CHECK:
[ ] loading intents/checkout.intent.yaml twice yields the same sha256
[ ] (intent as any).goal = 'x' throws TypeError in the test
[ ] npm run verify PASS
```

## P-T04 — Snapshotter

```
TASK T04 — Browser session + page snapshot + content hash. Tier PRO.
Read: docs/WORKSPLIT.md "## T04", docs/PRD.md §9.1, §9.2, §10.6.

KEY FACTS (do not deviate):
- Playwright removed page.accessibility. Use: const ariaYaml = await page.locator('body').ariaSnapshot();
- The function passed to page.evaluate runs IN THE BROWSER: it cannot use imports or outer TS variables.
  Write it as a standalone function `collectElements()` returning plain JSON.

DO:
1. src/browser/session.ts — export async function openSession(opts?: {headless?: boolean}) returning
   { browser, context, page, network: NetworkEvent[], violations: string[], close(): Promise<void> }.
   chromium.launch({headless}); browser.newContext({viewport: VIEWPORT}); timeouts from config.
   page.on('response', r => network.push({ method: r.request().method(), url: r.url(),
     path: new URL(r.url()).pathname, status: r.status(), ts: Date.now() }))
2. src/snapshot/capture.ts — export async function captureSnapshot(page, opts: {screenshot: boolean}): Promise<PageSnapshot>
   Inside collectElements() implement PRD §9.1 steps 1–10 IN ORDER:
   - role mapping table (step 2) as a small function
   - accessible name order (step 3) exactly; collapse whitespace with .replace(/\s+/g,' ').trim()
   - nearText (step 5): for (let a = el.parentElement, i = 0; a && i < 6; a = a.parentElement, i++) {
       const h = [...a.querySelectorAll('h1,h2,h3,h4,legend')].find(x => !el.contains(x)); if (h) return text(h).slice(0,80) }
   - visible, enabled, empty, checked (steps 6–8)
   - selector (step 9) with CSS.escape and uniqueness check
   - bbox: r = el.getBoundingClientRect(); {x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height}
   - attrs: only id, name, type, placeholder, aria-label, data-testid, href and all data-* (skip data-healtest-ref)
   - keep visible only; assign ref e1..eN; el.setAttribute('data-healtest-ref', ref)
   In TS: headings via page.$$eval('h1,h2,h3', ...); ariaYaml; contentHash; screenshot if opts.screenshot to
   join(HOME,'screenshots', `${hash.slice(0,12)}-${slug(pagePath)}.png`) with fullPage true.
3. src/snapshot/hash.ts — contentHash(elements) exactly PRD §9.2. normalizeName lowercases, replaces /\d+/g with '#',
   collapses spaces. Exclude bbox.
4. src/match/text.ts — for now only export function norm(s) (PRD §10.1 definition).
5. Tests — the 6 names in the card. Integration tests use startFixture(); open page at url + '/cart' AFTER adding
   a product via fetch(url+'/api/cart', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({sku:'GZ-MINI'})}).
   Always close sessions and fixtures in afterAll.

SELF-CHECK:
[ ] snapshot of v1 /cart contains {role:'button', name:'Checkout', selector:'#checkout-button'}
[ ] snapshot of v1 / has an element name 'Add to cart' with nearText 'Gizmo Mini'
[ ] two captures → identical JSON.stringify(elements) and contentHash
[ ] no waitForTimeout anywhere (grep)
[ ] npm run verify PASS
```

## P-T05 — Matcher + differ

```
TASK T05 — Similarity score, replacement matcher, snapshot differ. Tier PRO.
Read: docs/WORKSPLIT.md "## T05", docs/PRD.md §10.1, §10.2, §10.3, §8.3.

ABSOLUTE RULE: do NOT change weights (0.35/0.20/0.15/0.10/0.10/0.10) or policy.json thresholds (strong 0.60,
margin 0.10, selectorVerify 0.85). If a fixture test fails because of scores, print the actual scores
(console.table of candidates) in your report, try adding a synonym to src/match/synonyms.ts, and if still failing
report BLOCKED with the scores.

DO:
1. src/match/text.ts: levenshtein(a,b) (two-row DP), levRatio(a,b), tokenSetRatio(a,b) (EMPTY → 0), norm(s).
   Write unit tests first: tokenSetRatio('add to cart','add to bag') > 0.6; tokenSetRatio('', '') === 0;
   tokenSetRatio('checkout','checkout') === 1; levenshtein('kitten','sitting') === 3.
2. src/match/synonyms.ts: SYNONYM_GROUPS copied from PRD §10.1; synonymBoost(a,b,sim): na=norm(a), nb=norm(b);
   if any group has a phrase p1 with na.includes(p1) and a phrase p2 with nb.includes(p2) → max(sim, 0.85).
3. src/match/score.ts: similarity(t, e) exactly PRD §10.1; elementToTarget(e, snapshotId): TargetFingerprint.
4. src/governance/policy.ts (minimal): loadPolicy(path='policy.json') with zod schema of PRD §8.3.
5. src/match/matcher.ts: findReplacement(t, snap, policy): MatchResult — PRD §10.2 steps 1–6 in order,
   including CONTEXT ANCHORING (step 2) and FORBIDDEN names (step 3).
   resolveBySelector(page, snap, t, policy): ElementRecord | null — PRD §10.2 last paragraph.
6. src/diff/differ.ts: diffSnapshots(base, head): ChangeItem[] — PRD §10.3 steps 1–5. evidence strings like
   "name 'Add to cart'→'Add to bag'", "id 'add-GZ-MINI' removed", "moved 412px".
7. Tests — all names in the card. Integration tests capture REAL fixture snapshots (v1 and v2 / v2-ambiguous).
   For the v1 'Pay now' target: capture v1 /checkout, take the 'Pay now' element → elementToTarget; then capture
   v2-ambiguous /checkout/payment (navigate through the UI or set sessionStorage then goto) and call findReplacement.

SELF-CHECK:
[ ] 'Add to cart' (Gizmo Mini) → kind 'single', best.name 'Add to bag', and best is under 'Gizmo Mini'
[ ] 'Pay now' vs v2-ambiguous → kind 'ambiguous', candidates include 'Pay' and 'Complete order'
[ ] weights and policy.json unchanged (git diff policy.json is empty)
[ ] npm run verify PASS
Report the score table for the three fixture cases in your final message.
```

## P-T06 — Change report

```
TASK T06 — Severity, change report builder, explanation template, `healtest diff` CLI. Tier FLASH.
Read: docs/WORKSPLIT.md "## T06", docs/PRD.md §7 (ChangeReport), §10.3 (severity), §10.7 (explainChange), §12.1 (diff row).

DO:
1. src/diff/severity.ts: export function severity(items: ChangeItem[], affectedSteps: string[], oracleFailed: boolean,
   appError: boolean): Severity — rules from PRD §10.3 in this order: CRITICAL, HIGH, MEDIUM, LOW.
2. src/diff/report.ts: buildChangeReport(args) → Omit<ChangeReport,'changeId'>; kind = items[0].kind after the
   priority sort (import the sort from differ).
3. src/explain/templates.ts: explainChange(...) using the exact template text in PRD §10.7 (score with toFixed(2)).
4. src/cli.ts: create the commander program if missing (`healtest`), add `diff <baseId> <headId>` with `--json`
   and `--db <path>`. Output: JSON array, or one line per item: `<KIND> <evidence>`.
   Make src/cli.ts the bin entry: dist/cli.js runs program.parseAsync(process.argv).
5. Tests: 4 names from the card in tests/unit/report.test.ts (use synthetic ChangeItems + tempDb()).

SELF-CHECK:
[ ] severity returns CRITICAL when oracleFailed=true even with only LAYOUT_SHIFT items
[ ] stored report read back via repo equals the built one (deep equal on all fields except id/created_at)
[ ] npm run build && node dist/cli.js diff --help works
[ ] npm run verify PASS
CHECKPOINT: tell the human to run scan/diff manually on v1 /cart vs v2 /bag after T10 makes `scan` usable.
```

## P-T07 — Executor + guards

```
TASK T07 — Step executor and guards (G2, G3). Tier FLASH (+ guardrail-auditor).
Read: docs/WORKSPLIT.md "## T07", docs/PRD.md §7 (Step), §15 rows G2 and G3, rule security.md.

DO:
1. src/executor/guards.ts:
   export class GuardViolation extends Error { constructor(public code: 'ORIGIN'|'DATA'|'BUDGET'|'UNOBSERVED'|'FORBIDDEN', msg: string) }
   assertOriginAllowed(url: string, intent): new URL(url).origin must equal one entry of intent.allowedOrigins
     (compare origins, not string prefixes) — about:blank allowed.
   assertDataKey(key, intent): Object.hasOwn(intent.data, key)
   assertBudget(count, intent): count <= intent.actionBudget
   assertObserved(ref, snap): snap.elements.some(e => e.ref === ref)
   assertNotForbidden(name): !FORBIDDEN_NAME.test(name)  (import from planner/lexicon.ts; create that file with
     FORBIDDEN_NAME only if it does not exist yet — copy the regex from PRD §10.4)
2. src/executor/executor.ts:
   export async function executeStep(page, step: Step, el: ElementRecord, intent, snap): Promise<void>
   - assertObserved(el.ref, snap); if click → assertNotForbidden(el.name)
   - loc = page.locator(`[data-healtest-ref="${el.ref}"]`)
   - switch(step.action): click → loc.click(); fill → assertDataKey(step.dataKey!) then loc.fill(String(intent.data[key]));
     check → loc.check(); select → loc.selectOption({ label: String(intent.data[step.dataKey!]) })
   - await page.waitForLoadState('networkidle', {timeout: 3000}).catch(() => {})
   - assertOriginAllowed(page.url(), intent)
3. session.ts: add page.on('framenavigated', f => { if (f === page.mainFrame()) try { assertOriginAllowed(f.url(), intent) }
   catch (e) { violations.push(String(e)) } }) — openSession gets optional intent param.
4. Tests: 5 names from the card. Use a real v1 fixture for the positive test (snapshot → click 'Add to cart' → goto /cart
   → click Checkout → fill email). Negative tests can use synthetic snapshots and a page set to about:blank.

SELF-CHECK:
[ ] there is no code path that types a value not read from intent.data (grep .fill( in src/)
[ ] npm run verify PASS
Then guardrail-auditor: "Audit src/executor/ and src/browser/ for ways to type non-approved data, navigate off the
allowlist, or act on an element not in the snapshot. ≤10 lines." Fix concrete findings only.
```

## P-T08 — Oracles

```
TASK T08 — Deterministic oracle runner (G4, G5). Tier PRO.
Read: docs/WORKSPLIT.md "## T08", docs/PRD.md §8.1 (expected), §10.5 (hard rules).

THE MOST IMPORTANT RULE IN THE WHOLE PROJECT: "Order confirmed" on screen is NOT proof. Backend state and HTTP status are.

DO:
1. src/oracle/runner.ts:
   export async function runOracles(intent, targetOrigin: string, network: NetworkEvent[], page): Promise<OracleResult[]>
   For each oracle o in intent.expected (keep order), inside try { ... } catch (e) { push {ok:false, detail:{error:String(e)}} }:
   - backend_state: res = await fetch(targetOrigin + o.request.path, {method: o.request.method});
       if (!res.ok) → ok:false, detail {httpStatus}
       arr = (await res.json())[o.select]; if !Array.isArray(arr) → ok:false
       filtered = arr.filter(item => Object.entries(o.where).every(([k,v]) => String(item[k]) === String(v)))
       mismatches = for each filtered item, for each [f,v] of o.expect.fields where String(item[f]) !== String(v)
       ok = (o.expect.count === undefined || filtered.length === o.expect.count) && mismatches.length === 0
            && filtered.length > 0
       detail = { expectedCount: o.expect.count, actualCount: filtered.length, mismatches }
   - network_status: matched = network.filter(n => new RegExp(o.urlPattern).test(n.path) && (!o.method || n.method === o.method))
       ok = true; if (o.forbidStatusAtLeast) ok &&= matched.every(n => n.status < o.forbidStatusAtLeast)
       if (o.requireStatusIn) ok &&= matched.length > 0 && matched.every(n => o.requireStatusIn.includes(n.status))
       detail = { matched: matched.map(({method,path,status}) => ({method,path,status})) }
   - dom_state: text = (await page.innerText('body')).toLowerCase(); ok = o.textAny.some(t => text.includes(t.toLowerCase()))
       supportingOnly = o.supportingOnly ?? true
   supportingOnly is false for backend_state and network_status.
   export function allRequiredPass(rs: OracleResult[]) { const req = rs.filter(r => !r.supportingOnly); return req.length > 0 && req.every(r => r.ok) }
2. Tests: 4 names from the card. For v2-bug: drive the purchase with direct page actions (no planner yet):
   goto url, click 'Add to bag', goto /checkout/details, fill fields, click Continue, fill payment, check terms, click Place order,
   wait for URL /confirmation; then assert dom_state ok === true AND allRequiredPass === false AND
   no-server-errors ok === false.

SELF-CHECK:
[ ] grep "from '../llm" src/oracle → nothing
[ ] an oracle that throws produces ok:false (test proves it)
[ ] allRequiredPass returns false when there are zero required oracles
[ ] npm run verify PASS
```

## P-T09 — Verdict

```
TASK T09 — Verdict decision table. Tier PRO. Read: docs/WORKSPLIT.md "## T09", docs/PRD.md §10.5.

DO:
1. src/classify/verdict.ts:
   export interface VerdictInput { toolError: boolean; appError: boolean; oracleResults: OracleResult[];
     plannerStatus: 'done'|'stuck'|'ambiguous'|'budget'|'app_error'|'replayed'; guardViolation: boolean;
     repaired: boolean; replanned: boolean; ambiguous: boolean; reusedRepair: boolean; planIsKnownGood: boolean }
   export function decideVerdict(i: VerdictInput): { verdict: Verdict; classification: Classification | null; exitCode: 0|1|10|11|12 }
   Implement rows 1–6 of PRD §10.5 as SIX sequential if-statements, in that order, each returning. Row 1 returns
   { verdict:'FAIL_UNREPAIRABLE', classification:null, exitCode:1 }.
   Row 2 condition: i.appError || i.plannerStatus === 'app_error' || i.oracleResults.some(r => !r.supportingOnly && !r.ok)
   Row 4 condition: i.plannerStatus === 'stuck' || i.plannerStatus === 'budget' || i.guardViolation
   Row 5 requires allRequiredPass(i.oracleResults).
   Row 6 requires allRequiredPass too; if not all pass and nothing matched → return APP_BUG (safe default; add a comment).
   export function exitCodeFor(v: Verdict).
2. Tests: one per row (6), plus the 4 named tests in the card. The "no llm import" test reads
   src/classify/verdict.ts as text and asserts !/llm/i.test(importLines).

SELF-CHECK:
[ ] order of rows matches PRD exactly (APP_BUG beats NEEDS_REVIEW beats FAIL_UNREPAIRABLE beats HEALED_PASS beats PASS)
[ ] npm run verify PASS
```

## P-T10 — Planner + first run

```
TASK T10 — Heuristic planner + first-run pipeline. Tier PRO. CHECKPOINT task.
Read: docs/WORKSPLIT.md "## T10", docs/PRD.md §10.4 (all), §11 steps 1–5, 6a, 8, §12.1 (run, report, console format).

DO (verify:fast after each numbered step):
1. src/planner/lexicon.ts: FIELD_PATTERNS, STAGES, FORBIDDEN_NAME copied EXACTLY from PRD §10.4.
   export function stageOf(name: string): StageId | null — check in order pay, checkout, continue, add, cart;
   return the FIRST matching (so 'Add to cart' → 'add', never 'cart').
2. src/planner/heuristic.ts:
   export type PlannedAction = {kind:'act'; action:ActionType; ref:string; dataKey:string|null; stage?:StageId}
     | {kind:'done'} | {kind:'stuck'; reason:string} | {kind:'ambiguous'; candidates: ElementRecord[]}
   export function nextAction(s: { snap: PageSnapshot; intent: Intent; completedSteps: Step[]; clickedOnPath: Set<string> }): PlannedAction
   - productAdded = s.completedSteps.some(st => st.action==='click' && stageOf(st.target.name)==='add')
   - Follow PRD §10.4 steps 1–5 exactly. clickedOnPath key = `${snap.pagePath}|${norm(el.name)}|${el.nearText}`.
   - In step 4 iterate stages ['pay','checkout','continue','cart','add'] and use stageOf(el.name) === stage.
3. src/llm/client.ts: export interface LlmClient { completeJson(system: string, user: string): Promise<unknown>; calls: number }
   export class NullClient implements LlmClient (throws 'LLM disabled'); export function makeLlm(mode): LlmClient (only 'off' now).
4. src/planner/plan.ts: export async function planAndExecute(session, intent, repo, opts: { repair: boolean; completed: Step[];
   llm: LlmClient; pageIdFor(path): number }): Promise<{ steps: Step[]; status; ambiguity?: Candidate[]; llmCalls: number }>
   Loop exactly as PRD §10.4 "planAndExecute". Capture and STORE a snapshot before every action (repo.insertSnapshot)
   so each step.target.snapshotId is a real DB id. stepIds are assigned later; use `s${n}`.
   After each action: if session.network.some(n => /^\/api\//.test(n.path) && n.status >= 500) → return status 'app_error'.
5. src/governance/reuse.ts: findPlanForRun(repo, intentId, siteId, startHash) — for now only lookup (b) known_good, else null.
6. src/pipeline/run.ts: export async function runIntent(intentPath, target, opts: {db?: string; llm?: mode; headless?: boolean}): Promise<RunOutcome>
   Steps 1–5, 6a, 8 of PRD §11. If a plan exists, for now throw new Error('replay not implemented until T11') — the ONLY
   allowed "not implemented" in the project, and T11 removes it. Print phase lines `[intent] … [verdict] …` (PRD §12.1).
7. src/cli.ts: `run <intent> --target <url> [--db] [--llm]` → process.exitCode = outcome.exitCode;
   `report <runId> [--json] [--db]`.
8. Tests: the 4 unit tests + 3 integration tests from the card (exact names).

SELF-CHECK:
[ ] stageOf('Add to cart') === 'add'; stageOf('Shopping bag') === 'cart'; stageOf('Proceed to payment') === 'checkout'
[ ] planner on v2 from scratch fills 'Email address' with dataKey 'email' (not 'address')
[ ] planner on v2 checks the terms checkbox before clicking 'Place order'
[ ] first v1 run → PASS, a step_plans row (origin baseline) and a known_good row exist
[ ] npm run verify PASS
CHECKPOINT: run `npm run fixtures` (separate terminal) then
  npm run build && node dist/cli.js run intents/checkout.intent.yaml --target http://127.0.0.1:4101 --db .healtest/t10.sqlite
Paste the full console output. It must end with `[verdict]  PASS`.
```

## P-T11 — Replay + repair

```
TASK T11 — Replay with detection and repair; LLM fallback with record/replay. Tier PRO (+ guardrail-auditor).
Read: docs/WORKSPLIT.md "## T11", docs/PRD.md §11 step 6b (word by word), §10.2, §10.4 (LLM planner), §10.7, §15 G2/G6.

DO:
1. src/repair/engine.ts: export async function replayWithRepair(session, intent, plan: Step[], repo, ctx): Promise<{
     newSteps: Step[]; changeIds: number[]; repaired: boolean; replanned: boolean;
     ambiguity: { stepId: string; candidates: Candidate[] } | null; appError: boolean; plannerStatus; llmCalls: number }>
   Translate PRD §11 6b into code line by line:
   - per step: snap = capture+store; el = resolveBySelector(...)
   - found → executeStep; push {...step, provenance:'replay', target: elementToTarget(el, snap.id)}; check 5xx → appError, break
   - not found → base = repo.getSnapshot(step.target.snapshotId); items = diffSnapshots(base, snap); m = findReplacement(step.target, snap, policy)
       single → insert change (affected [stepId], classification HARMLESS_UI provisional), execute, push provenance 'repair-match'
       ambiguous → insert change (AMBIGUOUS, confidence 0.5); return ambiguity (DO NOT click anything)
       none → items.unshift({kind:'FLOW_CHANGED', before:{name: step.target.name, pagePath: step.pagePath}, after:{pagePath: snap.pagePath},
              evidence:`'${step.target.name}' not found on ${snap.pagePath}`}); insert change (affected = this and all remaining stepIds);
              r = planAndExecute(session, intent, repo, {repair:true, completed:newSteps, ...}); push r.steps; break
2. src/pipeline/run.ts: replace the T10 throw with the 6b branch. If ambiguity → repo.insertRepair(status 'needs_review',
   proposal_json {steps:newSteps, pendingChoice: ambiguity}) and finish with verdict NEEDS_REVIEW (validation comes in T12).
3. src/llm/gemini.ts: FIRST write scripts-dev/llm-probe.mjs:
     import { GoogleGenAI } from '@google/genai'; const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
     const r = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: 'Reply {"ok":true} as JSON',
       config: { responseMimeType: 'application/json', temperature: 0 } }); console.log(r.text);
   Run it (skip if no API key; then mark the live path untested in progress.md). Delete the probe. Implement GeminiClient with
   exactly the call shape that worked; system prompt goes in config.systemInstruction.
4. src/llm/replay.ts: key = sha256(model + '\n' + system + '\n' + user); dir join(HOME,'llm-cache'); modes record/replay/live per PRD.
   replay miss → return { action: 'stuck' } (never throw). makeLlm(mode) now supports all 4 modes.
5. src/planner/llm.ts: LlmPlanner.nextAction(state, llm) → prompt per PRD §10.4 (data KEYS only, never values);
   reply schema z.object({action: z.enum(['click','fill','check','done','stuck']), ref: z.string().nullable(),
   dataKey: z.string().nullable(), reason: z.string()}).strict(); reject if ref not in snapshot or dataKey not in intent.data → stuck.
   plan.ts: call it only when heuristic returns stuck AND mode !== 'off'.
6. Tests: 7 names from the card. For the LLM guardrail tests create a FakeLlm implements LlmClient returning a fixed object.

SELF-CHECK:
[ ] no code path clicks/fills after an ambiguity is detected
[ ] no code path continues planning after a 5xx (search for 'app_error' handling)
[ ] the LLM prompt string never contains intent.data values (test: build prompt, assert it lacks '4242424242424242')
[ ] the T10 "not implemented" throw is gone (grep)
[ ] npm run verify PASS
Then guardrail-auditor (full prompt in .agents/agents/guardrail-auditor.md) on src/repair src/planner src/llm src/pipeline.
```

## P-T12 — Validation

```
TASK T12 — Validation loop and change→repair→validation links. Tier PRO (+ guardrail-auditor). CHECKPOINT task.
Read: docs/WORKSPLIT.md "## T12", docs/PRD.md §11 step 7, §10.5.

DO:
1. src/validate/validation.ts:
   export async function runValidation(repo, repairId: number, opts): Promise<{ runId; validationRunId; verdict: Verdict; oracleResults }>
   - load repair + its step plan + intent (by intent id; re-load from the intent body stored in DB, verify sha256 matches)
   - session = openSession(...) NEW browser context; fetch(target + '/__reset', {method:'POST'}).catch(()=>{})
   - runId = repo.insertRun({kind:'validation', ...}); goto target + startPath
   - for each step: snap = capture+store; el = resolveBySelector(...); if !el → status 'stuck' (verdict row 4) and stop;
     executeStep; if 5xx → appError, stop
   - oracles = runOracles(...); v = decideVerdict({repaired:true, replanned, ...})
   - validationRunId = repo.insertValidationRun(repairId, runId, v.verdict, summary); repo.insertOracleResults(validationRunId, oracles)
   - repo.finishRun(runId, ...); close session
2. src/pipeline/run.ts step 7: when repaired → renumber steps s1..sN → repo.insertStepPlan(origin 'repair', start_hash)
   → repo.insertRepair(change_id = LAST change id, proposer 'llm' if any step provenance 'llm' else 'heuristic', status 'proposed',
   step_plan_id) → runValidation → if verdict PASS/HEALED_PASS → setRepairStatus('validated') else setRepairStatus('rejected').
   Final run verdict = decideVerdict using the VALIDATION oracle results. Store all change ids in runs.evidence_json.
   Also: when app_error occurred during the main run, STILL create the repair and validate it (so it gets rejected with evidence).
3. src/cli.ts: `validate <repairId> [--db]`.
4. Tests: 6 names from the card.

SELF-CHECK:
[ ] validation never calls findReplacement or planAndExecute (grep src/validate)
[ ] v2-bug: repair status 'rejected', run verdict APP_BUG, exit 10
[ ] v2: repair status 'validated', run verdict HEALED_PASS, exit 0, /__state shows 1 order after validation
[ ] npm run verify PASS
CHECKPOINT: with `npm run fixtures` running, run and paste output of:
  node dist/cli.js run intents/checkout.intent.yaml --target http://127.0.0.1:4101 --db .healtest/a.sqlite
  node dist/cli.js run intents/checkout.intent.yaml --target http://127.0.0.1:4102 --db .healtest/a.sqlite
  node dist/cli.js run intents/checkout.intent.yaml --target http://127.0.0.1:4101 --db .healtest/b.sqlite
  node dist/cli.js run intents/checkout.intent.yaml --target http://127.0.0.1:4103 --db .healtest/b.sqlite
Then guardrail-auditor on src/validate src/pipeline.
```

## P-T13 — Governance

```
TASK T13 — Policy auto-accept, approvals, resolve, retry, rollback, reuse with 0 LLM calls. Tier PRO (+ guardrail-auditor).
Read: docs/WORKSPLIT.md "## T13", docs/PRD.md §8.3, §11 step 5 + "Approval actions", §17 row G1.

DO:
1. src/governance/policy.ts: canAutoAccept(classification, candidateCount, oracleResults, policy):
   policy.autoAccept.classification.includes(classification) && candidateCount <= policy.autoAccept.maxCandidates
   && (!policy.autoAccept.requireAllOracles || oracleResults.every(r => r.ok))
2. src/governance/approvals.ts — export class InvalidTransition extends Error. Functions (each validates status first):
   approve(repo, repairId, actor, reason): requires 'validated' → insertApproval('approve') → status 'approved' →
     insertKnownGood(pageId of startPath, snapshotId, repairId, step_plan_id) → status 'applied'
   reject(repo, id, actor, reason): requires proposed|needs_review|validated → insertApproval('reject') → status 'rejected'
   resolveCandidate(repo, id, candidateRef, actor, opts): requires 'needs_review'; candidateRef must be in pendingChoice.candidates
     (else throw — G2); build steps = proposal steps + chosen step (provenance 'human', target from the stored snapshot element);
     insert new step plan; run a validation where, after the plan's steps, planAndExecute may continue until doneWhen;
     pass → status 'validated'; new ambiguity → stays needs_review with the new pendingChoice.
   retry(repo, id, opts) → runValidation again (status unchanged unless it passes from rejected? NO: retry allowed only from 'validated' or 'proposed').
   rollback(repo, id, actor, reason): requires 'applied' → insertApproval('rollback') → status 'rolled_back' →
     insertKnownGood pointing to the PREVIOUS known_good row's step_plan_id.
3. src/governance/reuse.ts: full lookup (a) newest repair in validated|approved|applied whose step plan start_hash === startHash,
   (b) current known_good, (c) null. Return { steps, reusedRepairId, planIsKnownGood }.
4. src/pipeline/run.ts: use reuse result; set runs.reused_repair_id; after validation apply canAutoAccept → if true:
   setRepairStatus validated → approved via approve(repo, id, 'system:policy', 'auto-accept policy').
5. src/cli.ts: approve, reject, resolve (--candidate), rollback, all with --actor/--reason and --db.
6. Tests: 7 names from the card.

SELF-CHECK:
[ ] second v2 run: runs.llm_calls = 0, reused_repair_id NOT NULL, verdict HEALED_PASS
[ ] after approve: v2 run verdict PASS
[ ] resolveCandidate with a ref not among the stored candidates throws
[ ] npm run verify PASS
Then guardrail-auditor on src/governance src/pipeline.
```

## P-T14 — Explanations

```
TASK T14 — All explanation templates wired into runs. Tier FLASH.
Read: docs/WORKSPLIT.md "## T14", docs/PRD.md §10.7.

DO:
1. src/explain/templates.ts: add explainReplan, explainAppBug, explainAmbiguous, explainVerdict(outcome, changes, repair)
   using the exact sentences of PRD §10.7. explainVerdict joins: one sentence for the verdict + each change explanation (max 3)
   + oracle summary "order-created ✓, no-server-errors ✕ (POST /api/orders 500)".
2. Mask: any string passed through templates goes through maskSecrets(s, intent): replace every intent.data value whose key
   matches /card|cvc|expiry/i with '****' + last 4 (cardNumber) or '***'.
3. Wire into run.ts → repo.finishRun(explanation) and changes.explanation.
4. Tests: 4 names from the card.

SELF-CHECK: [ ] grep the DB in the test for '4242424242424242' → 0 hits [ ] npm run verify PASS
```

## P-T15 — CLI completion

```
TASK T15 — Remaining CLI commands, exit codes, Decision-A guard. Tier FLASH.
Read: docs/WORKSPLIT.md "## T15", docs/PRD.md §12.1.

DO:
1. src/cli.ts: add `scan <site> --target <url> [--paths ...]` (open session, goto each path, capture with screenshot, store,
   print snapshot ids) and `repair <changeId>` (load change's affected first step target + head snapshot, findReplacement,
   insert repair proposed or needs_review, exit 0 or 11). Wrap every action: try { … } catch (e) { console.error(`error: ${e.message}`); process.exitCode = 1 }.
2. tests/integration/cli.test.ts: spawnSync('node', ['dist/cli.js', ...]) after `npm run build` in a beforeAll
   (execSync('npm run build')). Assert the 5 exit codes from the card (use fixtures v1, v2-bug, v2-ambiguous; for 12 use an
   intent copy in a temp dir with actionBudget: 2; for 1 use a missing file path).
3. tests/guardrails/decision-a.test.ts: read all src/**/*.ts; for each match of /\b(writeFileSync|writeFile|appendFileSync|
   appendFile|rmSync|unlinkSync|cpSync|mkdirSync)\b/ assert the file is in the allowlist [src/db/index.ts, src/llm/replay.ts,
   src/snapshot/capture.ts]. Name: '[R-F2-05] HealTest has no write path outside HEALTEST_HOME (no writes to target app source)'.

SELF-CHECK: [ ] node dist/cli.js --help lists all 11 commands [ ] npm run verify PASS
```

## P-T16 — Local API

```
TASK T16 — Local HTTP API with CSRF. Tier FLASH (+ guardrail-auditor). Read: docs/WORKSPLIT.md "## T16", docs/PRD.md §12.2, rule security.md.

DO:
1. src/server/http.ts: export function createServer(routes: Route[], staticDir: string): http.Server
   type Route = { method: 'GET'|'POST'; pattern: RegExp; handler: (ctx: {req, res, params: string[], query: URLSearchParams, body: any}) => Promise<void> }
   - body: collect chunks, reject > 1 MB with 413, JSON.parse (400 on error)
   - helpers json(res, status, obj) and fail(res, status, code, message) → {error:{code,message}}
   - static: if no route matches and method GET: map '/' → index.html; resolve(staticDir, '.' + pathname); if
     !resolved.startsWith(staticDir + sep) && resolved !== join(staticDir,'index.html') → 404; allowed ext map
     {.html:'text/html; charset=utf-8', .css:'text/css', .js:'text/javascript', .png:'image/png', .svg:'image/svg+xml'}.
2. src/server/csrf.ts: token = randomBytes(24).toString('hex'); check(req): header x-csrf-token, same length, timingSafeEqual.
3. src/server/api.ts: buildRoutes(repo) implementing EVERY row of PRD §12.2. POST handlers: CSRF → 403; body.confirm !== true → 400;
   actor/reason required (except retry) → 400; call governance function; InvalidTransition → 409.
   Display ids: helper fmtId(prefix, n) → `${prefix}_${String(n).padStart(4,'0')}` added as `displayId` fields.
   Screenshot route streams the file with image/png; missing → 404.
4. src/cli.ts `serve [--port 4300] [--db]` → listen(port, '127.0.0.1') → print `HealTest dashboard: http://127.0.0.1:<port>`.
5. Tests: 4 names from the card (start server on port 0, read address().port).

SELF-CHECK: [ ] server.address().address === '127.0.0.1' [ ] GET /../package.json → 404 [ ] npm run verify PASS
Then guardrail-auditor on src/server: "find CSRF bypass, path traversal, approval without confirm, XSS-prone responses".
```

## P-T17 — Dashboard shell + D1

```
TASK T17 — Dashboard shell, theme, D1 overview. Tier FLASH. Read: docs/WORKSPLIT.md "## T17", harness.md §16 (ALL of it),
.agents/rules/dashboard.md, docs/PRD.md §12.3.

HARD RULES: colours ONLY as var(--token) from dashboard/tokens.css (never edit tokens.css). No hex/rgb/hsl in app.css or app.js.
No external URLs, no web fonts, no frameworks. Insert API data with textContent ONLY. Failures are never red; APP_BUG = ink badge.

DO:
1. dashboard/index.html: <!doctype html>, lang en, meta charset + viewport, title "HealTest", links tokens.css then app.css,
   <div class="band"></div>, <header> with brand "HealTest", <nav> links (#/ Overview, #/changes Changes, #/audit Audit),
   <button id="theme-toggle" class="btn" aria-label="Toggle theme">◐</button>;
   <main> with five <section> elements: id view-overview, view-changes, view-change, view-repair, view-audit (hidden attribute on all but one);
   <dialog id="confirm-dialog"> with <form method="dialog"> inputs #actor, #reason (required), buttons Cancel / Confirm.
   <script src="app.js" type="module"></script>
2. dashboard/app.js:
   - el(tag, attrs = {}, ...children): creates element; attrs class/id/href/type/aria-*/data-* via setAttribute;
     children strings via document.createTextNode; never innerHTML.
   - let csrf; async function api(path, opts={}) { if (!csrf) csrf = (await (await fetch('/api/session')).json()).csrf; … add
     headers {'content-type':'application/json','x-csrf-token':csrf} for POST; throw on !ok with error.message }
   - const BADGE = { PASS:['✓','PASS','badge--pass'], HEALED_PASS:['✓↻','HEALED','badge--pass badge--healed'],
     APP_BUG:['✕','APP BUG','badge--bug'], NEEDS_REVIEW:['?','REVIEW','badge--review'], FAIL_UNREPAIRABLE:['—','UNREPAIRABLE','badge--unrep'],
     PROPOSED:['◆','PROPOSED','badge--proposed'] }; function badge(v) → span.badge with icon span (aria-hidden) + text.
   - router: window.addEventListener('hashchange', route); route() picks the view by regex (#/, #/changes, #/changes/(\d+),
     #/repairs/(\d+), #/audit), shows that section, hides others, calls its render function. Unimplemented views render a short
     "Coming soon" text ONLY until T18/T19 (they will replace it).
   - renderOverview(): GET /api/sites + /api/runs?limit=10 → two tables (sites: name, base URL, last scan, open changes, health badge;
     runs: id, verdict badge, target, llm calls, time). Empty state text if no rows.
   - theme: on load read localStorage 'healtest-theme' in try/catch → set document.documentElement.dataset.theme; toggle cycles
     light → dark → (remove = system).
3. dashboard/app.css: start from harness §16.3 component CSS; add .badge--healed{box-shadow: inset 0 0 0 1px var(--gold-leaf)},
   .badge--unrep{border:1px solid var(--ink-2);color:var(--ink-2)}, table styles (border-collapse, var(--line) borders),
   header layout (flex), nav links color var(--crimson), mono class font-family var(--font-mono). Use only var(--…).
4. Tests: 3 names from the card (Playwright opens the served dashboard).

SELF-CHECK:
[ ] node scripts/check-dashboard.mjs → "dashboard palette ok"
[ ] grep -n "innerHTML" dashboard/app.js → nothing
[ ] every badge has an icon AND a text label
[ ] npm run verify PASS
```

## P-T18 — D2/D3/D4

```
TASK T18 — Changes timeline with filters (D4), before/after screenshots (D2), side-by-side DOM/selector diff (D3). Tier FLASH.
Read: docs/WORKSPLIT.md "## T18", docs/PRD.md §12.3, harness.md §16.4. Same HARD RULES as T17.

DO in dashboard/app.js + app.css:
1. renderChanges(): layout = .rail (left) + .list. Rail: four checkboxes (LOW, MEDIUM, HIGH, CRITICAL, all checked) and a
   <select> of classification (All, HARMLESS_UI, BREAKING_UI, APP_BUG, AMBIGUOUS). On change → re-fetch
   /api/changes?severity=<comma list>&classification=<value>. List rows (newest first): displayId link to #/changes/<id>, kind,
   severity badge (LOW/MEDIUM → slate, HIGH → review style, CRITICAL → bug style; always text), classification text, time,
   explanation sliced to 120 chars + '…'.
2. renderChange(id): GET /api/changes/:id. Header: displayId + classification + severity. D2: two <figure> side by side with
   <img src="/api/snapshots/<baseId>/screenshot" alt="Before"> and after; on img error replace with text "No screenshot".
   D3: for each evidence item a table with columns Field | Before | After; rows role, name, selector, pagePath, attrs (JSON in .mono).
   If before !== after: add class diff-changed to both cells and prefix the after text with '≠ '.
   .diff-changed { background: var(--crimson-wash); color: var(--ink) }.
   Leave a container <div id="repair-preview"> for T19.
3. Responsive: under 900px the rail stacks above the list and figures stack vertically.
4. Tests: 3 names from the card (seed data by running the v1→v2 pipeline in beforeAll against fixtures).

SELF-CHECK: [ ] unchecking LOW hides LOW rows (test) [ ] check-dashboard ok [ ] npm run verify PASS
```

## P-T19 — D5/D6/D7

```
TASK T19 — Repair preview (D5), actions with confirm (D6), validation + audit (D7). Tier FLASH. CHECKPOINT task.
Read: docs/WORKSPLIT.md "## T19", docs/PRD.md §12.3 (D6 behaviour), harness.md §16.2 (seal). Same HARD RULES as T17.

DO:
1. renderRepairPreview(container, repair): steps table — stepId | action | old target (name + selector, .mono) → new target |
   provenance badge (replay/repair-match/repair-replan/llm/human as text) | score (2 decimals) | alternatives (name score, …).
   Explanation paragraph below. Call it from renderChange (for each linked repair) and renderRepair.
2. D6 actions bar: buttons Approve (btn--primary), Reject, Retry, Rollback (outlined ink, not red). Enabled matrix:
   approve: validated · reject: proposed|needs_review|validated · retry: proposed|validated · rollback: applied.
   Disabled buttons get disabled attribute + title explaining why.
   Approve/Reject/Rollback → open #confirm-dialog, require actor + reason, on Confirm POST /api/repairs/:id/<action>
   {confirm:true, actor, reason}; show errors in a role="alert" paragraph; re-render on success.
   needs_review: radio list of pendingChoice.candidates (name, role, score) + button "Validate choice" → POST resolve
   {confirm:true, actor, reason:'resolve', candidateRef}. Show "Validating…" text while waiting.
   Approved/applied → render <span class="seal">APPROVED</span>.
3. D7 (renderRepair): validation runs table (id, verdict badge, time); per run oracle results list: '✓'/'✕' + oracleId + short
   detail (JSON.stringify(detail).slice(0,120)); "supporting only" tag when applicable; audit trail table from
   /api/audit?entity=repairs&id=<id> (time, actor, action).
   renderAudit(): global table with an entity <select> filter.
4. Tests: 4 names from the card.

SELF-CHECK: [ ] approve flow requires a reason (test) [ ] seal visible after approve [ ] no innerHTML [ ] check-dashboard ok
[ ] npm run verify PASS
CHECKPOINT: tell the human to run `npm run serve` and click through D1–D7 in light and dark theme.
```

## P-T20 — Demo

```
TASK T20 — `npm run demo`. Tier FLASH. Read: docs/WORKSPLIT.md "## T20", docs/PRD.md §14.

DO:
1. src/demo.ts:
   - parse flags --interactive, --serve
   - HOME for demo: process.env.HEALTEST_HOME ??= 'demo-home'; HEALTEST_LLM ??= 'replay'
   - spawn fixtures (`node fixtures/server.mjs --all`), wait for 4 LISTENING lines, kill on exit (process.on('exit') + SIGINT)
   - delete demo DB files at start: main.sqlite, demo-bug.sqlite, demo-amb.sqlite inside HOME
   - banner(n, title): console.log(`\n═══ ACT ${n} · ${title} ═══`); if interactive await Enter (readline)
   - Acts 1–8 exactly as PRD §14 by calling runIntent / approve / resolveCandidate directly; after each act print
     `→ ${verdict} (exit ${exitCode}) · llmCalls ${n}`; collect into a summary table printed at the end (console.table).
   - --serve: start the API server on 4300 at the end and print the URL.
2. tests/integration/demo.test.ts: run acts 1–3 via an exported function runActs([1,2,3]) and assert PASS, HEALED_PASS, HEALED_PASS with llmCalls 0.
   Include '[R-PS-08] demo uses v2 as an intentional UI change of v1 (the v1 plan fails replay on v2)'.

SELF-CHECK: [ ] `npm run demo` finishes < 4 min, summary shows PASS, HEALED_PASS, HEALED_PASS, PASS, APP_BUG, NEEDS_REVIEW, HEALED_PASS
[ ] npm run verify PASS. Paste the summary table.
```

## P-T21 — Scenarios under the oracle

```
TASK T21 — Make `npm run verify:demo` green. Tier PRO. Read: docs/WORKSPLIT.md "## T21", harness.md §17, oracles/demo.oracle.mjs (READ ONLY).

DO:
1. npm run build && npm run verify:demo. Read ONLY the tail of .harness/logs/<failing step>.log.
2. For each FAIL line: find the product-code cause and fix it. NEVER edit oracles/, fixtures/, intents/. If you believe the
   oracle is wrong, write BLOCKED with the exact assertion line and your evidence; stop.
3. When green: call the spec-auditor subagent. For each WEAK/MISSING R-ID strengthen or add a test (assert backend state, not
   UI text; no vacuous expects). Re-run verify:demo.

SELF-CHECK: [ ] verify:demo prints PASS trace and PASS demo-oracle [ ] spec-auditor: all OK (paste its output)
```

## P-T22 — Final audit + README

```
TASK T22 — Final audit and README. Tier PRO. Read: docs/WORKSPLIT.md "## T22".

DO:
1. Run guardrail-auditor with: "Full scope: src/, dashboard/. Try every G1–G7 exploit listed in your system prompt."
   Fix concrete findings only; re-run npm run verify:demo after each fix.
2. Run spec-auditor again; node scripts/check-dashboard.mjs; node scripts/check-trace.mjs.
3. Write README.md with sections: Problem · Idea (intent / oracle / steps; "steps may heal, outcomes may not") ·
   Architecture (copy the ASCII diagram from PRD §6) · Verdicts (table from PRD §10.5 with exit codes) ·
   Setup (Windows PowerShell and macOS/Linux: npm ci, npx playwright install chromium, npm run build) ·
   Demo (npm run demo, npm run demo -- --interactive --serve) · Writing a new intent (annotated YAML) ·
   Guardrails G1–G7 (one line each + where enforced) · Limitations (heuristic lexicon is checkout-oriented; Chromium only;
   LLM optional).
SELF-CHECK: [ ] all audits clean (paste outputs) [ ] README renders, no TODO [ ] npm run verify:demo PASS
```

---

# P1 prompts (only after T22 green; branch ralph/p1)

## P-M01 — MCP read-only server

```
TASK M01 — MCP read-only server. Tier FLASH (+ guardrail-auditor). Read: docs/WORKSPLIT.md "## M01", harness.md §14, .agents/rules/mcp.md.

DO:
1. npm i @modelcontextprotocol/sdk (add justification line to ralph/progress.md).
2. PROBE FIRST: scripts-dev/mcp-probe.mjs that creates a server with one tool over stdio using the SDK's documented
   McpServer/StdioServerTransport (check node_modules/@modelcontextprotocol/sdk/README.md for exact import paths and the
   registerTool/tool signature). Run it, confirm it starts, delete it.
3. src/mcp/tools-read.ts: four handlers returning compact JSON: list_monitored_sites → [{id,name,baseUrl,openChanges}];
   get_change_report {changeId} → ChangeReport without screenshots; compare_snapshots {baseSnapshotId, headSnapshotId} →
   diffSnapshots result (not persisted); get_run_report {runId} → RunOutcome. Input schemas with zod.
4. src/mcp/readonly.ts: registers ONLY these four with annotations { readOnlyHint: true }; every call writes audit_log
   (actor `mcp:${clientName ?? 'unknown'}`, action tool name, payload {argsHash}). Add npm script "mcp:readonly".
5. Tests: '[R-F6-01] read-only server registers exactly the four read tools' (use the SDK's in-memory/client transport if
   available, else spawn stdio and send a tools/list JSON-RPC request) and 'tool output never includes ariaYaml or screenshot bytes'.
SELF-CHECK: [ ] no import of governance/approvals in src/mcp/readonly.ts [ ] npm run verify PASS
```

## P-M02 — MCP operator server

```
TASK M02 — MCP operator server. Tier PRO. Read: docs/WORKSPLIT.md "## M02", harness.md §14.
DO: src/mcp/operator.ts — if process.env.HEALTEST_OPERATOR !== '1' → print 'operator server disabled (set HEALTEST_OPERATOR=1)' and exit 2.
Register scan_website {site, target, paths?} (allowlist check against the site's allowlist → denied result + audit),
propose_repair {changeId}, validate_repair {repairId}; annotations per harness §14 table. Every call (including denials) audited.
Tests: 2 names from the card. SELF-CHECK: [ ] approve/rollback NOT registered here yet [ ] npm run verify PASS
```

## P-M03 — Approval tokens

```
TASK M03 — Single-use human approval tokens + approve_repair/rollback_repair. Tier PRO (+ guardrail-auditor). Read: docs/WORKSPLIT.md "## M03", harness.md §14.
DO:
1. src/db/migrations/003_tokens.sql: approval_tokens(id INTEGER PK, repair_id INTEGER NOT NULL REFERENCES repairs(id),
   token_hash TEXT NOT NULL UNIQUE, action TEXT NOT NULL CHECK(action IN ('approve','rollback')), expires_at TEXT NOT NULL,
   used_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))).
2. Repo: mintToken(repairId, action) → returns raw token (randomBytes(32) hex) storing only sha256; consumeToken(raw, repairId, action)
   in ONE transaction: row exists, repair matches, action matches, used_at IS NULL, expires_at > now → set used_at; else throw.
3. API: POST /api/repairs/:id/mcp-token {confirm:true, action} (CSRF) → {token, expiresAt}. Dashboard: "Authorize via MCP" button
   in D6 showing the token once in a dialog with a copy button.
4. Operator server: approve_repair {repairId, approvalToken, actor, reason} and rollback_repair {…} → consumeToken → governance
   function; invalid → result {code:'APPROVAL_REQUIRED'} + audit.
Tests: 4 names from the card. SELF-CHECK: [ ] raw token never stored or logged (grep audit payloads) [ ] npm run verify PASS. Then guardrail-auditor.
```

## P-M04 — Plugin host

```
TASK M04 — Plugin host (permissions, schemas, audit, dry-run). Tier PRO. Read: docs/WORKSPLIT.md "## M04", harness.md §15, .agents/rules/plugins.md.
DO:
1. src/plugins/manifest.ts: zod schema of plugin.json (harness §15) — permissions.network items must be hostnames (no '*').
2. src/plugins/validate-schema.ts: minimal JSON-Schema validator supporting type object/string/integer/array, required,
   properties, items, additionalProperties:false (≈60 lines). Unit-test it.
3. src/plugins/host.ts: runPlugin(repo, pluginDir, trigger, input, {dryRun}) → load+validate manifest → validate input →
   child_process.fork(index.mjs) with env {HEALTEST_PLUGIN_DRYRUN, HEALTEST_PLUGIN_ALLOWED_HOSTS} → send input via IPC →
   receive output (timeout 15 s) → validate output → audit (action plugin.invoke|plugin.denied|plugin.dryrun) → return.
   Redaction: build input only from change/repair ids + classification + severity + explanation + dashboard link.
Tests: 3 names from the card. SELF-CHECK: [ ] audit row written for denied invocations [ ] npm run verify PASS
```

## P-M05 — GitHub issue plugin

```
TASK M05 — github-issue plugin. Tier FLASH. Read: docs/WORKSPLIT.md "## M05", harness.md §15.
DO: plugins/github-issue/plugin.json (copy harness §15) and plugins/github-issue/index.mjs: process.on('message', async input => {
  validate repo ∈ config.repoAllowlist else send {error:'repo not allowed'};
  body = markdown with change displayId, classification, severity, explanation, dashboard link, repair status — nothing else;
  if dryRun → send({issueUrl:'dry-run', issueNumber:0, preview: body}) (host strips preview before output-schema validation);
  else POST https://api.github.com/repos/${repo}/issues with Authorization Bearer process.env.GITHUB_TOKEN → send({issueUrl, issueNumber}) }).
Tests: 2 names from the card (dry-run only; never call GitHub in tests). SELF-CHECK: [ ] body contains no card data or DOM [ ] npm run verify PASS
```

---

# §R Recovery prompts (paste when the model goes wrong)

## R1 — A test is failing

```
Stop adding features. A test is failing. Do exactly this:
1. Run ONLY the failing test file: npx vitest run <path> --reporter=verbose. Paste the first error block (max 30 lines).
2. State in one sentence what the test expects and what actually happened.
3. State which is wrong: the product code or your understanding. The test and the PRD are the specification; the product code
   is what you change. You may only change the test if it contradicts the PRD — quote the PRD line if so.
4. Make the smallest change that fixes the cause (not the symptom). No try/catch that hides errors, no special-casing.
5. Re-run that file, then npm run verify:fast. Paste results.
```

## R2 — Stuck / repeating the same fix

```
You have tried the same kind of fix more than once. Stop editing.
1. List every attempt so far in one line each: what you changed, what happened.
2. Print the relevant real values (scores, URLs, element names, statuses) with a temporary console.log or a probe script in scripts-dev/.
3. Form ONE hypothesis based on those values. If you cannot, write "BLOCKED: <task>: <error> — tried: <list> — values: <values>"
   in ralph/progress.md and stop. Do not attempt a third blind fix.
```

## R3 — Scope creep

```
You changed files or added features outside the current task card. Revert them now:
1. git status / git diff --stat. For every file not listed in the task card's "Files", run git checkout -- <file> (or delete if new),
   unless the card's steps explicitly require it.
2. Put each idea under "Noticed (not done)" in your final message instead.
3. Re-run npm run verify:fast and continue ONLY the card's remaining steps.
```

## R4 — Claimed done without proof

```
Your "done" is not accepted yet. Provide, in this order:
1. The full output of `npm run verify` from this chat (all PASS lines).
2. For each test name in the task card: the file:line where it exists and that it passed (vitest verbose output).
3. The self-check list with YES/NO and file:line evidence for each item.
If any item is NO or missing, the task is not done: continue working on that item only.
```

## R5 — Tried to edit a locked file

```
That path is human-owned and locked (AGENTS.md invariant 1). Do not retry, rename, copy around, or edit it through the shell.
Revert any change to it (git checkout -- <path>). If you truly believe it is wrong, write
"BLOCKED: <task>: locked file <path> appears wrong because <evidence>" in ralph/progress.md and stop. The human will decide.
```

## R6 — Wants to change thresholds/weights/oracles to pass

```
Do not change policy.json thresholds, similarity weights, oracle definitions or fixture HTML. Those encode the product's
judgement; changing them to pass a test is reward hacking.
Allowed: add a synonym phrase to src/match/synonyms.ts, fix a bug in name/nearText extraction, fix the matcher logic to match
the PRD text exactly. Print the candidate score table (console.table) and explain which input value is wrong compared with what
the PRD expects. If the PRD-correct implementation still fails, report BLOCKED with the score table.
```

## R7 — Suspected invented API

```
You may be using an API that does not exist. Before continuing:
1. Name the exact function/option you are relying on and the package version (npm ls <pkg>).
2. Find it in node_modules/<pkg> type definitions (grep the .d.ts) or README and quote the signature.
3. If not found, write a 5–10 line probe in scripts-dev/ that calls it, run it, paste output, then delete the probe.
4. Rewrite your code to use only what you confirmed.
```

## R8 — Context got long / model is confused (start fresh)

```
Summarize for a fresh session in ≤15 lines, then stop:
- task id and which card steps are complete (by number)
- files changed so far
- current verify status (last PASS/FAIL lines)
- the exact next step
- any open error message (one line)
Write this summary into ralph/progress.md under "HANDOFF T##". I will open a new chat with Prompt 0 + the task prompt + this handoff.
```

## R9 — CodeRabbit / review triage

```
Run the reviewer subagent once (npm run review). Classify each finding as BLOCKER / FIX / IGNORE:
- BLOCKER: concrete correctness or security defect, or an AGENTS.md invariant violation you can point to at file:line.
- FIX: small real bug or missing validation in the files you changed for this task.
- IGNORE: style, naming, "consider", anything outside this task's files.
Fix BLOCKER and FIX only. Re-run npm run verify. Never run the review a second time for the same task.
```

## R10 — Explain-back check (use before a PRO task starts, to catch misunderstanding early)

```
Before writing code, explain back in ≤12 lines:
1. What the module must do (in your words).
2. Its exported function signatures (exact names from the PRD/card).
3. The 3 most likely ways to get it wrong (e.g. "accepting DOM text as proof").
4. Which tests will prove it, by exact name.
Wait for "GO" before writing code.
```

---

## Quick reference: which prompt when

| Situation | Paste |
|---|---|
| New chat for a task | Prompt 0 → wait READY → P-T## (for PRO tasks add R10 before GO) |
| Model says "done" | R4 |
| Failing test | R1 → if repeats, R2 |
| Touches other files | R3 |
| Locked file attempt | R5 |
| Wants to tweak thresholds/oracles | R6 |
| Weird API / runtime "is not a function" | R7 |
| Long chat, sloppy answers | R8, then new chat |
| After verify green | R9 (review) → commit |
