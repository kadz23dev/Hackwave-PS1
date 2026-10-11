# HealTest: Intent-Aware Self-Healing E2E Testing

> **Tagline:** *Steps may heal. Outcomes may not.*

HealTest is an intent-aware end-to-end (E2E) testing and governance platform for modern web applications. When an interface changes or gets redesigned, HealTest rebuilds the execution path from the test's intent, but never alters what success means. Verdicts are decided exclusively by deterministic backend state and network status oracles—never by an LLM and never by UI text alone.

---

## Problem

Traditional end-to-end (E2E) tests written as rigid selectors (e.g. `click("#checkout-button")`) break whenever UI elements are renamed, restyled, or restructured—even when the underlying user workflow remains fully functional. Engineering teams spend countless hours maintaining selectors rather than validating product behaviour.

Worse, naive "AI self-healing" tools indiscriminately patch test steps until any success element appears. They find alternative paths, observe a generic "Order confirmed" message on the client screen, and report success even while the backend failed with an HTTP 500 error or created 0 orders.

---

## Idea

HealTest operates under a strict principle:
**Steps may heal, outcomes may not.**

1. **Intent:** A test is written as an **intent** containing a business goal, approved test data, and expected outcomes defined in **backend terms** (e.g., database records created, HTTP 200/201 responses).
2. **Steps:** On the baseline run, HealTest plans and executes UI steps, capturing accessibility snapshots and DOM attributes. It stores these as an optimized **step plan**.
3. **Oracles:** When an intentional UI redesign occurs, HealTest detects the break, computes structural and semantic diffs, proposes a heuristic repair, and validates it against **deterministic backend oracles**. Real application bugs are trapped as `APP_BUG` and rejected, while legitimate redesigns heal into `HEALED_PASS`.
4. **Zero-LLM Reuse:** Validated repairs are cached and reused on subsequent runs with **0 LLM calls**.

---

## Architecture

The system operates across a unified execution and governance pipeline:

```text
                        intents/checkout.intent.yaml  (human, locked, sha256)
                                      │
 ┌────────────────────────────────────┴────────────────────────────────────────┐
 │ pipeline/run.ts  (orchestrator — one call = one CLI `run`)                 │
 │                                                                            │
 │  intent/load ──► browser/session ──► snapshot/capture ──► governance/reuse │
 │                        │                                   │ plan?         │
 │          no plan ──────┴───────────────────────────────────┤               │
 │             │                                              ▼ plan          │
 │             ▼                                                              │
 │       planner/plan   executor/replay ──fail──► diff/differ ──► change rpt  │
 │             │          │                           │                       │
 │             │          │                    match/matcher                  │
 │             │          │            single │ ambiguous │ none              │
 │             │          │      repair-match │ NEEDS_REV │ planner(tail)     │
 │             ▼          ▼                   ▼           ▼                   │
 │        oracle/runner (backend_state, network_status, dom_state*)           │
 │                                 │                                          │
 │        validate/validation (fresh context, strict replay, oracles)         │
 │                                 │                                          │
 │        classify/verdict ──► explain/templates ──► governance/policy        │
 │                                 │                                          │
 │        db/repo  (append-only audit, change+repair+validation links)        │
 └─────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                  server/api (127.0.0.1, CSRF) ──► dashboard/ (D1–D7)
                                   │
                          P1: mcp/readonly, mcp/operator, plugins/github-issue
```

`*` `dom_state` oracles are supporting evidence only and are never sufficient on their own (Guardrail G5).

---

## Verdicts

Verdicts are strictly deterministic. Input: `{ toolError, appError, oracleResults, plannerStatus, repaired, replanned, ambiguous, reusedRepair, planIsKnownGood }`. First matching condition wins:

| # | Condition | Verdict | Classification | Exit Code | Description |
|---|---|---|---|---|---|
| 1 | `toolError` (crash, malformed intent, disallowed origin) | `FAIL_UNREPAIRABLE` | `null` | `1` | Framework or tool execution failure |
| 2 | `appError` (any 5xx on `/api/` or non-supporting oracle `ok=false`) | `APP_BUG` | `APP_BUG` | `10` | Real application failure detected |
| 3 | `ambiguous` (multiple candidate elements within matching margin) | `NEEDS_REVIEW` | `AMBIGUOUS` | `11` | Ambiguous UI choices routed to human |
| 4 | `plannerStatus` in `stuck`/`budget`, or guardrail violation | `FAIL_UNREPAIRABLE` | `BREAKING_UI` (if repaired) | `12` | Planner unable to find viable path |
| 5 | All oracles ok AND (`repaired` OR (`reusedRepair` AND NOT `planIsKnownGood`)) | `HEALED_PASS` | `BREAKING_UI` (if replanned) / `HARMLESS_UI` | `0` | Healing verified by backend oracles |
| 6 | All oracles ok and replaying existing known-good plan | `PASS` | `null` | `0` | Baseline or known-good replay passed |

