# HealTest: Intent-Aware Self-Healing E2E Testing

*Recommended merged PRD for Hackwave PS1, built from three inputs: the HealTest PRD, the Intent-Heal PRD, and the System Requirements and Installation Guide.*

**Pitch:** When the interface changes, HealTest rebuilds the path from the test's intent, but never changes what success means.

**Core rule:** Steps may heal; outcomes may not. Intent and oracles are human-authored and immutable. Only the browser steps can be reconstructed.

## 1. Bottom line

- **HealTest PRD** is the strongest foundation. It has a backend oracle, an APP\_BUG verdict, a step cache, and offline modes. It is also the riskiest to finish: 17 engine modules, 10 phases, 4 verdicts, 3 LLM clients, a CLI and a dashboard.
- **Intent-Heal PRD** has the best demo experience and the most disciplined scope: a judge-operated dashboard with Run and Reset, visible run stages, a Recovered badge that cannot be confused with Passed, a repeated-run evaluation plan, and a task split for parallel work. Its weakness is trust: assertions are UI-level, so a UI that lies could still pass. It also assumes React, Vite and Node.
- **System Requirements guide** is not a PRD. It is an install list for a third architecture (Node plus Python, NVIDIA NIM, smolagents or LangGraph, Babel AST code analyzer). It conflicts with both PRDs on stack and needs internet access throughout. Keep only its environment hygiene and its verification checklist.
- **Recommendation:** Use HealTest's engine and trust model, Intent-Heal's demo UX and scope discipline, a single Python runtime, one live LLM adapter plus replay and off modes, and explicit cut lines so something demoable exists early.

## 2. Side-by-side comparison

| Dimension | HealTest PRD | Intent-Heal PRD | Requirements guide | Decision for merged PRD |
| --- | --- | --- | --- | --- |
| What it is | Implementation-ready PRD | Lean hackathon PRD | Install checklist, no product definition | One PRD, using HealTest as the spine |
| Stack | Python: Playwright, FastAPI, vanilla JS | React + TypeScript + Vite + Node Playwright | Node and Python together | Python only, vanilla JS, no build step |
| Proof of success | Deterministic backend API oracle; UI is evidence only | Playwright assertions on UI state | None defined | Backend oracle is the source of truth |
| Verdicts | PASSED, HEALED, APP\_BUG, NEEDS\_REVIEW | PASS, FAIL, NEEDS REVIEW | None | HealTest's four verdicts, with UI labels borrowed from Intent-Heal |
| Learning and cache | Learn on A, cache steps, replay with zero LLM calls | No cache; heals every run | None | Keep cache; it is the strongest cost and speed story |
| Recovery logic | Selector, then fingerprint, then LLM, then bounded planner | One bounded re-plan per failed step | Agent framework only | HealTest's resolver order with Intent-Heal's strict uniqueness rule |
| LLM | Gemini behind an interface; live, replay, off | Provider-agnostic; mock planner first | NVIDIA NIM or Hugging Face, internet required | Interface with one live adapter, plus replay and off |
| Offline demo | Required | Required via mock planner | Not supported | Required |
| Demo UX | CLI first, dashboard is read-only | Dashboard with scenario buttons, Run, Reset, status stages | None | Dashboard with controls (from Intent-Heal) on HealTest's report data |
| Real-bug handling | Explicit APP\_BUG, cache protected | FAIL, but with only UI assertions | None | APP\_BUG, cache protected |
| Evaluation | Metrics defined, small-sample caveat | Five runs per scenario | None | Five runs per scenario across modes |
| Scope risk | High | Low to medium | Medium (two runtimes, source analysis) | Medium, with cut lines |

### Contradictions resolved

