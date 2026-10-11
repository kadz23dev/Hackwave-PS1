/**
 * LANDING PAGE INTERACTION SCRIPT
 * Simulator Engine, ROI Calculator, and Interactive Widgets
 */

document.addEventListener('DOMContentLoaded', () => {
  initScenarioSimulator();
  initRoiCalculator();
  initFaqAccordion();
});

// Scenario Simulator Data
const SCENARIOS = {
  a: {
    title: 'Scenario A: Harmless Redesign (v1 → v2)',
    badge: 'HEALED_PASS',
    badgeClass: 'badge-healed',
    classification: 'HARMLESS_UI (Confidence: 0.88)',
    desc: 'The e-commerce team renamed "Add to cart" to "Add to bag", removed CSS ID #add-GZ-MINI, and moved the cart link. Naive tests fail with selector not found. KaizenAI matches the replacement via weighted fuzzy heuristics (Levenshtein + TokenSet + NearText context), executes strict validation replay in a fresh context, verifies the order in the backend database, and produces HEALED_PASS with 0 LLM calls.',
    oldSelector: '#add-GZ-MINI ("Add to cart")',
    newSelector: 'button[data-action="add"] ("Add to bag")',
    simScore: '0.88 (Single Match)',
    llmCalls: '0 (Deterministic Heuristics)',
    oracles: [
      { id: 'order-created', name: 'GET /__state (order.status == "PAID", sku == "GZ-MINI")', ok: true },
      { id: 'no-server-errors', name: 'Network log intercept: 0 HTTP 5xx responses', ok: true },
      { id: 'order-api-ok', name: 'POST /api/orders returned HTTP 201', ok: true },
      { id: 'confirmation-shown', name: 'DOM Text: "Order confirmed" (Supporting evidence only)', ok: true }
    ],
    logs: [
      { tag: 'tag-intent', text: 'checkout-valid-card sha=3f2a9b... target=http://127.0.0.1:4102' },
      { tag: 'tag-plan', text: 'reuse: none · known-good plan #1 (7 steps, baseline)' },
      { tag: 'tag-replay', text: 's1 click "Add to cart" ... FAIL (selector #add-GZ-MINI not found)' },
      { tag: 'tag-detect', text: 'chg_0003 ELEMENT_RENAMED HIGH — name "Add to cart"→"Add to bag", id removed' },
      { tag: 'tag-repair', text: 's1 → e4 button "Add to bag" score 0.88 (single replacement found)' },
      { tag: 'tag-validate', text: 'run #7 fresh context · order-created ✓ · no-server-errors ✓ · order-api-ok ✓' },
      { tag: 'tag-verdict', text: 'HEALED_PASS (HARMLESS_UI) · repair rep_0002 validated · auto-applied by policy' }
    ]
  },
  b: {
    title: 'Scenario B: Silent Application Bug Trap (v2-bug)',
    badge: 'APP_BUG',
    badgeClass: 'badge-bug',
    classification: 'APP_BUG (Payment Gateway 500 Failure)',
    desc: 'The payment gateway threw a 500 error, yet broken front-end JS navigated to /confirmation anyway and displayed "Order confirmed". Naive AI testers see the text, declare success, and heal over a catastrophic bug! KaizenAI checks the backend database, sees NO order created, catches the 500 API status, rejects the bogus repair, and fires an APP_BUG alert.',
    oldSelector: 'checkout form submit',
    newSelector: 'payment gateway returned 500 (No order record)',
    simScore: 'REPAIR REJECTED',
    llmCalls: '0',
    oracles: [
      { id: 'order-created', name: 'GET /__state: Expected 1 PAID order, Found 0', ok: false },
      { id: 'no-server-errors', name: 'HTTP 500 timeout intercepted on /api/orders', ok: false },
      { id: 'order-api-ok', name: 'POST /api/orders returned HTTP 500 (Expected 201)', ok: false },
      { id: 'confirmation-shown', name: 'DOM Text: "Order confirmed" (TRAP: Ignored per G5 rule)', ok: true }
    ],
    logs: [
      { tag: 'tag-intent', text: 'checkout-valid-card sha=3f2a9b... target=http://127.0.0.1:4103' },
      { tag: 'tag-replay', text: 's6 submit payment ... completed UI interaction' },
      { tag: 'tag-detect', text: 'UI navigated to /confirmation (DOM says "Order confirmed")' },
      { tag: 'tag-validate', text: 'oracle order-created: FAILED (orders in DB = 0)' },
      { tag: 'tag-detect', text: 'network intercept: POST /api/orders returned status 500' },
      { tag: 'tag-verdict', text: 'APP_BUG · exit code 10 · The UI completed, but backend failed. Repair rejected.' }
    ]
  },
  c: {
    title: 'Scenario C: Ambiguous Multi-Candidate (v2-ambiguous)',
    badge: 'NEEDS_REVIEW',
    badgeClass: 'badge-review',
    classification: 'AMBIGUOUS (Two Adjacent Submit Candidates)',
    desc: 'The redesign placed two identical buttons on the checkout page: "Pay" (score 0.76) and "Complete order" (score 0.74). The score margin (0.02) is below policy threshold (0.10). Rather than hallucinating or guessing, KaizenAI halts, routes to human reviewer in Company Dashboard, and awaits single-click choice.',
    oldSelector: 'button#pay-button ("Pay now")',
    newSelector: 'Candidate 1: "Pay" (0.76) vs Candidate 2: "Complete order" (0.74)',
    simScore: 'Score diff 0.02 < Margin 0.10',
    llmCalls: '0',
    oracles: [
      { id: 'candidate-eval', name: 'G6 Guardrail: Ambiguity detected; guessing forbidden', ok: false },
      { id: 'governance-gate', name: 'Repair rep_0004 routed to Company Approval Queue', ok: true },
      { id: 'backend-ready', name: 'Oracles pending human candidate resolution', ok: true }
    ],
    logs: [
      { tag: 'tag-intent', text: 'checkout-valid-card sha=3f2a9b... target=http://127.0.0.1:4104' },
      { tag: 'tag-detect', text: 'Step s5: 2 equally plausible replacements found within margin 0.10' },
      { tag: 'tag-repair', text: 'Candidate e11: "Pay" (score 0.76) | Candidate e12: "Complete order" (0.74)' },
      { tag: 'tag-verdict', text: 'NEEDS_REVIEW · exit code 11 · Stored to company pending queue. Awaiting human resolution.' }
    ]
  }
};