---

## Setup

HealTest runs on Node.js (v20+) across Windows, macOS, and Linux.

### Windows (PowerShell)
```powershell
# 1. Install dependencies
npm ci

# 2. Install Playwright browser binaries
npx playwright install chromium

# 3. Build the TypeScript project
npm run build
```

### macOS / Linux (Bash / Zsh)
```bash
# 1. Install dependencies
npm ci

# 2. Install Playwright browser binaries
npx playwright install chromium

# 3. Build the TypeScript project
npm run build
```

---

## Demo

HealTest includes a fully automated 8-act demonstration exercising all core scenarios: baseline capture on v1, healing on v2, instant reuse with 0 LLM calls, governance approval, trapping the silent 500 error on v2-bug, human candidate resolution on v2-ambiguous, and dashboard review.

### Headless Demo Run
```bash
npm run demo
```

### Interactive Demo with Live Dashboard
```bash
npm run demo -- --interactive --serve
```
- `--interactive`: Pauses between each act, allowing you to inspect execution step-by-step.
- `--serve`: Launches the governance dashboard at `http://127.0.0.1:4300` upon completion.

---

## Writing a New Intent

Intents are written in human-readable YAML with no CSS selectors. Success criteria are defined in terms of backend state and network transactions:

```yaml
# Name and high-level goal of the intent
name: checkout-valid-card
site: gizmo-shop
goal: Complete checkout with a valid credit card.
startPath: /

# Security boundary: only these origins are permissible for browser interaction
allowedOrigins:
  - http://127.0.0.1:4101
  - http://127.0.0.1:4102
  - http://127.0.0.1:4103
  - http://127.0.0.1:4104

# Maximum browser actions allowed before aborting
actionBudget: 15

# Approved test dataset (keys mapped by planner, sensitive data masked)
data:
  product: Gizmo Mini
  email: test@example.com
  name: Jane Doe
  address: 123 Market St
  cardNumber: "4242424242424242"
  expiry: "12/28"
  cvc: "123"

# Planner configuration defining when the goal is achieved in browser
planner:
  doneWhen:
    pathPattern: ^/confirmation(\.html)?$

# Deterministic oracles defining absolute ground truth
expected:
  # 1. Backend state oracle: queries application database or state endpoint
  - id: order-created
    type: backend_state
    endpoint: /__state
    assert:
      path: orders
      op: length_gte
      value: 1
      where:
        email: "{{data.email}}"

  # 2. Network oracle: ensures zero server 5xx errors occurred
  - id: no-server-errors
    type: network_status
    assert:
      noStatusGte: 500

  # 3. Network transaction oracle: verifies orders API received successful response
  - id: order-api-ok
    type: network_status
    assert:
      pathRegex: ^/api/orders$
      method: POST
      requireStatusIn: [200, 201]

  # 4. DOM assertion: client-side UI confirmation (supporting evidence only)
  - id: confirmation-shown
    type: dom_state
    supportingOnly: true
    assert:
      textContains: "Order confirmed"
```

---

## Guardrails (G1–G7)

HealTest enforces strict security and integrity invariants:

- **G1 (Immutable Intent):** Intent files are hashed via SHA-256 and frozen with `deepFreeze`; mutations throw errors and the original SHA is persisted on every run. *(Enforced in `src/intent/load.ts` and `src/pipeline/run.ts`)*
- **G2 (Observed Elements Only):** Steps may only target element references (`ref`) that were explicitly observed in stored snapshots; arbitrary synthetic selectors are rejected. *(Enforced in `src/executor/guards.ts` and `src/match/matcher.ts`)*
- **G3 (Allowlist, Data, Budget):** Navigation is restricted to allowlisted origins, data inputs must exist in `intent.data`, and step budgets prevent runaway execution. *(Enforced in `src/executor/guards.ts`)*
- **G4 (Deterministic Validation):** Repairs cannot be validated or approved without a passing validation run executed in a clean context with passing deterministic oracles. *(Enforced in `src/validate/validation.ts` and SQLite trigger `repair_needs_validation`)*
- **G5 (No AI Verdict):** LLMs are completely excluded from verdict decision logic; verdicts are strictly governed by deterministic network and backend state oracles. *(Enforced in `src/classify/verdict.ts`)*
- **G6 (Ambiguity to Human Review):** When multiple candidates are within the matching similarity margin, the test halts with `NEEDS_REVIEW` and routes the choice to human review. *(Enforced in `src/match/matcher.ts` and `src/pipeline/run.ts`)*
- **G7 (Known-Good & Append-Only Audit):** Append-only database triggers prohibit updating or deleting audit logs and validation history; rollback restores prior verified plans. *(Enforced in `src/db/migrations/001_init.sql` and `src/governance/approvals.ts`)*