- **Language and frontend:** HealTest says no React; Intent-Heal says React and Vite; the guide says Node plus Python. Resolved to Python and plain HTML/JS. One runtime means one install, one demo script, and fewer places to break at judging time.
- **LLM provider:** Gemini (HealTest) versus NVIDIA NIM or Hugging Face (guide) versus provider-agnostic (Intent-Heal). Resolved to a small interface with one live adapter, chosen by whichever API key the team can actually use. NIM exposes an OpenAI-compatible endpoint, so a single OpenAI-compatible adapter can serve it; verify this against whichever provider you pick.
- **Failure naming:** FAIL versus APP\_BUG. Resolved to APP\_BUG internally; the dashboard may display it as red FAIL with the subtitle application bug.
- **Uncertain results:** Intent-Heal asks the team to choose between NEEDS REVIEW and FAIL. Resolved: NEEDS\_REVIEW means the system cannot certify the run; APP\_BUG means the app demonstrably failed.

## 3. What was kept, changed, and cut

**Kept from HealTest:** backend order oracle; Version C trap (misleading success page with HTTP 500); step cache that is never overwritten by APP\_BUG or NEEDS\_REVIEW; fingerprint scoring and resolver order; deterministic verdict precedence; replay and off LLM modes; card masking; per-run JSON report.

**Kept from Intent-Heal:** dashboard with scenario buttons, Run and Reset; run stages (Queued, Observing, Acting, Verifying, Complete); Recovered badge visually distinct from Passed; the immutable goal and assertions shown on every run page; repeated-run evaluation; module ownership split for parallel work; a documented risk list.

**Kept from the guide:** .env.example discipline with no committed keys, a pre-flight verification script, headless toggle, and test timeout settings.

**Changed:**

- Cache writes keep the previous cache as a backup file, so a bad heal can be rolled back in one command.
- Error signals are split into blocking and diagnostic (see section 7); HealTest's original policy of treating every console error as potentially blocking risks false APP\_BUG verdicts.
- The dashboard triggers runs and switches app versions; HealTest only displayed results.
- A scripted ambiguity case is added so NEEDS\_REVIEW has a real demo or test, not just a table entry.

**Cut from MVP (moved to later):**

- Babel AST or TypeScript compiler source analysis (guide). It is a separate product; mention it only as a roadmap item linking test failures to code diffs.
- smolagents, LangGraph, transformers (guide). Heavy dependencies for a bounded one-action-at-a-time planner that a small loop covers.
- React, Vite, Node toolchain, axios, chalk, ora, commander (guide and Intent-Heal).
- Separate Rich CLI polish beyond run, demo and reset commands.
- Screenshot or vision assistance, coupon workflow, CI integration, PR bots.

## 4. Product definition

### Problem

Fixed-selector E2E tests break when a button is renamed, moved, or restructured even though the user journey still works, and teams burn time repairing tests instead of finding defects. A naive AI agent that clicks until it sees a success message is worse: it can hide a real bug behind a lying UI. Both failure modes cost trust.

### Product model

| Concept | Meaning | Can the agent change it? |
| --- | --- | --- |
| Intent | Human-authored goal | No |
| Oracle | Deterministic proof the goal was achieved | No |
| Steps | Concrete browser actions | Yes, within invariants |

A run succeeds only if every required oracle passes and no blocking failure signal or invariant violation exists. A visible confirmation message is evidence, never proof.

### Personas (hypotheses, not research)

- **Maya, developer:** needs to know whether an E2E failure is a real regression or a stale step, and wants unsafe healing to be impossible.
- **Arjun, QA engineer:** owns checkout regression; needs repeatable runs and one place to inspect verdict, step diff, screenshots, oracle results and signals.

### Goals

1. Express a test as intent, test data, oracles and invariants in a YAML spec.
2. Learn a working step sequence on Version A and cache it.
3. Detect drift and explain exactly which element or step changed.
4. Heal harmless drift through selector, fingerprint, and bounded planning, then re-verify with the original oracles.
5. Refuse to heal over genuine failures: report APP\_BUG with evidence.
6. Replay healed steps on the next run with zero LLM calls.
7. Run the whole demo offline and deterministically.

### Non-goals