function initScenarioSimulator() {
  const tabs = document.querySelectorAll('.scenario-tab');
  const titleEl = document.getElementById('sim-title');
  const badgeEl = document.getElementById('sim-badge');
  const descEl = document.getElementById('sim-desc');
  const oldEl = document.getElementById('sim-old-sel');
  const newEl = document.getElementById('sim-new-sel');
  const scoreEl = document.getElementById('sim-score');
  const llmEl = document.getElementById('sim-llm');
  const oracleContainer = document.getElementById('sim-oracles');
  const terminalBody = document.getElementById('sim-terminal-body');

  if (!tabs.length || !titleEl) return;

  function renderScenario(key) {
    const data = SCENARIOS[key];
    if (!data) return;

    tabs.forEach(t => t.classList.toggle('active', t.dataset.scenario === key));

    titleEl.textContent = data.title;
    badgeEl.textContent = data.badge;
    badgeEl.className = `badge ${data.badgeClass}`;
    descEl.textContent = data.desc;
    oldEl.textContent = data.oldSelector;
    newEl.textContent = data.newSelector;
    scoreEl.textContent = data.simScore;
    llmEl.textContent = data.llmCalls;

    // Render Oracles
    oracleContainer.innerHTML = '';
    data.oracles.forEach(o => {
      const li = document.createElement('li');
      li.className = `oracle-item ${o.ok ? 'ok' : 'fail'}`;
      li.innerHTML = `
        <span style="font-weight: 900; font-size: 1rem; color: ${o.ok ? '#047857' : '#dc2626'};">${o.ok ? '✓' : '✗'}</span>
        <div>
          <span style="font-weight: 850; color: #0c0a09;">${o.id}</span> — 
          <span style="color: #0c0a09; font-weight: 650;">${o.name}</span>
        </div>
      `;
      oracleContainer.appendChild(li);
    });

    // Render Terminal Logs
    terminalBody.innerHTML = '';
    data.logs.forEach(log => {
      const div = document.createElement('div');
      div.className = 'terminal-line';
      const tagText = log.tag.replace('tag-', '[').toUpperCase() + ']';
      div.innerHTML = `
        <span class="terminal-tag ${log.tag}">${tagText}</span>
        <span>${log.text}</span>
      `;
      terminalBody.appendChild(div);
    });
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      renderScenario(tab.dataset.scenario);
      window.showMorphismToast('Scenario Switched', `Simulating ${tab.textContent.trim()}`, 'info');
    });
  });

  // Initial render
  renderScenario('a');
}

// Interactive ROI Calculator
function initRoiCalculator() {
  const engineersInput = document.getElementById('calc-engineers');
  const prsInput = document.getElementById('calc-prs');
  const hoursSavedEl = document.getElementById('calc-hours-saved');
  const dollarsSavedEl = document.getElementById('calc-dollars-saved');
  const cycleTimeEl = document.getElementById('calc-cycle-time');

  const engValDisplay = document.getElementById('val-engineers');
  const prValDisplay = document.getElementById('val-prs');

  if (!engineersInput || !prsInput) return;

  function recalculate() {
    const engineers = parseInt(engineersInput.value, 10);
    const prsPerWeek = parseInt(prsInput.value, 10);

    engValDisplay.textContent = engineers;
    prValDisplay.textContent = prsPerWeek;

    // Assumption: ~3.5 hours per engineer per week wasted on broken selectors / test triage
    const hoursPerMonth = Math.round(engineers * 14 + (prsPerWeek * 1.8));
    // Blended tech rate: ₹7,000/hr ($85/hr equivalent)
    const annualSavings = Math.round(hoursPerMonth * 7000 * 12);
    // Cycle time reduction
    const cycleReduction = Math.min(84, Math.round(25 + (prsPerWeek * 0.8)));

    hoursSavedEl.textContent = `${hoursPerMonth.toLocaleString('en-IN')} hrs`;
    dollarsSavedEl.textContent = `₹${annualSavings.toLocaleString('en-IN')} / yr Saved`;
    cycleTimeEl.textContent = `-${cycleReduction}% PR Wait Time`;
  }

  engineersInput.addEventListener('input', recalculate);
  prsInput.addEventListener('input', recalculate);

  recalculate();
}

// FAQ Accordion
function initFaqAccordion() {
  const items = document.querySelectorAll('.faq-item');
  items.forEach(item => {
    const question = item.querySelector('.faq-question');
    question.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      items.forEach(i => i.classList.remove('active'));
      if (!isActive) item.classList.add('active');
    });
  });
}