---

## KaizenAI MCP Server (Milestone 1)

KaizenAI exposes a Model Context Protocol (MCP) server so that AI coding agents—including **Google Antigravity**, **Claude Code**, and **OpenAI Codex**—can connect to KaizenAI and utilize its website monitoring, regression detection, and self-healing test governance directly from their development environments.

### What It Does

In Milestone 1, the MCP server provides a read-only bridge to the HealTest database:
- **Server Name:** `kaizenai`
- **Transport:** Standard input/output (`StdioServerTransport`)
- **Protocol:** Official `@modelcontextprotocol/sdk` (2024-11-05 spec)
- **Tool `list_monitored_sites`:** Discovers websites registered and governed by KaizenAI, returning site IDs, names, base URLs, and allowlists with full credential sanitization (passwords, tokens, and query secrets are automatically stripped/redacted).
- **Diagnostics:** Reserved stdout for MCP JSON-RPC protocol framing; all human-readable diagnostic messages are directed to stderr.
- **Audit Compliance:** Read operations record audit log entries (`site.list`) in compliance with HealTest's append-only governance triggers.

### Prerequisites

- Node.js v20+
- Dependencies installed: `npm ci`
- Project compiled: `npm run build`

### Build and Run

To compile and launch the MCP server locally:

```bash
# 1. Build the TypeScript codebase
npm run build

# 2. Run the MCP server
npm run mcp
```

Or invoke the compiled binary directly with Node:

```bash
node dist/mcp/server.js
```

### Database Path Configuration

The MCP server ensures AI clients launching the server from outside the repository root still connect to the intended HealTest database, preventing accidental creation of orphaned empty databases.

Path resolution precedence:
1. **Command line argument:** `node dist/mcp/server.js --db <path-to-db>`
2. **Environment variable:** `HEALTEST_DB_PATH=/path/to/healtest.sqlite`
3. **Home directory override:** `HEALTEST_HOME=/path/to/data-dir` (uses `healtest.sqlite` inside)
4. **Repository default:** `.healtest/healtest.sqlite` anchored directly to the KaizenAI installation root.

> **Safety Guarantee:** If the database does not exist or has not been initialized yet, the MCP server completes the protocol handshake and safely returns an informative error upon tool execution without silently creating or migrating an uninitialized database.

### Configuring in AI Coding Assistants

#### Google Antigravity

Add the following to your Antigravity MCP configuration (e.g. in your Antigravity project or workspace configuration):

```json
{
  "mcpServers": {
    "kaizenai": {
      "command": "node",
      "args": [
        "c:/Users/Piyush--23/Downloads/kaizen Ai/dist/mcp/server.js"
      ],
      "env": {
        "HEALTEST_DB_PATH": "c:/Users/Piyush--23/Downloads/kaizen Ai/.healtest/healtest.sqlite"
      }
    }
  }
}
```

*(On macOS/Linux, adjust the absolute path to `<path-to-kaizen-ai>/dist/mcp/server.js`.)*

#### Claude Code

In Claude Code / Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "kaizenai": {
      "command": "node",
      "args": [
        "c:/Users/Piyush--23/Downloads/kaizen Ai/dist/mcp/server.js"
      ],
      "env": {
        "HEALTEST_DB_PATH": "c:/Users/Piyush--23/Downloads/kaizen Ai/.healtest/healtest.sqlite"
      }
    }
  }
}
```

#### OpenAI Codex & Other MCP Clients

Configure as a local stdio MCP server pointing to the `node` executable, passing the absolute path to `dist/mcp/server.js` and setting `HEALTEST_DB_PATH` to your intended database.

### Testing Handshake & Tools

Run the dedicated test suites:

```bash
# Unit tests (in-memory protocol handshake, tool advertisement, error safety, sanitization)
npx vitest run tests/unit/mcp.test.ts

# Integration tests (stdio process spawning, client transport, CLI --db, HEALTEST_DB_PATH)
npx vitest run tests/integration/mcp.test.ts
```

---

## Limitations

1. **Milestone 1 Scope (Read-Only):** The MCP server currently implements Milestone 1 (`list_monitored_sites`). Mutation operations, repairs, scans, approvals, and shell operations are intentionally disabled until subsequent milestones.
2. **Heuristic Lexicon Domain:** The built-in semantic lexicon and field matching are optimized for e-commerce checkout and lead form workflows. Custom domains require registering vocabulary terms in `src/planner/lexicon.ts`.
3. **Browser Engine:** Playwright browser automation is configured specifically for Chromium; other rendering engines (Firefox, WebKit) are not targeted in the current build.
4. **Optional LLM Fallback:** The primary self-healing engine is fully deterministic and heuristic-first. LLM integration (`@google/genai` Gemini 2.5 Flash) serves strictly as an optional fallback when heuristics find zero candidate matches.