Arbitrary production websites; login flows; real payments or data; multiple browsers or parallel runs; cloud deployment; pixel-diff testing; LLM control over intent, oracles, safety invariants or verdicts; auto-commit or auto-PR of regenerated tests; a test-authoring GUI.

## 5. Demo story and scenarios

The demo app is Gizmo Store: synthetic data, SQLite, FastAPI, plain HTML/JS. A version switch endpoint changes the UI without restarting the server.

| Act | App version | What happens | Expected result |
| --- | --- | --- | --- |
| 1 | A | Traditional selector test passes. HealTest explores, learns and caches steps. | PASSED |
| 2 | B (harmless redesign) | Traditional test fails on the stale selector. HealTest detects drift, heals, and re-checks oracles. | HEALED |
| 3 | B again | Cached healed steps replay. | PASSED, zero LLM calls |
| 4 | C (500 error, success-looking page) | HealTest sees the 500 and the missing order and stops. Cache untouched. | APP\_BUG |
| Bonus | C2 (wrong total, 2498 instead of 1999) | UI looks fine; backend oracle catches the mismatch. | APP\_BUG |
| Test only | Ambiguity fixture | Two equally plausible targets. | NEEDS\_REVIEW |

**Version B changes:** Add to cart becomes Add to bag; #add-1 replaced by data-sku; cart link becomes a bag icon button; Checkout becomes Proceed to payment and moves; one-page checkout becomes shipping then payment pages; Card number becomes Card no. with a new ID; a Terms checkbox gates payment; expiry splits into Month and Year selects; the success text and order-ID selector change.

**Oracles (never touched by the agent):**

1. Backend: exactly one order for the test email with status PAID, total 1999 cents, card last four 4242.
2. UI: a confirmation message is visible. Supporting evidence only; it cannot override a failed backend oracle.

**Invariants:** only values referenced from the spec's test data may be typed; maximum action count enforced; no clicks on forbidden text (delete, remove, logout, cancel order); navigation must stay inside the allowed URL prefix; no blocking error signal may be ignored.

## 6. Scope with priorities

### P0: must exist for the demo to be credible

- Gizmo Store with versions A, B, C, version switching, SQLite orders, and the test-only order endpoint and reset endpoint.
- Traditional fixed-selector test (passes on A, fails on B).
- YAML intent spec with masked card data in all output.
- Playwright session, page snapshot (capped at 150 interactive elements, stable ordering), error-signal capture.
- Element fingerprinting and resolver (selector, then fingerprint, then optional LLM).
- Action validation and a heuristic planner that works with the LLM off.
- Step cache with the save-only-after-PASSED-or-HEALED rule.
- Deterministic oracles, invariants and classifier.
- Step differ and per-run JSON report with screenshots.
- Dashboard: scenario and version buttons, Run, Reset, run list, run detail.
- One-command demo script for the four acts.
- README, .env.example, requirements, and a pre-flight check script.

### P1: should have, cut first if time is short

- Live LLM adapter and replay cache (the offline demo does not depend on these).
- Version C2 wrong-total scenario.
- Cache backup and one-command rollback.
- Ambiguity fixture for NEEDS\_REVIEW.
- Rich terminal summary table.

### P2: later

- Human approval before saving healed steps.
- Export healed workflow as a regenerated Playwright test.
- Second workflow (coupon).
- Vision assistance, CI and PR integration, code-diff correlation (the guide's AST idea).

## 7. Functional requirements (condensed)

### 7.1 Browser and perception

Python Playwright (sync API), Chromium, 1280x800. Record HTTP 5xx, API 4xx, console errors and page errors. Capture screenshots at key stages and at drift or failure. A networkidle timeout is not itself an application error. Each snapshot lists visible interactive elements with role, accessible name, text, tag, label, key attributes, nearby heading, URL path, normalized bounding box, visible and enabled state, plus a snapshot-scoped element ID. Ordering must be stable so replay keys match.

### 7.2 Fingerprint and resolver

Weighted score using RapidFuzz: name 0.30, role 0.15, attributes 0.15, label or text 0.15, nearby context 0.10, same page 0.10, position 0.05. Synonym groups cover cart/bag/basket, checkout/proceed to payment, pay/place order, add to cart/bag, card number/card no., continue/next.

Resolution order:

1. Original selector, only if it matches exactly one visible element and scores at least 0.60.
2. Fingerprint scoring against the current snapshot; 0.75 or above is accepted.
3. Between 0.50 and 0.75: ask the LLM to choose among the top five, accept at 0.60 confidence or higher. With no LLM, treat as unresolved.
4. If the top two candidates score within a small margin, do not guess: NEEDS\_REVIEW (adopted from Intent-Heal's uniqueness rule).
5. Unresolved: bounded planning, or NEEDS\_REVIEW.

Every resolution carries a human-readable explanation. Scores are heuristics, not calibrated probabilities, and the UI must say so.

### 7.3 Actions and planner

Allowed actions: click, fill, select, check, press, navigate, wait\_for, done, give\_up. Every action is validated before execution: the target exists and is actionable; fill uses a value reference into the spec's test data (raw strings are rejected); forbidden text is blocked; navigation stays in prefix; step budget is respected.

The planner loop observes, proposes one action, validates it, records the action and the element fingerprint, and repeats. It stops on done, give\_up, step limit, three repeats of the same action on the same URL, or any blocking 5xx or page error. It never routes around a server failure.

The heuristic planner covers the demo: fill matching empty fields, tick required terms boxes, select month and year, click cart, checkout, continue and pay controls, avoid repeats. It is honest about scope: a fallback for the controlled demo, not general autonomous browsing.

Boundary (from Intent-Heal, kept): planner proposes, validator approves, Playwright executes, oracles decide.

### 7.4 Step cache

Stored per test at cache/steps/{test\_id}.json with app version seen, steps and timestamp. Replay on later runs. If a step cannot be resolved safely, record drift and rebuild only the remaining tail. Write only after PASSED or HEALED; keep the previous file as a backup. APP\_BUG and NEEDS\_REVIEW never write.

### 7.5 Error signals: blocking versus diagnostic

| Signal | Treatment |
| --- | --- |
| HTTP 5xx from the app origin | Blocking |
| Uncaught page error | Blocking |
| Checkout or order API non-2xx | Blocking |
| Visible error text matching configured patterns | Blocking |
| Other console errors, unrelated 4xx (for example a missing favicon) | Recorded as diagnostic, not blocking |

This is a proposed refinement of the HealTest policy; it must be covered by tests before the demo.

### 7.6 Classifier (fixed precedence, no LLM involvement)

1. Blocking failure signal: APP\_BUG.
2. UI flow finished but a required oracle failed: APP\_BUG.
3. Invariant violation: NEEDS\_REVIEW.
4. Planner gave up or hit the step limit: NEEDS\_REVIEW.
5. All oracles pass and healing occurred: HEALED.
6. All oracles pass and no healing: PASSED.
7. Anything else: NEEDS\_REVIEW.

If an app failure and an invariant violation occur together, the verdict is APP\_BUG and the violation is still listed in the report. Every branch needs a unit test. The LLM may reword the explanation; it can never change the verdict.

### 7.7 Differ and report

Step changes are classified as unchanged, renamed, moved, attribute\_changed, removed, added, restructured. Each run writes runs/{run\_id}/run.json with verdict, explanation, phase log, drift point, step results (method, score, timing, URLs, screenshots), step changes, oracle results, signals, invariant violations, LLM call count and a healed flag. Card numbers appear only as \*\*\*\* 4242.

### 7.8 LLM layer

One interface, three behaviors: live (call the provider, save request and response to cache/llm), replay (SHA-256 key over model, system prompt and user prompt; on a miss log a warning and fall back to heuristics), off (heuristic planner only). Temperature zero, JSON output, validation against Pydantic models and the current snapshot, one retry on invalid JSON, then a controlled error. Never fabricate an LLM result.

## 8. Architecture and stack

**One runtime: Python 3.11+.**

- Browser automation: Playwright (Python, sync) with Chromium.
- Backend for demo app and dashboard: FastAPI and uvicorn; SQLite via the standard library.
- Frontend: plain HTML, CSS and vanilla JavaScript; no build step.
- Models and config: Pydantic v2, PyYAML.
- Matching: RapidFuzz.
- CLI: Typer (run, demo, reset-cache, app-version, dashboard) with Rich output.
- Tests: pytest.
- LLM: one live adapter (Gemini via google-genai, or an OpenAI-compatible client for NVIDIA NIM or similar), plus replay and null clients.

**Dependencies deliberately dropped:** Node, npm packages, React, Vite, smolagents, LangGraph, transformers, Babel.

**Module layout** follows HealTest's structure (demo\_app, healtest engine, dashboard, specs, traditional\_tests, cache, runs, scripts). Keep modules small and single-purpose, and use pathlib for cross-platform paths. Provide both a PowerShell and a shell demo script.

**Environment (.env.example):** LLM provider key and model, HEALTEST\_LLM\_MODE (live, replay, off), DEMO\_APP\_URL, DEMO\_VERSION, HEADLESS, TEST\_TIMEOUT\_MS. Commit no secrets.

**Pre-flight script:** checks Python version, Playwright and Chromium installed, ports free, seed DB creatable, and whether an API key is present. This is the guide's verification checklist adapted to the Python-only stack.

## 9. Dashboard and UX

- Scenario controls: Version A, Version B, Version C (and C2), with Run and Reset demo.
- Run stages shown live: Queued, Observing, Acting, Verifying, Complete.
- Verdict card with four distinct states. HEALED has its own badge and wording so it cannot be mistaken for PASSED; APP\_BUG shows the failing oracle or signal in the headline.
- The immutable intent and oracles are visible on every run detail page.
- Timeline of steps with resolution method, score and screenshot.
- Step diff view: old step, new step, change type, reason.
- Panels for oracle results, error signals, invariant violations, LLM call count and duration.
- A run list for comparing the four acts.

## 10. Success metrics and evaluation

### Required acceptance checks

| Check | Target |
| --- | --- |
| Version A | Traditional test passes; HealTest reports PASSED and learns steps |
| Version B | Traditional test fails; HealTest reports HEALED with all original oracles passing |
| Repeat on B | PASSED from cache with zero LLM calls |
| Version C | APP\_BUG; cache unchanged |
| Oracle integrity | Order checks are deterministic and independent of any LLM |
| Safety | No raw values typed outside the spec; URL and forbidden-action rules enforced |
| Privacy | Card number never appears unmasked in any log or report |
| Offline | Full demo runs in replay and in off mode with no network calls |

### Performance targets (to be measured, not assumed)

Cached replay under 15 seconds; healing under 60 seconds; four-act demo under 3 minutes.

### Evaluation plan

Run each scenario five times from a reset state, in off mode and in replay mode (and live mode if credentials exist). Report: correct verdict rate; false-healing rate on genuine-defect runs (target zero); defect detection rate; harmless-drift recovery rate; NEEDS\_REVIEW rate; LLM calls per run before and after caching; cache overwrites by APP\_BUG or NEEDS\_REVIEW (target zero); recovery latency. Present results as evidence for a scripted scenario, not general reliability.

## 11. Build plan with cut lines

Team size and deadline are unknown, so this plan is ordered by dependency rather than hours. Do not start the agent before the oracle and the failure trap work. Record each phase result in PROGRESS.md only after its check has actually run.

**Checkpoint 1: demoable skeleton (the minimum credible submission)**

1. Gizmo Store A, then B and C with version switching. Check: manual checkout creates one PAID order for 1999 cents on A and B; C returns 500 and creates no order.
2. Traditional test. Check: passes on A, fails on B.
3. Models, spec loader, browser session, snapshot. Check: snapshots inspected on A and B.
4. Fingerprint, resolver, actions, cache. Check: unit tests on matching; cached replay on A; drift detected on B.
5. Oracles, signals, invariants, classifier. Check: every classifier branch unit-tested; C gives APP\_BUG.
6. Heuristic planner and runner. Check: off mode learns on A, heals B, detects C, preserves the cache.

**Checkpoint 2: judge-ready**

7. Differ and report. Check: B's report explains the rename, the added terms checkbox and the restructured checkout flow.
8. Dashboard with Run and Reset, plus the demo script. Check: four acts run end to end and every run detail renders.

**Checkpoint 3: polish and extras**

9. Live LLM adapter and replay cache. Check: live results (if a key exists) reproduce offline through replay.
10. C2, ambiguity fixture, cache backup and rollback, README, final release gate.

If time runs short, cut from the bottom of the list upward. Checkpoint 2 alone is a complete, honest demo.

### Parallel work split

Adapted from Intent-Heal. Give each task a scope, the files it may touch, acceptance criteria and test commands, and require a changed-files and test-output report. Keep shared Pydantic models as one source of truth, owned by the integrator.

- Owner 1: demo app and versions (phases 1 and 2).
- Owner 2: engine (snapshot, resolver, planner, classifier).
- Owner 3: dashboard, reports and demo script.
- Integrator: models, runner, end-to-end verification and final demo.

## 12. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Scope too large for the deadline | Cut lines in section 11; Checkpoint 2 is a complete demo |
| LLM key or quota unavailable at judging | Off and replay modes; demo never depends on live calls |
| Judges suspect the offline planner is hard-coded | State plainly that off mode is a scenario-tuned fallback; show a recorded live run replayed from cache |
| False APP\_BUG from noisy console errors | Blocking versus diagnostic signal policy, with tests |
| Bad heal poisons the cache | Save only after verified PASSED or HEALED; keep a backup file |
| Guessing between near-identical targets | Margin rule leads to NEEDS\_REVIEW, never an arbitrary click |
| Prompt edits break replay keys | Freeze prompts after recording; document any change |
| Test-only endpoints mistaken for a security design | Label them demo-only; real adoption needs an oracle adapter supplied by the app team |
| Timing targets not met | Measure early on the presentation machine |
| Windows-specific failures | Test the PowerShell demo script on the actual presentation machine |

## 13. Open questions

1. Product name: HealTest or Intent-Heal. This document uses HealTest; confirm and check for existing products before public submission.
2. Which live LLM provider can the team actually use (Gemini key versus NVIDIA NIM key)? This decides the live adapter, not the architecture.
3. Team size, deadline and judging rubric. These decide how much of P1 is realistic and whether polish or novelty is weighted.
4. Presentation machine OS and whether the demo can be pre-warmed.
5. Is C2 needed, or is C enough? C2 is a strong proof that the backend oracle matters, and it is cheap once C exists.
6. Do you want the code-diff correlation idea from the requirements guide as a closing roadmap slide?

## 14. Final release gate

- [ ] Version A: traditional test passes; HealTest learns and reports PASSED.
- [ ] Version B: traditional test fails; HealTest explains drift, reconstructs steps, passes all original oracles, reports HEALED.
- [ ] Second Version B run: PASSED from cache with zero LLM calls.
- [ ] Version C: UI claims success, backend oracle or HTTP 500 gives APP\_BUG; cache unchanged.
- [ ] All four verdicts covered by tests, including a safe NEEDS\_REVIEW case.
- [ ] Dashboard shows run list, verdicts, drift evidence, step diffs, screenshots, oracles, signals and invariants.
- [ ] Demo runs fully offline in replay or off mode.
- [ ] Card data masked everywhere.
- [ ] README covers setup, architecture, verdict logic, spec format, demo commands and known limitations.

**Final product rule:** HealTest may change how the browser reaches the goal. It may never change what the goal means or how success is proven.
