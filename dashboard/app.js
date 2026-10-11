import {
  showToast,
  updateHeader,
  renderSimulationStudio,
  renderJapaneseDashboard,
  renderTestRunsView,
  renderJapaneseChanges,
  renderAIAgentView,
  renderComparisonView,
  renderRepairWorkflowView,
  renderReportsView,
  renderAnalyticsView,
  renderStorageView,
} from './screens.js';

export {
  showToast,
  updateHeader,
  renderSimulationStudio,
  renderJapaneseDashboard,
  renderTestRunsView,
  renderJapaneseChanges,
  renderAIAgentView,
  renderComparisonView,
  renderRepairWorkflowView,
  renderReportsView,
  renderAnalyticsView,
  renderStorageView,
};

export function el(tag, attrs = {}, ...children) {
  const elem = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === 'class' || k === 'className') {
      elem.setAttribute('class', String(v));
    } else if (k === 'hidden') {
      if (v) elem.setAttribute('hidden', '');
    } else {
      elem.setAttribute(k, String(v));
    }
  }

  function appendChildNode(child) {
    if (child === null || child === undefined) return;
    if (Array.isArray(child)) {
      for (const c of child) appendChildNode(c);
    } else if (typeof child === 'string' || typeof child === 'number') {
      elem.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof Node) {
      elem.appendChild(child);
    }
  }

  for (const child of children) {
    appendChildNode(child);
  }

  return elem;
}

let csrf = null;

export async function api(path, opts = {}) {
  if (!csrf) {
    try {
      const sessionRes = await fetch('/api/session');
      if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        csrf = sessionData.csrf;
      }
    } catch {
      // Ignore initial session fetch failure
    }
  }

  const fetchOpts = { ...opts };
  const headers = { ...(opts.headers || {}) };
  if (opts.method === 'POST') {
    headers['content-type'] = 'application/json';
    if (csrf) {
      headers['x-csrf-token'] = csrf;
    }
  }
  fetchOpts.headers = headers;

  const res = await fetch(path, fetchOpts);
  if (!res.ok) {
    let msg = `API request failed with status ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) {
        msg = errJson.error.message;
      }
    } catch {
      // Fallback message
    }
    throw new Error(msg);
  }
  return await res.json();
}

export const BADGE = {
  PASS: ['✓', 'PASS', 'badge--pass'],
  HEALED_PASS: ['✓↻', 'HEALED', 'badge--pass badge--healed'],
  APP_BUG: ['✕', 'APP BUG', 'badge--bug'],
  NEEDS_REVIEW: ['?', 'REVIEW', 'badge--review'],
  FAIL_UNREPAIRABLE: ['—', 'UNREPAIRABLE', 'badge--unrep'],
  PROPOSED: ['◆', 'PROPOSED', 'badge--proposed'],
};

export function badge(v) {
  const def = BADGE[v] || ['•', v || 'UNKNOWN', 'badge--proposed'];
  const [icon, label, cls] = def;
  const iconSpan = el('span', { class: 'badge__icon', 'aria-hidden': 'true' }, icon);
  const labelSpan = el('span', { class: 'badge__label' }, label);
  return el('span', { class: `badge ${cls}` }, iconSpan, labelSpan);
}

export function severityBadge(sev) {
  let cls = 'badge--proposed';
  let icon = '•';
  if (sev === 'HIGH') {
    cls = 'badge--review';
    icon = '▲';
  } else if (sev === 'CRITICAL') {
    cls = 'badge--bug';
    icon = '✕';
  }
  const iconSpan = el('span', { class: 'badge__icon', 'aria-hidden': 'true' }, icon);
  const labelSpan = el('span', { class: 'badge__label' }, sev || 'UNKNOWN');
  return el('span', { class: `badge ${cls} severity-${String(sev || '').toLowerCase()}` }, iconSpan, labelSpan);
}

const views = [
  { id: 'view-simulation', regex: /^#(?:simulation|\/simulation)$/ },
  { id: 'view-dashboard', regex: /^#(?:dashboard|\/dashboard)$/ },
  { id: 'view-test-runs', regex: /^#(?:test-runs|\/test-runs)$/ },
  { id: 'view-changes', regex: /^#\/changes$/ },
  { id: 'view-change', regex: /^#\/changes\/(\d+)$/ },
  { id: 'view-repair', regex: /^#\/repairs\/(\d+)$/ },
  { id: 'view-ai-agent', regex: /^#(?:ai-agent|\/ai-agent)$/ },
  { id: 'view-comparison', regex: /^#(?:comparison|\/comparison)$/ },
  { id: 'view-repair-workflow', regex: /^#(?:repairs|\/repairs|\/repair-workflow)$/ },
  { id: 'view-reports', regex: /^#(?:reports|\/reports)$/ },
  { id: 'view-analytics', regex: /^#(?:analytics|\/analytics)$/ },
  { id: 'view-storage', regex: /^#(?:storage|\/storage)$/ },
  { id: 'view-overview', regex: /^(?:#\/?|#\/overview)?$/ },
  { id: 'view-audit', regex: /^#\/audit$/ },
  { id: 'view-settings', regex: /^#\/settings$/ },
  { id: 'view-billing', regex: /^#\/billing$/ },
  { id: 'view-auth', regex: /^#(?:login|signup)$/ },
];

export function route() {
  const hash = window.location.hash || '#/';
  let matchedView = null;
  let params = [];

  for (const v of views) {
    const m = hash.match(v.regex);
    if (m) {
      matchedView = v.id;
      params = m.slice(1);
      break;
    }
  }

  if (!matchedView) {
    matchedView = 'view-overview';
  }

  // Update active state on nav links
  try {
    const navLinks = document.querySelectorAll('.nav-link');
    for (const link of navLinks) {
      const href = link.getAttribute('href');
      if (href === hash || (hash === '#/' && href === '#/')) {
        link.classList.add('active');
      } else if (href && href !== '#/' && hash.startsWith(href)) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    }
  } catch {
    // Ignore DOM query issues
  }

  for (const v of views) {
    const sec = document.getElementById(v.id);
    if (sec) {
      if (v.id === matchedView) {
        sec.removeAttribute('hidden');
      } else {
        sec.setAttribute('hidden', '');
      }
    }
  }

  if (matchedView === 'view-simulation') {
    renderSimulationStudio();
  } else if (matchedView === 'view-dashboard') {
    renderJapaneseDashboard();
  } else if (matchedView === 'view-test-runs') {
    renderTestRunsView();
  } else if (matchedView === 'view-changes') {
    renderChanges();
  } else if (matchedView === 'view-change') {
    renderChange(params[0]);
  } else if (matchedView === 'view-repair') {
    renderRepair(params[0]);
  } else if (matchedView === 'view-ai-agent') {
    renderAIAgentView();
  } else if (matchedView === 'view-comparison') {
    renderComparisonView();
  } else if (matchedView === 'view-repair-workflow') {
    renderRepairWorkflowView();
  } else if (matchedView === 'view-reports') {
    renderReportsView();
  } else if (matchedView === 'view-analytics') {
    renderAnalyticsView();
  } else if (matchedView === 'view-storage') {
    renderStorageView();
  } else if (matchedView === 'view-overview') {
    renderOverview();
  } else if (matchedView === 'view-audit') {
    renderAudit();
  } else if (matchedView === 'view-settings') {
    renderSettings();
  } else if (matchedView === 'view-billing') {
    renderBilling();
  } else if (matchedView === 'view-auth') {
    renderAuth(hash === '#signup' ? 'signup' : 'login');
  }
}

export async function renderChanges() {
  const container = document.getElementById('view-changes');
  if (!container) return;
  container.textContent = '';

  const header = el('h2', {}, 'Changes Timeline');
  container.appendChild(header);

  const layout = el('div', { class: 'changes-layout' });

  // 1. Left Rail (filters)
  const rail = el('div', { class: 'rail card' });
  rail.appendChild(el('h3', {}, 'Filters'));

  const severityGroup = el('div', { class: 'filter-group' });
  severityGroup.appendChild(el('label', { class: 'filter-label' }, 'Severity'));

  const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const checkboxes = [];

  for (const sev of severities) {
    const cb = el('input', { type: 'checkbox', name: 'severity', value: sev, checked: true });
    checkboxes.push(cb);
    const cbLabel = el('label', { class: 'checkbox-label' }, cb, ' ' + sev);
    severityGroup.appendChild(cbLabel);
  }
  rail.appendChild(severityGroup);

  const classGroup = el('div', { class: 'filter-group' });
  classGroup.appendChild(el('label', { class: 'filter-label', for: 'classification-select' }, 'Classification'));

  const classSelect = el(
    'select',
    { id: 'classification-select', class: 'select-input' },
    el('option', { value: 'All' }, 'All'),
    el('option', { value: 'HARMLESS_UI' }, 'HARMLESS_UI'),
    el('option', { value: 'BREAKING_UI' }, 'BREAKING_UI'),
    el('option', { value: 'APP_BUG' }, 'APP_BUG'),
    el('option', { value: 'AMBIGUOUS' }, 'AMBIGUOUS')
  );
  classGroup.appendChild(classSelect);
  rail.appendChild(classGroup);

  layout.appendChild(rail);

  // 2. Right List (timeline)
  const listContainer = el('div', { class: 'list' });
  layout.appendChild(listContainer);
  container.appendChild(layout);

  async function fetchAndRenderList() {
    listContainer.textContent = '';
    const selectedSeverities = checkboxes.filter((c) => c.checked).map((c) => c.value);
    const selectedClass = classSelect.value;

    if (selectedSeverities.length === 0) {
      listContainer.appendChild(el('p', { class: 'empty-state' }, 'No severity selected.'));
      return;
    }

    try {
      const q = new URLSearchParams();
      q.set('severity', selectedSeverities.join(','));
      if (selectedClass && selectedClass !== 'All') {
        q.set('classification', selectedClass);
      }

      const changes = await api(`/api/changes?${q.toString()}`);

      if (!Array.isArray(changes) || changes.length === 0) {
        listContainer.appendChild(el('p', { class: 'empty-state' }, 'No changes match the filters.'));
        return;
      }

      for (const c of changes) {
        const rowCard = el('div', {
          class: 'change-card card',
          'data-id': String(c.id),
          'data-severity': c.severity,
        });

        const headerLine = el('div', { class: 'change-card-header' });
        const idLink = el('a', { href: `#/changes/${c.id}`, class: 'change-id mono' }, c.displayId || `chg_${c.id}`);
        const kindTag = el('span', { class: 'change-kind mono' }, c.kind);
        const sevBadge = severityBadge(c.severity);
        const classTag = el('span', { class: 'badge badge--proposed' }, c.classification);
        const timeText = el('span', { class: 'change-time' }, c.createdAt ? new Date(c.createdAt).toLocaleString() : '');

        headerLine.appendChild(idLink);
        headerLine.appendChild(kindTag);
        headerLine.appendChild(sevBadge);
        headerLine.appendChild(classTag);
        headerLine.appendChild(timeText);
        rowCard.appendChild(headerLine);

        const exp = c.explanation || '';
        const shortExp = exp.length > 120 ? exp.slice(0, 120) + '…' : exp;
        rowCard.appendChild(el('p', { class: 'change-explanation' }, shortExp));

        listContainer.appendChild(rowCard);
      }
    } catch (err) {
      listContainer.appendChild(el('p', { class: 'error-msg' }, `Failed to load changes: ${err.message}`));
    }
  }

  for (const cb of checkboxes) {
    cb.addEventListener('change', fetchAndRenderList);
  }
  classSelect.addEventListener('change', fetchAndRenderList);

  await fetchAndRenderList();
}

export async function renderChange(id) {
  const container = document.getElementById('view-change');
  if (!container) return;
  container.textContent = '';

  try {
    const change = await api(`/api/changes/${id}`);

    // Header: displayId + classification + severity
    const header = el('div', { class: 'change-view-header' });
    const title = el('h2', {}, `Change ${change.displayId || 'chg_' + change.id}`);
    const meta = el(
      'div',
      { class: 'change-view-meta' },
      severityBadge(change.severity),
      el('span', { class: 'badge badge--proposed' }, change.classification),
      el('span', { class: 'mono change-kind' }, change.kind)
    );
    header.appendChild(title);
    header.appendChild(meta);
    container.appendChild(header);

    if (change.explanation) {
      container.appendChild(el('p', { class: 'change-explanation card' }, change.explanation));
    }

    // D2: Before and After Screenshots
    const screenshotsDiv = el('div', { class: 'screenshots-container' });

    const handleImgError = (imgEl, figEl) => {
      const p = el('p', { class: 'no-screenshot empty-state' }, 'No screenshot');
      if (figEl.contains(imgEl)) {
        figEl.replaceChild(p, imgEl);
      }
    };

    // Before figure
    const beforeFig = el('figure', { class: 'screenshot-figure' });
    beforeFig.appendChild(el('figcaption', {}, `Before: Snapshot #${change.baseSnapshotId}`));
    if (change.baseSnapshotId) {
      const beforeImg = el('img', {
        src: `/api/snapshots/${change.baseSnapshotId}/screenshot`,
        alt: 'Before',
      });
      beforeImg.onerror = () => handleImgError(beforeImg, beforeFig);
      beforeImg.addEventListener('error', () => handleImgError(beforeImg, beforeFig));
      beforeFig.appendChild(beforeImg);
    } else {
      beforeFig.appendChild(el('p', { class: 'no-screenshot empty-state' }, 'No screenshot'));
    }
    screenshotsDiv.appendChild(beforeFig);

    // After figure
    const afterFig = el('figure', { class: 'screenshot-figure' });
    afterFig.appendChild(el('figcaption', {}, `After: Snapshot #${change.headSnapshotId}`));
    if (change.headSnapshotId) {
      const afterImg = el('img', {
        src: `/api/snapshots/${change.headSnapshotId}/screenshot`,
        alt: 'After',
      });
      afterImg.onerror = () => handleImgError(afterImg, afterFig);
      afterImg.addEventListener('error', () => handleImgError(afterImg, afterFig));
      afterFig.appendChild(afterImg);
    } else {
      afterFig.appendChild(el('p', { class: 'no-screenshot empty-state' }, 'No screenshot'));
    }
    screenshotsDiv.appendChild(afterFig);

    container.appendChild(screenshotsDiv);

    // D3: Side-by-side DOM/selector diff
    const evidenceList = Array.isArray(change.evidence) ? change.evidence : [];

    const diffContainer = el('div', { class: 'diff-container card' });
    diffContainer.appendChild(el('h3', {}, 'DOM / Selector Diff'));

    if (evidenceList.length === 0) {
      diffContainer.appendChild(el('p', { class: 'empty-state' }, 'No evidence items recorded.'));
    } else {
      for (let i = 0; i < evidenceList.length; i++) {
        const item = evidenceList[i];
        const evidenceTitle = el('h4', { class: 'evidence-title' }, item.evidence || `Evidence #${i + 1}`);
        diffContainer.appendChild(evidenceTitle);

        const diffTable = el('table', { class: 'table diff-table' });
        diffTable.appendChild(
          el(
            'thead',
            {},
            el('tr', {}, el('th', {}, 'Field'), el('th', {}, 'Before'), el('th', {}, 'After'))
          )
        );

        const tbody = el('tbody');
        const fields = ['role', 'name', 'selector', 'pagePath', 'attrs'];
        const bObj = item.before || {};
        const aObj = item.after || {};

        for (const field of fields) {
          let bVal = '';
          let aVal = '';

          if (field === 'attrs') {
            bVal = item.before && bObj.attrs ? JSON.stringify(bObj.attrs) : '';
            aVal = item.after && aObj.attrs ? JSON.stringify(aObj.attrs) : '';
          } else {
            bVal = item.before && bObj[field] !== undefined && bObj[field] !== null ? String(bObj[field]) : '';
            aVal = item.after && aObj[field] !== undefined && aObj[field] !== null ? String(aObj[field]) : '';
          }

          const isDiff = bVal !== aVal;
          const tr = el('tr');
          const tdField = el('td', { class: 'mono' }, field);
          const cellClasses = [
            field === 'attrs' ? 'mono' : '',
            isDiff ? 'diff-changed' : '',
          ].filter(Boolean).join(' ');

          const tdBefore = el('td', { class: cellClasses }, bVal);
          const displayAfter = isDiff ? '≠ ' + aVal : aVal;
          const tdAfter = el('td', { class: cellClasses }, displayAfter);

          tr.appendChild(tdField);
          tr.appendChild(tdBefore);
          tr.appendChild(tdAfter);
          tbody.appendChild(tr);
        }

        diffTable.appendChild(tbody);
        diffContainer.appendChild(diffTable);
      }
    }

    container.appendChild(diffContainer);

    // D5 / D6: Repair preview and actions for linked repairs
    const repairPreviewContainer = el('div', { id: 'repair-preview' });
    container.appendChild(repairPreviewContainer);

    if (Array.isArray(change.repairs) && change.repairs.length > 0) {
      for (const rep of change.repairs) {
        try {
          const fullRepair = await api(`/api/repairs/${rep.id}`);
          renderRepairPreview(repairPreviewContainer, fullRepair);
          renderActionsBar(repairPreviewContainer, fullRepair, () => renderChange(id));
        } catch {
          // If full repair fetch fails, continue
        }
      }
    }
  } catch (err) {
    container.appendChild(el('p', { class: 'error-msg' }, `Failed to load change details: ${err.message}`));
  }
}

export function renderLandingHero(container) {
  const landing = el('div', { class: 'landing-container' });

  // 1. Hero
  const hero = el('div', { class: 'landing-hero' });
  hero.appendChild(el('div', { class: 'hero-pill' }, '⚡ Kaizen AI — Intent-Aware E2E Testing Platform'));
  hero.appendChild(el('h1', { class: 'hero-title' }, 'Tests that heal. Confidence that stays.'));
  hero.appendChild(
    el(
      'p',
      { class: 'hero-subtitle' },
      'Author high-level user intents in natural language. When UI drift or frontend redesigns break fragile CSS selectors, Kaizen AI automatically synthesizes and validates robust repairs against backend oracles with zero flaky assertions.'
    )
  );

  const heroActions = el('div', { class: 'hero-actions' });
  const openStudioBtn = el('a', { href: '#/dashboard', class: 'btn btn--primary' }, 'Open Dashboard →');
  const watchDemoBtn = el('button', { class: 'btn btn--outline', type: 'button' }, '▶ Watch Demo');
  watchDemoBtn.addEventListener('click', () => {
    const dlg = document.getElementById('demo-video-dialog');
    if (dlg) dlg.showModal();
  });
  heroActions.appendChild(openStudioBtn);
  heroActions.appendChild(watchDemoBtn);
  hero.appendChild(heroActions);

  // Large Product Dashboard Mockup Preview
  const mockupFrame = el('div', { class: 'hero-mockup-frame' });
  const mockupBar = el('div', { class: 'mockup-window-bar' });
  const mockupDots = el(
    'div',
    { class: 'mockup-dots' },
    el('span', { class: 'mockup-dot' }),
    el('span', { class: 'mockup-dot' }),
    el('span', { class: 'mockup-dot' })
  );
  const mockupUrl = el('span', { class: 'mockup-url mono' }, 'kaizen.ai/#/dashboard');
  mockupBar.appendChild(mockupDots);
  mockupBar.appendChild(mockupUrl);
  mockupFrame.appendChild(mockupBar);

  const mockupContent = el('div', { class: 'mockup-preview-content' });
  const mockupGrid = el('div', { class: 'mockup-preview-grid' });

  // Left Col (AI Agent)
  const colA = el('div', { class: 'mockup-col' });
  colA.appendChild(el('span', { class: 'mockup-col-header' }, 'AI Agent · Active'));
  colA.appendChild(el('span', { class: 'mockup-skeleton-pill' }, 'Intent: Complete checkout'));
  colA.appendChild(el('div', { class: 'mockup-skeleton-line' }));
  colA.appendChild(el('div', { class: 'mockup-skeleton-line' }));
  mockupGrid.appendChild(colA);

  // Center Col (Playwright Overview)
  const colB = el('div', { class: 'mockup-col' });
  colB.appendChild(el('span', { class: 'mockup-col-header' }, 'Playwright Real-Time · Step 4/6'));
  colB.appendChild(el('div', { class: 'mockup-skeleton-line' }));
  colB.appendChild(el('span', { class: 'mockup-skeleton-pill' }, 'Healed: #add-to-bag ✓'));
  colB.appendChild(el('div', { class: 'mockup-skeleton-line' }));
  mockupGrid.appendChild(colB);

  // Right Col (Notes)
  const colC = el('div', { class: 'mockup-col' });
  colC.appendChild(el('span', { class: 'mockup-col-header' }, 'Session Notes (3)'));
  colC.appendChild(el('div', { class: 'mockup-skeleton-line' }));
  colC.appendChild(el('div', { class: 'mockup-skeleton-line' }));
  mockupGrid.appendChild(colC);

  mockupContent.appendChild(mockupGrid);
  mockupFrame.appendChild(mockupContent);
  hero.appendChild(mockupFrame);
  landing.appendChild(hero);

  // 2. Demo Video Section
  const videoSection = el('section', { class: 'video-section' });
  videoSection.appendChild(el('div', { class: 'section-tag' }, 'Interactive Simulation'));
  videoSection.appendChild(el('h2', { class: 'section-title' }, 'Watch Kaizen AI in Action'));
  videoSection.appendChild(
    el(
      'p',
      { class: 'section-desc' },
      'Observe how Kaizen AI encounters a button ID redesign on shop-v2, identifies candidate alternatives, and verifies backend order creation before greenlighting the test.'
    )
  );

  const videoCard = el('div', { class: 'video-player-frame' });
  const topBar = el(
    'div',
    { class: 'player-top-bar' },
    el('span', { class: 'player-dot red' }),
    el('span', { class: 'player-dot yellow' }),
    el('span', { class: 'player-dot green' }),
    el('span', { class: 'player-title mono' }, 'kaizen-ai-act2-drift-recovery.mp4')
  );
  videoCard.appendChild(topBar);

  const vViewport = el('div', { class: 'player-viewport' });
  vViewport.appendChild(el('div', { class: 'sim-step-badge mono' }, 'ACT 2 · Version B: Redesign Detected'));

  const browserMock = el('div', { class: 'sim-browser-mockup' });
  browserMock.appendChild(el('div', { class: 'sim-browser-bar mono' }, 'http://127.0.0.1:4102/cart.html'));
  const pageContent = el('div', { class: 'sim-page-content' });
  pageContent.appendChild(el('h4', {}, 'Shopping Bag'));
  pageContent.appendChild(el('p', { class: 'sim-item' }, 'Gizmo Mini — $19.99 (Qty 1)'));

  const actionHigh = el('div', { class: 'sim-action-highlight' });
  actionHigh.appendChild(el('button', { class: 'btn btn--primary btn--sm' }, 'Add to bag'));
  actionHigh.appendChild(el('span', { class: 'sim-tag mono' }, 'Healed: #add-to-bag (Score 0.74)'));
  pageContent.appendChild(actionHigh);
  browserMock.appendChild(pageContent);
  vViewport.appendChild(browserMock);

  vViewport.appendChild(
    el(
      'div',
      { class: 'sim-oracle-toast mono' },
      'Backend Oracle: order-created ✓ | POST /api/orders 200 ✓ | HEALED_PASS'
    )
  );
  videoCard.appendChild(vViewport);

  const controls = el('div', { class: 'player-controls' });
  const playBtn = el('button', { class: 'btn btn--sm btn--primary', type: 'button' }, '▶ Play Demo');
  playBtn.addEventListener('click', () => {
    const dlg = document.getElementById('demo-video-dialog');
    if (dlg) dlg.showModal();
  });
  controls.appendChild(playBtn);
  const scrubber = el('div', { class: 'player-scrubber' }, el('div', { class: 'scrubber-fill' }));
  controls.appendChild(scrubber);
  controls.appendChild(el('span', { class: 'player-time mono' }, '00:14 / 00:42'));
  videoCard.appendChild(controls);
  videoSection.appendChild(videoCard);
  landing.appendChild(videoSection);

  // 3. Features Section
  const featSection = el('section', { class: 'features-section' });
  featSection.appendChild(el('div', { class: 'section-tag' }, 'Core Capabilities'));
  featSection.appendChild(el('h2', { class: 'section-title' }, 'Engineered for Resilience, Built for Confidence'));
  featSection.appendChild(
    el(
      'p',
      { class: 'section-desc' },
      'Traditional E2E tests break whenever frontend code changes. Kaizen AI bridges user intent and execution reality.'
    )
  );

  const featGrid = el('div', { class: 'features-grid' });
  const features = [
    {
      icon: '🎯',
      title: 'Intent-Based Testing',
      desc: 'Declare tests through high-level user intents rather than brittle DOM paths. Tests remain valid even across major frontend framework migrations.'
    },
    {
      icon: '⚡',
      title: 'Automatic UI-Drift Recovery',
      desc: 'When UI structures shift, Kaizen AI inspects surrounding semantics, computes candidate match scores, and synthesizes localized selector repairs.'
    },
    {
      icon: '🛡️',
      title: 'Deterministic Verification',
      desc: 'Never rely on hallucinated visual assertions. Every candidate repair is strictly verified against real database rows, API responses, and side-effect oracles.'
    },
    {
      icon: '♻️',
      title: 'Reusable Healed Steps',
      desc: 'Approved repairs are stored directly into known-good execution plans. Future CI runs replay at native Playwright speeds with zero LLM API latency.'
    }
  ];

  for (const f of features) {
    const card = el('div', { class: 'feature-card' });
    card.appendChild(el('div', { class: 'feature-icon-wrapper' }, f.icon));
    card.appendChild(el('h3', { class: 'feature-title' }, f.title));
    card.appendChild(el('p', { class: 'feature-desc' }, f.desc));
    featGrid.appendChild(card);
  }
  featSection.appendChild(featGrid);
  landing.appendChild(featSection);

  // 4. How It Works Section
  const howSection = el('section', { class: 'how-it-works-section' });
  howSection.appendChild(el('div', { class: 'section-tag' }, 'Workflow Architecture'));
  howSection.appendChild(el('h2', { class: 'section-title' }, 'How Kaizen AI Works'));
  howSection.appendChild(
    el('p', { class: 'section-desc' }, 'Four disciplined steps from high-level user journey to deterministic CI greenlight.')
  );

  const stepsGrid = el('div', { class: 'workflow-steps' });
  const stepsData = [
    {
      num: 'STEP 01',
      title: 'Express Intent',
      desc: 'Write declarative test intentions in natural language or compact YAML with explicit backend oracle invariants.',
      code: 'intent: checkout-valid-card'
    },
    {
      num: 'STEP 02',
      title: 'Intercept UI Drift',
      desc: 'Playwright executes against Chromium. When an element is missing, execution pauses and captures DOM state and screenshots.',
      code: 'Error: #add-to-cart not found'
    },
    {
      num: 'STEP 03',
      title: 'Synthesize & Validate',
      desc: 'Heuristic engine evaluates candidates, picks the best semantic match, and validates with fresh database state.',
      code: 'Healed: #add-to-bag (Score 0.74)'
    },
    {
      num: 'STEP 04',
      title: 'Promote & Replay',
      desc: 'Governance audits the change. Once promoted, subsequent test executions replay instantly with 0 LLM token cost.',
      code: 'Verdict: HEALED_PASS (0 LLM)'
    }
  ];

  for (const s of stepsData) {
    const sc = el('div', { class: 'step-card' });
    sc.appendChild(el('span', { class: 'step-num' }, s.num));
    sc.appendChild(el('h4', {}, s.title));
    sc.appendChild(el('p', {}, s.desc));
    sc.appendChild(el('code', { class: 'step-code mono' }, s.code));
    stepsGrid.appendChild(sc);
  }
  howSection.appendChild(stepsGrid);
  landing.appendChild(howSection);

  // 5. Pricing Preview
  const pricingSection = el('section', { class: 'pricing-preview-section' });
  pricingSection.appendChild(el('div', { class: 'section-tag' }, 'Transparent Plans'));
  pricingSection.appendChild(el('h2', { class: 'section-title' }, 'Simple, Predictable Plans'));
  pricingSection.appendChild(
    el('p', { class: 'section-desc' }, 'Get started with core self-healing for free, or upgrade to Pro for automated code-change assistance.')
  );

  const priceRow = el('div', { class: 'pricing-preview-row' });
  // Free Mini Card
  const freeCard = el('div', { class: 'pricing-mini-card' });
  freeCard.appendChild(el('h4', {}, 'Free Plan'));
  freeCard.appendChild(el('div', { class: 'pricing-price' }, 'Free'));
  const freeList = el(
    'ul',
    { class: 'pricing-mini-list' },
    el('li', {}, 'AI Agent natural language intent'),
    el('li', {}, 'Playwright integration & Chromium execution'),
    el('li', {}, 'Session Notes & scratchpad'),
    el('li', {}, 'Core test execution & self-healing')
  );
  freeCard.appendChild(freeList);
  freeCard.appendChild(el('a', { href: '#/dashboard', class: 'btn btn--outline btn--sm' }, 'Get Started'));
  priceRow.appendChild(freeCard);

  // Pro Mini Card
  const proCard = el('div', { class: 'pricing-mini-card highlight' });
  proCard.appendChild(el('h4', {}, 'Pro Plan'));
  proCard.appendChild(el('div', { class: 'pricing-price' }, 'Contact us'));
  const proList = el(
    'ul',
    { class: 'pricing-mini-list' },
    el('li', {}, 'Everything in Free'),
    el('li', {}, 'Real-time code-change assistance'),
    el('li', {}, 'Automatically apply small code fixes'),
    el('li', {}, 'Developer review routing for risky changes')
  );
  proCard.appendChild(proList);
  proCard.appendChild(el('a', { href: '#/billing', class: 'btn btn--primary btn--sm' }, 'Compare & Upgrade'));
  priceRow.appendChild(proCard);

  pricingSection.appendChild(priceRow);
  landing.appendChild(pricingSection);

  container.appendChild(landing);
}

export async function renderOverview() {
  const container = document.getElementById('view-overview');
  if (!container) return;
  container.textContent = '';

  // Render rich marketing landing sections
  renderLandingHero(container);

  const telemetryHeader = el('h2', { style: 'margin-top: calc(var(--gap) * 4);' }, 'Monitored Sites & Telemetry');
  container.appendChild(telemetryHeader);

  try {
    const [sites, runs] = await Promise.all([
      api('/api/sites'),
      api('/api/runs?limit=10'),
    ]);

    // Sites table
    const sitesCard = el('div', { class: 'card' });
    sitesCard.appendChild(el('h3', {}, 'Monitored Sites'));

    if (!Array.isArray(sites) || sites.length === 0) {
      sitesCard.appendChild(el('p', { class: 'empty-state' }, 'No sites monitored yet.'));
    } else {
      const sitesTable = el('table', { class: 'table sites-table' });
      const thead = el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', {}, 'Name'),
          el('th', {}, 'Base URL'),
          el('th', {}, 'Last Scan'),
          el('th', {}, 'Open Changes'),
          el('th', {}, 'Health')
        )
      );
      const tbody = el('tbody');
      for (const s of sites) {
        tbody.appendChild(
          el(
            'tr',
            {},
            el('td', {}, s.name),
            el('td', { class: 'mono' }, s.baseUrl),
            el('td', {}, s.lastScanAt ? s.lastScanAt : 'Never'),
            el('td', {}, String(s.openChanges ?? 0)),
            el('td', {}, badge(s.health || 'PASS'))
          )
        );
      }
      sitesTable.appendChild(thead);
      sitesTable.appendChild(tbody);
      sitesCard.appendChild(sitesTable);
    }
    container.appendChild(sitesCard);

    // Runs table
    const runsCard = el('div', { class: 'card' });
    runsCard.appendChild(el('h3', {}, 'Recent Runs'));

    if (!Array.isArray(runs) || runs.length === 0) {
      runsCard.appendChild(el('p', { class: 'empty-state' }, 'No recent runs recorded.'));
    } else {
      const runsTable = el('table', { class: 'table runs-table' });
      const thead = el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', {}, 'Run ID'),
          el('th', {}, 'Verdict'),
          el('th', {}, 'Target'),
          el('th', {}, 'LLM Calls'),
          el('th', {}, 'Time')
        )
      );
      const tbody = el('tbody');
      for (const r of runs) {
        tbody.appendChild(
          el(
            'tr',
            {},
            el('td', { class: 'mono' }, `#${r.id}`),
            el('td', {}, badge(r.verdict)),
            el('td', { class: 'mono' }, r.targetOrigin || '—'),
            el('td', {}, String(r.llmCalls ?? 0)),
            el('td', {}, r.startedAt ? r.startedAt : '—')
          )
        );
      }
      runsTable.appendChild(thead);
      runsTable.appendChild(tbody);
      runsCard.appendChild(runsTable);
    }
    container.appendChild(runsCard);
  } catch (err) {
    container.appendChild(el('p', { class: 'error-msg' }, `Failed to load overview: ${err.message}`));
  }
}

export function renderRepairPreview(container, repair) {
  const card = el('div', { class: 'card repair-preview-card' });
  card.appendChild(el('h3', {}, 'Repair Steps Preview'));

  const proposal =
    typeof repair.proposal === 'string'
      ? JSON.parse(repair.proposal)
      : repair.proposal || {};
  const steps = Array.isArray(proposal.steps)
    ? proposal.steps
    : Array.isArray(repair.steps)
    ? repair.steps
    : [];

  if (steps.length === 0) {
    card.appendChild(el('p', { class: 'empty-state' }, 'No repair steps recorded.'));
  } else {
    const table = el('table', { class: 'table repair-steps-table' });
    table.appendChild(
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', {}, 'Step ID'),
          el('th', {}, 'Action'),
          el('th', {}, 'Target'),
          el('th', {}, 'Provenance'),
          el('th', {}, 'Score'),
          el('th', {}, 'Alternatives')
        )
      )
    );

    const tbody = el('tbody');
    for (const step of steps) {
      const tr = el('tr');
      // 1. stepId
      tr.appendChild(el('td', { class: 'mono' }, step.stepId || step.id || '—'));
      // 2. action
      tr.appendChild(el('td', { class: 'mono' }, step.action || '—'));

      // 3. old target (name + selector, .mono) → new target
      const tdTarget = el('td', { class: 'step-target' });
      const oldObj = step.oldTarget || step.before || null;
      const newObj = step.newTarget || step.target || step.after || null;

      const oldName = oldObj?.name || oldObj?.text || '';
      const oldSel = oldObj?.selector || '';
      const newName = newObj?.name || newObj?.text || '';
      const newSel = newObj?.selector || '';

      if (oldObj && newObj && (oldObj !== newObj || oldName !== newName || oldSel !== newSel)) {
        if (oldName) tdTarget.appendChild(document.createTextNode(oldName + ' '));
        if (oldSel) {
          tdTarget.appendChild(document.createTextNode('('));
          tdTarget.appendChild(el('span', { class: 'mono' }, oldSel));
          tdTarget.appendChild(document.createTextNode(')'));
        }
        tdTarget.appendChild(document.createTextNode(' → '));
        if (newName) tdTarget.appendChild(document.createTextNode(newName + ' '));
        if (newSel) {
          tdTarget.appendChild(document.createTextNode('('));
          tdTarget.appendChild(el('span', { class: 'mono' }, newSel));
          tdTarget.appendChild(document.createTextNode(')'));
        }
      } else if (newObj) {
        if (newName) tdTarget.appendChild(document.createTextNode(newName + ' '));
        if (newSel) {
          tdTarget.appendChild(document.createTextNode('('));
          tdTarget.appendChild(el('span', { class: 'mono' }, newSel));
          tdTarget.appendChild(document.createTextNode(')'));
        }
      } else if (oldObj) {
        if (oldName) tdTarget.appendChild(document.createTextNode(oldName + ' '));
        if (oldSel) {
          tdTarget.appendChild(document.createTextNode('('));
          tdTarget.appendChild(el('span', { class: 'mono' }, oldSel));
          tdTarget.appendChild(document.createTextNode(')'));
        }
      } else {
        tdTarget.textContent = '—';
      }
      tr.appendChild(tdTarget);

      // 4. provenance badge (replay/repair-match/repair-replan/llm/human as text)
      const prov = step.provenance || 'replay';
      tr.appendChild(
        el(
          'td',
          {},
          el('span', { class: 'badge badge--proposed provenance-badge' }, prov)
        )
      );

      // 5. score (2 decimals)
      const scoreStr =
        step.score !== undefined && step.score !== null
          ? Number(step.score).toFixed(2)
          : '—';
      tr.appendChild(el('td', { class: 'mono' }, scoreStr));

      // 6. alternatives (name score, …)
      let altsText = '—';
      if (Array.isArray(step.alternatives) && step.alternatives.length > 0) {
        altsText = step.alternatives
          .map((a) => {
            const sc =
              a.score !== undefined && a.score !== null
                ? ' ' + Number(a.score).toFixed(2)
                : '';
            return `${a.name || 'candidate'}${sc}`;
          })
          .join(', ');
      }
      tr.appendChild(el('td', {}, altsText));

      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    card.appendChild(table);
  }

  // Explanation paragraph below
  const exp = repair.explanation || proposal.explanation || '';
  if (exp) {
    card.appendChild(el('p', { class: 'repair-explanation' }, exp));
  }

  container.appendChild(card);
}

let activeConfirmHandler = null;

export function openConfirmDialog(repairId, action, onSuccess) {
  const dialog = document.getElementById('confirm-dialog');
  if (!dialog) return;

  initConfirmDialog();

  const titleEl = dialog.querySelector('h3');
  if (titleEl) {
    titleEl.textContent = `Confirm ${action.charAt(0).toUpperCase() + action.slice(1)}`;
  }

  const actorInput = document.getElementById('actor');
  const reasonInput = document.getElementById('reason');
  if (actorInput) actorInput.value = '';
  if (reasonInput) reasonInput.value = '';

  const form = dialog.querySelector('form');
  let alertP = dialog.querySelector('p[role="alert"]');
  if (alertP) alertP.remove();

  activeConfirmHandler = async () => {
    const actor = actorInput ? actorInput.value.trim() : '';
    const reason = reasonInput ? reasonInput.value.trim() : '';

    if (!actor || !reason) {
      if (!alertP) {
        alertP = el('p', { role: 'alert', class: 'error-msg' });
        form.insertBefore(alertP, form.querySelector('.dialog-actions'));
      }
      alertP.textContent = 'Actor and reason are required';
      return false;
    }

    try {
      await api(`/api/repairs/${repairId}/${action}`, {
        method: 'POST',
        body: JSON.stringify({
          confirm: true,
          actor,
          reason,
        }),
      });
      dialog.close();
      if (alertP) alertP.remove();
      if (typeof onSuccess === 'function') {
        await onSuccess();
      }
      return true;
    } catch (err) {
      if (!alertP) {
        alertP = el('p', { role: 'alert', class: 'error-msg' });
        form.insertBefore(alertP, form.querySelector('.dialog-actions'));
      }
      alertP.textContent = err.message || `${action} failed`;
      return false;
    }
  };

  dialog.showModal();
}

export function initConfirmDialog() {
  const dialog = document.getElementById('confirm-dialog');
  const confirmBtn = document.getElementById('confirm-btn');
  if (confirmBtn && !confirmBtn.dataset.initialized) {
    confirmBtn.dataset.initialized = 'true';
    confirmBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (activeConfirmHandler) {
        await activeConfirmHandler();
      }
    });
  }
  if (dialog && !dialog.dataset.initialized) {
    dialog.dataset.initialized = 'true';
    dialog.addEventListener('close', () => {
      const alertP = dialog.querySelector('p[role="alert"]');
      if (alertP) alertP.remove();
      activeConfirmHandler = null;
    });
  }
}

export function renderActionsBar(container, repair, onUpdate) {
  const barCard = el('div', { class: 'actions-bar card' });

  const header = el('div', { class: 'actions-bar-header' });
  header.appendChild(el('h3', {}, 'Actions'));
  if (repair.status === 'approved' || repair.status === 'applied') {
    header.appendChild(el('span', { class: 'seal' }, 'APPROVED'));
  }
  barCard.appendChild(header);

  const buttonsRow = el('div', { class: 'actions-bar-buttons' });

  // 1. Approve (btn--primary)
  const btnApprove = el('button', { id: 'btn-approve', class: 'btn btn--primary' }, 'Approve');
  const canApprove = repair.status === 'validated';
  if (!canApprove) {
    btnApprove.setAttribute('disabled', '');
    btnApprove.disabled = true;
    btnApprove.title = `Approve requires 'validated' status (current: ${repair.status})`;
  } else {
    btnApprove.addEventListener('click', () => {
      openConfirmDialog(repair.id, 'approve', onUpdate);
    });
  }
  buttonsRow.appendChild(btnApprove);

  // 2. Reject
  const btnReject = el('button', { id: 'btn-reject', class: 'btn' }, 'Reject');
  const canReject = ['proposed', 'needs_review', 'validated'].includes(repair.status);
  if (!canReject) {
    btnReject.setAttribute('disabled', '');
    btnReject.disabled = true;
    btnReject.title = `Reject requires proposed, needs_review, or validated status (current: ${repair.status})`;
  } else {
    btnReject.addEventListener('click', () => {
      openConfirmDialog(repair.id, 'reject', onUpdate);
    });
  }
  buttonsRow.appendChild(btnReject);

  // 3. Retry
  const btnRetry = el('button', { id: 'btn-retry', class: 'btn' }, 'Retry');
  const canRetry = ['proposed', 'validated'].includes(repair.status);
  if (!canRetry) {
    btnRetry.setAttribute('disabled', '');
    btnRetry.disabled = true;
    btnRetry.title = `Retry requires proposed or validated status (current: ${repair.status})`;
  } else {
    btnRetry.addEventListener('click', async () => {
      btnRetry.setAttribute('disabled', '');
      try {
        await api(`/api/repairs/${repair.id}/retry`, {
          method: 'POST',
          body: JSON.stringify({ confirm: true }),
        });
        if (typeof onUpdate === 'function') await onUpdate();
      } catch (err) {
        btnRetry.removeAttribute('disabled');
        showActionError(err.message || 'Retry failed');
      }
    });
  }
  buttonsRow.appendChild(btnRetry);

  // 4. Rollback (outlined ink, not red)
  const btnRollback = el('button', { id: 'btn-rollback', class: 'btn' }, 'Rollback');
  const canRollback = repair.status === 'applied';
  if (!canRollback) {
    btnRollback.setAttribute('disabled', '');
    btnRollback.disabled = true;
    btnRollback.title = `Rollback requires 'applied' status (current: ${repair.status})`;
  } else {
    btnRollback.addEventListener('click', () => {
      openConfirmDialog(repair.id, 'rollback', onUpdate);
    });
  }
  buttonsRow.appendChild(btnRollback);

  barCard.appendChild(buttonsRow);

  const alertP = el('p', { role: 'alert', class: 'error-msg', hidden: '' });
  function showActionError(msg) {
    alertP.textContent = msg;
    alertP.removeAttribute('hidden');
  }
  barCard.appendChild(alertP);

  // needs_review: radio list of pendingChoice.candidates (name, role, score) + button "Validate choice"
  const proposal =
    typeof repair.proposal === 'string'
      ? JSON.parse(repair.proposal)
      : repair.proposal || {};
  const pendingChoice = proposal.pendingChoice || repair.pendingChoice;
  const candidates = pendingChoice?.candidates || [];

  if (repair.status === 'needs_review' && candidates.length > 0) {
    const candCard = el('div', { class: 'candidates-container card' });
    candCard.appendChild(el('h4', {}, 'Select Candidate Choice'));

    const listDiv = el('div', { class: 'candidate-radio-list' });
    candidates.forEach((cand, idx) => {
      const radio = el('input', {
        type: 'radio',
        name: `candidate-${repair.id}`,
        value: cand.ref,
        id: `cand-${cand.ref}`,
      });
      if (idx === 0) radio.checked = true;
      const scoreStr =
        cand.score !== undefined && cand.score !== null
          ? Number(cand.score).toFixed(2)
          : '—';
      const label = el(
        'label',
        { class: 'checkbox-label', for: `cand-${cand.ref}` },
        radio,
        ` ${cand.name} (${cand.role}, score: ${scoreStr})`
      );
      listDiv.appendChild(label);
    });
    candCard.appendChild(listDiv);

    const validateBtn = el(
      'button',
      { id: 'btn-validate-choice', class: 'btn btn--primary' },
      'Validate choice'
    );
    const validatingText = el(
      'span',
      { class: 'validating-text mono', hidden: '' },
      'Validating…'
    );

    validateBtn.addEventListener('click', async () => {
      const selected = listDiv.querySelector(
        `input[name="candidate-${repair.id}"]:checked`
      );
      if (!selected) {
        showActionError('Please select a candidate');
        return;
      }
      validateBtn.setAttribute('disabled', '');
      validatingText.removeAttribute('hidden');
      try {
        await api(`/api/repairs/${repair.id}/resolve`, {
          method: 'POST',
          body: JSON.stringify({
            confirm: true,
            actor: 'operator',
            reason: 'resolve',
            candidateRef: selected.value,
          }),
        });
        if (typeof onUpdate === 'function') await onUpdate();
      } catch (err) {
        validateBtn.removeAttribute('disabled');
        validatingText.setAttribute('hidden', '');
        showActionError(err.message || 'Resolve failed');
      }
    });

    const actionsRow = el(
      'div',
      { class: 'resolve-actions' },
      validateBtn,
      validatingText
    );
    candCard.appendChild(actionsRow);
    barCard.appendChild(candCard);
  }

  container.appendChild(barCard);
}

export async function renderRepair(id) {
  const container = document.getElementById('view-repair');
  if (!container) return;
  container.textContent = '';

  try {
    const repair = await api(`/api/repairs/${id}`);

    // Header
    const header = el('div', { class: 'change-view-header' });
    const title = el('h2', {}, `Repair ${repair.displayId || 'rep_' + repair.id}`);
    const meta = el(
      'div',
      { class: 'change-view-meta' },
      el('span', { class: 'badge badge--proposed' }, repair.status || 'unknown'),
      el('span', { class: 'mono change-kind' }, `Proposer: ${repair.proposer || 'heuristic'}`)
    );
    if (repair.status === 'approved' || repair.status === 'applied') {
      meta.appendChild(el('span', { class: 'seal' }, 'APPROVED'));
    }
    header.appendChild(title);
    header.appendChild(meta);
    container.appendChild(header);

    // D5 Repair Preview
    renderRepairPreview(container, repair);

    // D6 Actions Bar
    renderActionsBar(container, repair, () => renderRepair(id));

    // D7 Validation Runs
    const valSection = el('div', { class: 'validation-section card' });
    valSection.appendChild(el('h3', {}, 'Validation Runs'));
    const valRuns = Array.isArray(repair.validationRuns) ? repair.validationRuns : [];
    if (valRuns.length === 0) {
      valSection.appendChild(el('p', { class: 'empty-state' }, 'No validation runs recorded.'));
    } else {
      const table = el('table', { class: 'table validation-runs-table' });
      table.appendChild(
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', {}, 'ID'),
            el('th', {}, 'Verdict'),
            el('th', {}, 'Time')
          )
        )
      );

      const tbody = el('tbody');
      for (const vr of valRuns) {
        const tr = el(
          'tr',
          {},
          el('td', { class: 'mono' }, `#${vr.id}`),
          el('td', {}, badge(vr.verdict)),
          el('td', {}, vr.createdAt ? new Date(vr.createdAt).toLocaleString() : '—')
        );
        tbody.appendChild(tr);

        // Per run oracle results list
        if (Array.isArray(vr.oracleResults) && vr.oracleResults.length > 0) {
          const oracleTr = el('tr', { class: 'oracle-results-row' });
          const oracleTd = el('td', { colspan: '3' });
          const oracleList = el('ul', { class: 'oracle-results-list' });

          for (const o of vr.oracleResults) {
            const icon = o.ok ? '✓' : '✕';
            const iconSpan = el(
              'span',
              { class: o.ok ? 'oracle-pass' : 'oracle-fail' },
              icon
            );
            const idSpan = el('strong', { class: 'mono oracle-id' }, ' ' + o.oracleId + ' ');
            const detailStr = JSON.stringify(o.detail || {}).slice(0, 120);
            const detailSpan = el('span', { class: 'mono oracle-detail' }, detailStr);

            const li = el('li', { class: 'oracle-item' }, iconSpan, idSpan, detailSpan);
            if (o.supportingOnly) {
              li.appendChild(document.createTextNode(' '));
              li.appendChild(el('span', { class: 'badge badge--proposed' }, 'supporting only'));
            }
            oracleList.appendChild(li);
          }
          oracleTd.appendChild(oracleList);
          oracleTr.appendChild(oracleTd);
          tbody.appendChild(oracleTr);
        }
      }
      table.appendChild(tbody);
      valSection.appendChild(table);
    }
    container.appendChild(valSection);

    // D7 Audit Trail
    const auditSection = el('div', { class: 'audit-section card' });
    auditSection.appendChild(el('h3', {}, 'Audit Trail'));
    try {
      const auditRows = await api(`/api/audit?entity=repairs&id=${id}`);
      if (!Array.isArray(auditRows) || auditRows.length === 0) {
        auditSection.appendChild(el('p', { class: 'empty-state' }, 'No audit log entries for this repair.'));
      } else {
        const auditTable = el('table', { class: 'table audit-table' });
        auditTable.appendChild(
          el(
            'thead',
            {},
            el(
              'tr',
              {},
              el('th', {}, 'Time'),
              el('th', {}, 'Actor'),
              el('th', {}, 'Action')
            )
          )
        );
        const aTbody = el('tbody');
        for (const a of auditRows) {
          aTbody.appendChild(
            el(
              'tr',
              {},
              el('td', {}, a.createdAt ? new Date(a.createdAt).toLocaleString() : '—'),
              el('td', { class: 'mono' }, a.actor || '—'),
              el('td', { class: 'mono' }, a.action || '—')
            )
          );
        }
        auditTable.appendChild(aTbody);
        auditSection.appendChild(auditTable);
      }
    } catch (err) {
      auditSection.appendChild(
        el('p', { class: 'error-msg' }, `Failed to load audit trail: ${err.message}`)
      );
    }
    container.appendChild(auditSection);
  } catch (err) {
    container.appendChild(
      el('p', { class: 'error-msg' }, `Failed to load repair details: ${err.message}`)
    );
  }
}

export async function renderAudit() {
  const container = document.getElementById('view-audit');
  if (!container) return;
  container.textContent = '';

  container.appendChild(el('h2', {}, 'Audit Trail'));

  const filterCard = el('div', { class: 'card audit-filter-card' });
  const label = el(
    'label',
    { class: 'filter-label', for: 'audit-entity-select' },
    'Entity: '
  );
  const select = el(
    'select',
    { id: 'audit-entity-select', class: 'select-input' },
    el('option', { value: 'All' }, 'All'),
    el('option', { value: 'repairs' }, 'repairs'),
    el('option', { value: 'runs' }, 'runs'),
    el('option', { value: 'changes' }, 'changes'),
    el('option', { value: 'pages' }, 'pages'),
    el('option', { value: 'sites' }, 'sites'),
    el('option', { value: 'known_good' }, 'known_good')
  );
  filterCard.appendChild(label);
  filterCard.appendChild(select);
  container.appendChild(filterCard);

  const tableContainer = el('div', { class: 'card audit-table-container' });
  container.appendChild(tableContainer);

  async function fetchAndRenderAudit() {
    tableContainer.textContent = '';
    const entity = select.value;
    const q = new URLSearchParams();
    if (entity && entity !== 'All') {
      q.set('entity', entity);
    }
    try {
      const rows = await api(`/api/audit?${q.toString()}`);
      if (!Array.isArray(rows) || rows.length === 0) {
        tableContainer.appendChild(el('p', { class: 'empty-state' }, 'No audit logs found.'));
        return;
      }
      const table = el('table', { class: 'table global-audit-table' });
      table.appendChild(
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', {}, 'Time'),
            el('th', {}, 'Entity'),
            el('th', {}, 'Entity ID'),
            el('th', {}, 'Actor'),
            el('th', {}, 'Action')
          )
        )
      );
      const tbody = el('tbody');
      for (const r of rows) {
        tbody.appendChild(
          el(
            'tr',
            {},
            el('td', {}, r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'),
            el('td', { class: 'mono' }, r.entity || '—'),
            el('td', { class: 'mono' }, String(r.entityId ?? '—')),
            el('td', { class: 'mono' }, r.actor || '—'),
            el('td', { class: 'mono' }, r.action || '—')
          )
        );
      }
      table.appendChild(tbody);
      tableContainer.appendChild(table);
    } catch (err) {
      tableContainer.appendChild(
        el('p', { class: 'error-msg' }, `Failed to load audit logs: ${err.message}`)
      );
    }
  }

  select.addEventListener('change', fetchAndRenderAudit);
  await fetchAndRenderAudit();
}

/* ==========================================================================
   2. THREE-PANEL DASHBOARD WORKSPACE (AI Agent | Playwright | Notes)
   ========================================================================== */
let workspaceState = {
  agentStatus: 'Healed', // 'Idle' | 'Running' | 'Healed' | 'Needs Review' | 'Failed'
  intentText: 'Complete checkout using a valid card.',
  activeStep: 4,
  totalSteps: 6,
  testName: 'checkout-valid-card.yaml',
  targetUrl: 'http://127.0.0.1:4102/cart.html',
  chatMessages: [
    {
      sender: 'agent',
      time: '10:14:02',
      text: 'Ready. I am monitoring Chromium execution on port 4102. Enter a natural language test intent or pick an example prompt below.'
    },
    {
      sender: 'user',
      time: '10:14:18',
      text: 'Complete checkout using a valid card.'
    },
    {
      sender: 'agent',
      time: '10:14:22',
      text: 'Executing checkout journey. Step 3 detected UI drift on selector #add-to-cart (redesign to shopping bag). Synthesizing self-healing candidate...',
      healing: {
        oldSelector: '#add-to-cart',
        newSelector: '#add-to-bag',
        score: '0.74',
        provenance: 'text-similarity & role-button',
        oracle: 'order-created ✓ | POST /api/orders 200 ✓'
      }
    }
  ],
  logs: [
    { time: '10:14:19', level: 'info', msg: 'Browser launched: Chromium 124.0 headless context' },
    { time: '10:14:20', level: 'info', msg: 'Navigated to http://127.0.0.1:4102/cart.html (HTTP 200)' },
    { time: '10:14:21', level: 'warn', msg: 'Step 3: Element "#add-to-cart" not found in DOM tree' },
    { time: '10:14:21', level: 'heal', msg: 'UI Drift: synthesized replacement "#add-to-bag" (score 0.74)' },
    { time: '10:14:22', level: 'pass', msg: 'Clicked "#add-to-bag" · item quantity updated in bag' },
    { time: '10:14:23', level: 'pass', msg: 'Backend Oracle validated: order-created invariant matched' }
  ],
  activeNoteId: 1,
  notesSearch: ''
};

function getNotes() {
  try {
    const raw = localStorage.getItem('healtest_notes');
    if (raw) return JSON.parse(raw);
  } catch {
    // Ignore error
  }
  return [
    {
      id: 1,
      title: 'Cart checkout selector drift on v2',
      tag: 'Checkout',
      updated: '10 mins ago',
      body: 'Button ID changed from #add-to-cart to #add-to-bag in shop-v2 redesign. Self-healing candidate score was 0.74. Backend order verification passed cleanly with zero LLM fallback calls.'
    },
    {
      id: 2,
      title: 'Oracle assertions on order API',
      tag: 'Oracles',
      updated: '1 hour ago',
      body: 'Always verify POST /api/orders returns HTTP 200 and sqlite orders table increment matches the order-created invariant before promoting repairs.'
    },
    {
      id: 3,
      title: 'Flaky payment button investigation',
      tag: 'Investigation',
      updated: 'Yesterday',
      body: 'Investigating timing differences between instant replay and fresh navigation context. Candidate scoring heuristics successfully filtered ambiguous options.'
    }
  ];
}

function saveNotes(notes) {
  try {
    localStorage.setItem('healtest_notes', JSON.stringify(notes));
  } catch {
    // Ignore error
  }
}

export function renderDashboardWorkspace() {
  const container = document.getElementById('view-dashboard');
  if (!container) return;
  container.textContent = '';

  const wrapper = el('div', { class: 'workspace-wrapper' });

  // Workspace Header Bar
  const headerBar = el('div', { class: 'workspace-header-bar' });
  const titleGroup = el('div', { class: 'workspace-title-group' });
  titleGroup.appendChild(el('h2', {}, 'Studio Workspace'));
  titleGroup.appendChild(
    el('p', { class: 'workspace-subtitle' }, 'Persistent 3-panel environment for intent orchestration, Playwright execution, and session notes.')
  );
  headerBar.appendChild(titleGroup);

  const headerActions = el('div', { class: 'header-right' });
  const resetBtn = el('button', { class: 'btn btn--outline btn--sm', type: 'button' }, '↺ Reset State');
  resetBtn.addEventListener('click', () => {
    workspaceState.agentStatus = 'Idle';
    workspaceState.activeStep = 1;
    workspaceState.chatMessages = [
      {
        sender: 'agent',
        time: new Date().toLocaleTimeString(),
        text: 'Session reset. Specify a natural language test intent or click an example prompt below.'
      }
    ];
    workspaceState.logs = [
      { time: new Date().toLocaleTimeString(), level: 'info', msg: 'Session reset. Connected to Chromium 124.0 on port 4102.' }
    ];
    renderDashboardWorkspace();
  });
  headerActions.appendChild(resetBtn);
  headerBar.appendChild(headerActions);
  wrapper.appendChild(headerBar);

  // 3-Panel Grid
  const grid = el('div', { class: 'workspace-3panel' });

  // ==========================================
  // PANEL A: AI AGENT (Left)
  // ==========================================
  const panelA = el('div', { class: 'panel agent-panel' });
  const headerA = el('div', { class: 'panel-header' });
  headerA.appendChild(el('h3', { class: 'panel-title' }, '🤖 AI Agent'));
  const statusPill = el(
    'span',
    { class: `panel-status status--${workspaceState.agentStatus.toLowerCase().replace(/\s+/g, '')}` },
    workspaceState.agentStatus
  );
  headerA.appendChild(statusPill);
  panelA.appendChild(headerA);

  // Conversation Area
  const chatArea = el('div', { class: 'agent-chat-area' });
  for (const m of workspaceState.chatMessages) {
    const bubble = el('div', { class: `chat-bubble chat-bubble--${m.sender}` });
    bubble.appendChild(el('div', { class: 'mono', style: 'font-size: 0.7rem; opacity: 0.7; margin-bottom: 2px;' }, `${m.sender.toUpperCase()} · ${m.time}`));
    bubble.appendChild(el('div', {}, m.text));

    if (m.healing) {
      const hCard = el('div', { class: 'agent-healing-card' });
      hCard.appendChild(el('div', { class: 'agent-healing-header' }, '⚡ Self-Healing Proposal Synthesized'));
      hCard.appendChild(
        el(
          'p',
          { class: 'agent-healing-desc mono' },
          `Drift: ${m.healing.oldSelector} → ${m.healing.newSelector} (Score: ${m.healing.score})`
        )
      );
      hCard.appendChild(
        el('div', { class: 'agent-healing-desc mono', style: 'font-size: 0.75rem; margin-top: 4px;' }, `Oracle: ${m.healing.oracle}`)
      );
      bubble.appendChild(hCard);
    }
    chatArea.appendChild(bubble);
  }
  panelA.appendChild(chatArea);

  // Suggested Actions Chips
  const suggestionsBox = el('div', { class: 'agent-suggestions' });
  suggestionsBox.appendChild(el('div', { class: 'suggestions-label' }, 'Suggested Intent Prompts'));
  const chipsContainer = el('div', { class: 'suggestion-chips' });
  const suggestedPrompts = [
    'Complete checkout using a valid card.',
    'Add item with promotional discount',
    'Verify cart quantity increment',
    'Shop v2 redesign checkout'
  ];

  for (const promptText of suggestedPrompts) {
    const chip = el('button', { class: 'suggestion-chip', type: 'button' }, promptText);
    chip.addEventListener('click', () => {
      intentInput.value = promptText;
      runAgentAction(promptText);
    });
    chipsContainer.appendChild(chip);
  }
  suggestionsBox.appendChild(chipsContainer);
  panelA.appendChild(suggestionsBox);

  // Input Container
  const inputContainer = el('div', { class: 'agent-input-container' });
  const intentInput = el('textarea', {
    class: 'agent-input-box',
    placeholder: 'Complete checkout using a valid card.'
  });
  intentInput.value = workspaceState.intentText;
  intentInput.addEventListener('input', (e) => {
    workspaceState.intentText = e.target.value;
  });
  intentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      runAgentAction(intentInput.value);
    }
  });
  inputContainer.appendChild(intentInput);

  const actionRow = el('div', { class: 'agent-actions-row' });
  actionRow.appendChild(el('span', { class: 'agent-state-label mono' }, `State: ${workspaceState.agentStatus}`));
  const runBtn = el('button', { class: 'btn btn--primary btn--sm', type: 'button' }, '⚡ Run Agent');
  runBtn.addEventListener('click', () => runAgentAction(intentInput.value));
  actionRow.appendChild(runBtn);
  inputContainer.appendChild(actionRow);
  panelA.appendChild(inputContainer);
  grid.appendChild(panelA);

  function runAgentAction(intent) {
    const text = (intent || 'Complete checkout using a valid card.').trim();
    workspaceState.intentText = text;
    workspaceState.agentStatus = 'Running';
    workspaceState.activeStep = 2;
    workspaceState.chatMessages.push({
      sender: 'user',
      time: new Date().toLocaleTimeString(),
      text
    });
    workspaceState.chatMessages.push({
      sender: 'agent',
      time: new Date().toLocaleTimeString(),
      text: 'Synthesizing test execution for intent... Checking baseline plan against target http://127.0.0.1:4102'
    });
    workspaceState.logs.push({
      time: new Date().toLocaleTimeString(),
      level: 'info',
      msg: `Dispatched intent: "${text}"`
    });
    renderDashboardWorkspace();

    setTimeout(() => {
      workspaceState.activeStep = 4;
      workspaceState.agentStatus = 'Healed';
      workspaceState.chatMessages.push({
        sender: 'agent',
        time: new Date().toLocaleTimeString(),
        text: 'UI Drift detected on shop-v2! Selector #add-to-cart replaced with #add-to-bag. Deterministic backend oracle verified order creation.',
        healing: {
          oldSelector: '#add-to-cart',
          newSelector: '#add-to-bag',
          score: '0.74',
          provenance: 'text-similarity & role-button',
          oracle: 'order-created ✓ | POST /api/orders 200 ✓'
        }
      });
      workspaceState.logs.push(
        { time: new Date().toLocaleTimeString(), level: 'heal', msg: 'Synthesized repair #add-to-bag (score 0.74)' },
        { time: new Date().toLocaleTimeString(), level: 'pass', msg: 'Oracle PASS: order-created invariant satisfied' }
      );
      renderDashboardWorkspace();
    }, 700);
  }

  // ==========================================
  // PANEL B: PLAYWRIGHT OVERVIEW (Center, Wider)
  // ==========================================
  const panelB = el('div', { class: 'panel playwright-panel' });
  const headerB = el('div', { class: 'panel-header' });
  headerB.appendChild(el('h3', { class: 'panel-title' }, '🎭 Playwright Real-Time Overview'));
  const connBadge = el('span', { class: 'chrome-badge mono' }, 'Chromium 124.0 Connected · Port 4102');
  headerB.appendChild(connBadge);
  panelB.appendChild(headerB);

  // Test Meta Bar
  const metaBar = el('div', { class: 'pw-test-meta-bar' });
  const testInfo = el('div', {}, el('span', { class: 'pw-test-name mono' }, workspaceState.testName));
  const stepInfo = el(
    'span',
    { class: 'pw-step-counter mono' },
    `Step ${workspaceState.activeStep} of ${workspaceState.totalSteps}: Click #add-to-bag`
  );
  metaBar.appendChild(testInfo);
  metaBar.appendChild(stepInfo);
  panelB.appendChild(metaBar);

  const progContainer = el('div', { class: 'pw-progress-container' });
  const pct = Math.round((workspaceState.activeStep / workspaceState.totalSteps) * 100);
  progContainer.appendChild(el('div', { class: 'pw-progress-bar', style: `width: ${pct}%;` }));
  panelB.appendChild(progContainer);

  // Large Browser Viewport Area
  const viewportFrame = el('div', { class: 'pw-browser-viewport-frame' });
  const chromeBar = el('div', { class: 'browser-chrome' });
  const controls = el('div', { class: 'chrome-controls mono' }, '◀ ▶ ↺');
  const urlBar = el('div', { class: 'chrome-url-bar mono' }, workspaceState.targetUrl);
  const modeBadge = el('span', { class: 'chrome-badge' }, 'Viewport: 1280x800');
  chromeBar.appendChild(controls);
  chromeBar.appendChild(urlBar);
  chromeBar.appendChild(modeBadge);
  viewportFrame.appendChild(chromeBar);

  // Live Screen Canvas
  const liveCanvas = el('div', { class: 'browser-live-canvas' });
  const storeHeader = el('div', { class: 'store-preview-header' });
  storeHeader.appendChild(el('h4', {}, 'Gizmo Mini Store'));
  storeHeader.appendChild(el('span', { class: 'badge badge--pass' }, 'Cart (1 item)'));
  liveCanvas.appendChild(storeHeader);

  const cartItem = el('div', { class: 'store-cart-item' });
  cartItem.appendChild(el('span', { class: 'item-name' }, 'Gizmo Mini — Portable Speaker'));
  cartItem.appendChild(el('span', { class: 'item-price mono' }, '$19.99 (Qty: 1)'));
  liveCanvas.appendChild(cartItem);

  // Prominent action zone with highlight box around healed element
  const actionZone = el('div', { class: 'store-action-zone' });
  actionZone.appendChild(el('span', { class: 'store-action-tag mono' }, 'Healed: #add-to-bag (Score 0.74)'));
  actionZone.appendChild(el('button', { class: 'btn btn--primary' }, 'Add to bag'));
  actionZone.appendChild(el('span', { class: 'mono', style: 'font-size: 0.8rem; font-weight: 600;' }, 'Subtotal: $19.99'));
  liveCanvas.appendChild(actionZone);

  // Oracle Toast
  const oracleToast = el(
    'div',
    { class: 'sim-oracle-toast mono' },
    'Backend Oracle: order-created ✓ | POST /api/orders 200 ✓ | HEALED_PASS'
  );
  liveCanvas.appendChild(oracleToast);
  viewportFrame.appendChild(liveCanvas);
  panelB.appendChild(viewportFrame);

  // Verdict Pills Bar
  const pillsBar = el('div', { class: 'pw-verdict-pills' });
  pillsBar.appendChild(el('span', { class: 'verdict-chip' }, 'Passed ✓'));
  pillsBar.appendChild(el('span', { class: 'verdict-chip active-healed' }, 'Healed ↻ (Active)'));
  pillsBar.appendChild(el('span', { class: 'verdict-chip' }, 'App Bug ✕'));
  pillsBar.appendChild(el('span', { class: 'verdict-chip' }, 'Needs Review ?'));
  panelB.appendChild(pillsBar);

  // Expandable Logs Section
  const logsSec = el('div', { class: 'pw-logs-section' });
  const logsToggle = el('div', { class: 'pw-logs-toggle' });
  logsToggle.appendChild(el('span', {}, `Execution Trace & Logs (${workspaceState.logs.length} entries)`));
  logsToggle.appendChild(el('span', {}, '▾'));
  logsSec.appendChild(logsToggle);

  const logsContent = el('div', { class: 'pw-logs-content mono' });
  for (const log of workspaceState.logs) {
    const entry = el('div', { class: 'log-entry' });
    entry.appendChild(el('span', { class: 'log-time' }, log.time));
    entry.appendChild(el('span', { class: `log-level log-level--${log.level}` }, log.level.toUpperCase()));
    entry.appendChild(el('span', { class: 'log-msg' }, log.msg));
    logsContent.appendChild(entry);
  }
  logsSec.appendChild(logsContent);

  let logsOpen = true;
  logsToggle.addEventListener('click', () => {
    logsOpen = !logsOpen;
    logsContent.style.display = logsOpen ? 'flex' : 'none';
  });

  panelB.appendChild(logsSec);
  grid.appendChild(panelB);

  // ==========================================
  // PANEL C: NOTES (Right)
  // ==========================================
  const panelC = el('div', { class: 'panel notes-panel' });
  const headerC = el('div', { class: 'panel-header' });
  const notes = getNotes();
  headerC.appendChild(el('h3', { class: 'panel-title' }, '📝 Notes'));
  const newNoteBtn = el('button', { class: 'btn btn--primary btn--sm', type: 'button' }, '+ New Note');
  headerC.appendChild(newNoteBtn);
  panelC.appendChild(headerC);

  // Search Notes Field
  const searchBar = el('div', { class: 'notes-search-bar' });
  const searchInput = el('input', {
    type: 'search',
    class: 'notes-search-input',
    placeholder: 'Search notes...'
  });
  searchInput.value = workspaceState.notesSearch;
  searchInput.addEventListener('input', (e) => {
    workspaceState.notesSearch = e.target.value.toLowerCase();
    renderDashboardWorkspace();
  });
  searchBar.appendChild(searchInput);
  panelC.appendChild(searchBar);

  // Notes List
  const notesList = el('div', { class: 'notes-list' });
  const filteredNotes = notes.filter((n) => {
    if (!workspaceState.notesSearch) return true;
    return (
      n.title.toLowerCase().includes(workspaceState.notesSearch) ||
      n.body.toLowerCase().includes(workspaceState.notesSearch) ||
      (n.tag && n.tag.toLowerCase().includes(workspaceState.notesSearch))
    );
  });

  if (filteredNotes.length === 0) {
    notesList.appendChild(
      el('div', { class: 'empty-state', style: 'padding: calc(var(--gap) * 2); text-align: center;' }, 'No notes found.')
    );
  } else {
    for (const note of filteredNotes) {
      const item = el('div', {
        class: `note-item ${note.id === workspaceState.activeNoteId ? 'active' : ''}`
      });
      const topRow = el('div', { class: 'note-item-header' });
      topRow.appendChild(el('h4', { class: 'note-item-title' }, note.title));
      topRow.appendChild(el('span', { class: 'note-item-time mono' }, note.updated));
      item.appendChild(topRow);

      item.appendChild(el('p', { class: 'note-item-preview' }, note.body));
      if (note.tag) {
        item.appendChild(el('span', { class: 'note-item-tag mono' }, note.tag));
      }

      item.addEventListener('click', () => {
        workspaceState.activeNoteId = note.id;
        renderDashboardWorkspace();
      });
      notesList.appendChild(item);
    }
  }
  panelC.appendChild(notesList);

  // Active Note Editor
  const currentNote = notes.find((n) => n.id === workspaceState.activeNoteId) || filteredNotes[0] || null;
  const editor = el('div', { class: 'note-editor' });

  if (currentNote) {
    const editTitle = el('input', { class: 'note-editor-title', value: currentNote.title });
    const editTag = el('input', {
      class: 'note-editor-title mono',
      style: 'font-size: 0.75rem; font-weight: normal;',
      placeholder: 'Tag (e.g. Checkout, Drift)',
      value: currentNote.tag || ''
    });
    const editBody = el('textarea', { class: 'note-editor-body' });
    editBody.value = currentNote.body;

    const editorActions = el('div', { class: 'note-editor-actions' });
    const saveNoteBtn = el('button', { class: 'btn btn--primary btn--sm', type: 'button' }, 'Save Note');
    saveNoteBtn.addEventListener('click', () => {
      currentNote.title = editTitle.value.trim() || 'Untitled Note';
      currentNote.tag = editTag.value.trim();
      currentNote.body = editBody.value;
      currentNote.updated = 'Just now';
      saveNotes(notes);
      renderDashboardWorkspace();
    });

    const deleteNoteBtn = el('button', { class: 'btn btn--outline btn--sm', type: 'button' }, 'Delete');
    deleteNoteBtn.addEventListener('click', () => {
      const idx = notes.findIndex((n) => n.id === currentNote.id);
      if (idx !== -1) {
        notes.splice(idx, 1);
        saveNotes(notes);
        workspaceState.activeNoteId = notes[0]?.id || 0;
        renderDashboardWorkspace();
      }
    });

    editorActions.appendChild(saveNoteBtn);
    editorActions.appendChild(deleteNoteBtn);

    editor.appendChild(editTitle);
    editor.appendChild(editTag);
    editor.appendChild(editBody);
    editor.appendChild(editorActions);
  } else {
    editor.appendChild(el('p', { class: 'empty-state' }, 'No note selected. Click "+ New Note" to write one.'));
  }

  newNoteBtn.addEventListener('click', () => {
    const newId = Date.now();
    const newNote = {
      id: newId,
      title: 'New Session Note',
      tag: 'General',
      updated: 'Just now',
      body: 'Write test observations, selector drift notes, or oracle validation checks here.'
    };
    notes.unshift(newNote);
    saveNotes(notes);
    workspaceState.activeNoteId = newId;
    renderDashboardWorkspace();
  });

  panelC.appendChild(editor);
  grid.appendChild(panelC);

  wrapper.appendChild(grid);
  container.appendChild(wrapper);
}

/* ==========================================================================
   3. SETTINGS PAGE
   ========================================================================== */
export function renderSettings() {
  const container = document.getElementById('view-settings');
  if (!container) return;
  container.textContent = '';

  const wrap = el('div', { class: 'settings-container' });

  // Header
  const hdr = el('div', { class: 'settings-header' });
  hdr.appendChild(el('h2', {}, 'Workspace & Account Settings'));
  hdr.appendChild(el('p', { class: 'section-desc', style: 'margin: 0;' }, 'Manage user profile, security policies, and Kaizen AI runtime configuration.'));
  wrap.appendChild(hdr);

  // Settings feedback toast placeholder
  const toastContainer = el('div', { id: 'settings-toast-container' });
  wrap.appendChild(toastContainer);

  let savedSettings = {};
  try {
    const raw = localStorage.getItem('healtest_settings');
    if (raw) savedSettings = JSON.parse(raw);
  } catch {
    // Ignore error
  }

  // 1. Profile Information
  const profCard = el('div', { class: 'card' });
  profCard.appendChild(el('h3', {}, 'Profile Information'));
  const avatarRow = el('div', { class: 'profile-avatar-row' });
  avatarRow.appendChild(el('div', { class: 'avatar-circle' }, 'DL'));
  const avatarMeta = el('div', {});
  avatarMeta.appendChild(el('div', { style: 'font-weight: 700;' }, 'Demo Lead / QA Engineer'));
  avatarMeta.appendChild(el('div', { style: 'font-size: 0.8rem; color: var(--text-secondary);' }, 'Organization: Kaizen AI Core Workspace'));
  avatarRow.appendChild(avatarMeta);
  profCard.appendChild(avatarRow);

  const nameGroup = el('div', { class: 'form-group' });
  nameGroup.appendChild(el('label', { for: 'set-name' }, 'Display Name'));
  const nameInput = el('input', { id: 'set-name', type: 'text', value: savedSettings.name || 'Demo Lead' });
  nameGroup.appendChild(nameInput);
  profCard.appendChild(nameGroup);

  const emailGroup = el('div', { class: 'form-group' });
  emailGroup.appendChild(el('label', { for: 'set-email' }, 'Work Email'));
  const emailInput = el('input', { id: 'set-email', type: 'email', value: savedSettings.email || 'demo-lead@healtest.dev' });
  emailGroup.appendChild(emailInput);
  profCard.appendChild(emailGroup);
  wrap.appendChild(profCard);

  // 2. Security & Password
  const secCard = el('div', { class: 'card' });
  secCard.appendChild(el('h3', {}, 'Password & Security'));
  const curPassGroup = el('div', { class: 'form-group' });
  curPassGroup.appendChild(el('label', { for: 'set-cur-pass' }, 'Current Password'));
  curPassGroup.appendChild(el('input', { id: 'set-cur-pass', type: 'password', placeholder: '••••••••••••' }));
  secCard.appendChild(curPassGroup);

  const newPassGroup = el('div', { class: 'form-group' });
  newPassGroup.appendChild(el('label', { for: 'set-new-pass' }, 'New Password'));
  newPassGroup.appendChild(el('input', { id: 'set-new-pass', type: 'password', placeholder: 'Enter new password' }));
  secCard.appendChild(newPassGroup);
  wrap.appendChild(secCard);

  // 3. Notification Preferences
  const notifCard = el('div', { class: 'card' });
  notifCard.appendChild(el('h3', {}, 'Notification Preferences'));
  const cb1 = el('input', { type: 'checkbox', checked: savedSettings.alertBug !== false });
  notifCard.appendChild(el('label', { class: 'checkbox-label', style: 'margin-bottom: var(--gap);' }, cb1, ' Email alert when APP_BUG invariant violation is detected'));
  const cb2 = el('input', { type: 'checkbox', checked: savedSettings.alertReview !== false });
  notifCard.appendChild(el('label', { class: 'checkbox-label', style: 'margin-bottom: var(--gap);' }, cb2, ' Slack webhook notification when repair requires human review'));

  const webhookGroup = el('div', { class: 'form-group', style: 'margin-top: var(--gap);' });
  webhookGroup.appendChild(el('label', { for: 'set-webhook' }, 'Slack / Discord Webhook URL'));
  const webhookInput = el('input', { id: 'set-webhook', type: 'text', placeholder: '127.0.0.1:4300/api/webhook/slack', value: savedSettings.webhook || '' });
  webhookGroup.appendChild(webhookInput);
  notifCard.appendChild(webhookGroup);
  wrap.appendChild(notifCard);

  // 4. Workspace Preferences
  const wsCard = el('div', { class: 'card' });
  wsCard.appendChild(el('h3', {}, 'Workspace Preferences'));
  const timeoutGroup = el('div', { class: 'form-group' });
  timeoutGroup.appendChild(el('label', { for: 'set-timeout' }, 'Default Execution Timeout (ms)'));
  const timeoutInput = el('input', { id: 'set-timeout', type: 'number', value: savedSettings.timeout || 15000 });
  timeoutGroup.appendChild(timeoutInput);
  wsCard.appendChild(timeoutGroup);

  const targetGroup = el('div', { class: 'form-group' });
  targetGroup.appendChild(el('label', { for: 'set-target' }, 'Target Environment URL'));
  const targetInput = el('input', { id: 'set-target', type: 'text', value: savedSettings.target || 'http://127.0.0.1:4102' });
  targetGroup.appendChild(targetInput);
  wsCard.appendChild(targetGroup);
  wrap.appendChild(wsCard);

  // Save Button
  const saveBtn = el('button', { class: 'btn btn--primary', type: 'button', style: 'align-self: flex-start; min-height: 44px; padding: 0 24px;' }, 'Save Changes');
  saveBtn.addEventListener('click', () => {
    const toSave = {
      name: nameInput.value.trim(),
      email: emailInput.value.trim(),
      alertBug: cb1.checked,
      alertReview: cb2.checked,
      webhook: webhookInput.value.trim(),
      timeout: Number(timeoutInput.value),
      target: targetInput.value.trim()
    };
    try {
      localStorage.setItem('healtest_settings', JSON.stringify(toSave));
    } catch {
      // Ignore error
    }
    toastContainer.textContent = '';
    const toast = el('div', { class: 'settings-toast' }, '✓ Settings saved successfully to workspace.');
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toastContainer.textContent = '';
    }, 4000);
  });
  wrap.appendChild(saveBtn);

  container.appendChild(wrap);
}

/* ==========================================================================
   4. BILLING PAGE
   ========================================================================== */
export function renderBilling() {
  const container = document.getElementById('view-billing');
  if (!container) return;
  container.textContent = '';

  const wrap = el('div', { class: 'billing-container' });

  // Header
  const hdr = el('div', { class: 'billing-header' });
  hdr.appendChild(el('h2', {}, 'Simple, Transparent Pricing'));
  hdr.appendChild(
    el(
      'p',
      { class: 'section-desc' },
      'Start free with core self-healing and Playwright integration. Upgrade to Pro for automated code fixes and developer review routing.'
    )
  );
  wrap.appendChild(hdr);

  // Plans Grid (Exactly 2 plans: FREE and PRO)
  const grid = el('div', { class: 'plans-grid' });

  // 1. FREE PLAN
  const freeCard = el('div', { class: 'plan-card' });
  freeCard.appendChild(el('h3', { class: 'plan-name' }, 'Free Plan'));
  freeCard.appendChild(el('p', { class: 'plan-desc' }, 'Core intent-aware testing for individual engineers and open source repositories.'));
  const freeCost = el('div', { class: 'plan-cost' });
  freeCost.appendChild(document.createTextNode('Free '));
  freeCost.appendChild(el('span', { class: 'plan-cost-period' }, '/ forever'));
  freeCard.appendChild(freeCost);

  const freeList = el('ul', { class: 'plan-features-list' });
  const freeFeatures = [
    'AI Agent natural language intent authoring',
    'Playwright integration & Chromium execution',
    'Notes panel & session persistence',
    'Core test execution and self-healing functionality',
    'Basic run history (last 50 runs)'
  ];
  for (const f of freeFeatures) {
    const li = el('li', {});
    li.appendChild(el('span', { class: 'check-icon' }, '✓'));
    li.appendChild(el('span', {}, f));
    freeList.appendChild(li);
  }
  freeCard.appendChild(freeList);
  const curBtn = el('button', { class: 'btn btn--outline', disabled: '' }, 'Current Plan');
  freeCard.appendChild(curBtn);
  grid.appendChild(freeCard);

  // 2. PRO PLAN
  const proCard = el('div', { class: 'plan-card plan-pro' });
  proCard.appendChild(el('span', { class: 'plan-badge' }, 'RECOMMENDED'));
  proCard.appendChild(el('h3', { class: 'plan-name' }, 'Pro Plan'));
  proCard.appendChild(
    el('p', { class: 'plan-desc' }, 'Comprehensive testing governance and automated code repairs for high-velocity teams.')
  );
  const proCost = el('div', { class: 'plan-cost' });
  proCost.appendChild(document.createTextNode('Contact us '));
  proCost.appendChild(el('span', { class: 'plan-cost-period' }, '/ custom'));
  proCard.appendChild(proCost);

  const proList = el('ul', { class: 'plan-features-list' });
  const proFeatures = [
    'Everything in Free Plan included',
    'Real-time code-change assistance',
    'Automatically apply small, well-defined code fixes after appropriate validation',
    'Route larger or risky changes to a developer for review',
    'Show a clear review/approval state before risky modifications',
    'Enterprise audit trail & SLA guarantees',
    'Priority webhook integration & governance sign-off'
  ];
  for (const f of proFeatures) {
    const li = el('li', {});
    li.appendChild(el('span', { class: 'check-icon' }, '✓'));
    li.appendChild(el('span', {}, f));
    proList.appendChild(li);
  }
  proCard.appendChild(proList);
  const upgradeBtn = el('button', { class: 'btn btn--primary', type: 'button' }, 'Upgrade to Pro');
  upgradeBtn.addEventListener('click', () => {
    alert('Thank you for your interest in Kaizen AI Pro. Our engineering team will contact you shortly.');
  });
  proCard.appendChild(upgradeBtn);
  grid.appendChild(proCard);

  wrap.appendChild(grid);

  // Comparison Matrix Card
  const compCard = el('div', { class: 'card', style: 'margin-top: calc(var(--gap) * 3);' });
  compCard.appendChild(el('h3', {}, 'Feature Comparison'));
  const table = el('table', { class: 'table' });
  table.appendChild(
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        el('th', {}, 'Feature & Capability'),
        el('th', { style: 'text-align: center;' }, 'Free'),
        el('th', { style: 'text-align: center;' }, 'Pro')
      )
    )
  );
  const matrix = [
    ['AI Agent intent authoring', '✓ Included', '✓ Included'],
    ['Playwright execution engine', '✓ Included', '✓ Included'],
    ['Session notes panel', '✓ Included', '✓ Included'],
    ['Self-healing test recovery', '✓ Included', '✓ Included'],
    ['Real-time code-change assistance', '—', '✓ Included'],
    ['Auto-apply small, validated fixes', '—', '✓ Included'],
    ['Route risky changes to developer', '—', '✓ Included'],
    ['Review & approval governance state', '—', '✓ Included']
  ];
  const tbody = el('tbody');
  for (const [feat, freeVal, proVal] of matrix) {
    tbody.appendChild(
      el(
        'tr',
        {},
        el('td', {}, feat),
        el('td', { style: 'text-align: center;', class: freeVal.startsWith('✓') ? 'oracle-pass' : 'oracle-detail' }, freeVal),
        el('td', { style: 'text-align: center;', class: 'oracle-pass' }, proVal)
      )
    );
  }
  table.appendChild(tbody);
  compCard.appendChild(table);
  wrap.appendChild(compCard);

  container.appendChild(wrap);
}

/* ==========================================================================
   5. AUTHENTICATION (LOGIN & SIGNUP)
   ========================================================================== */
export function renderAuth(initialMode = 'login') {
  const container = document.getElementById('view-auth');
  if (!container) return;
  container.textContent = '';

  let mode = initialMode; // 'login' | 'signup'

  const wrap = el('div', { class: 'auth-wrapper' });

  // Header
  const hdr = el('div', { class: 'auth-header' });
  hdr.appendChild(el('h2', {}, 'Kaizen AI'));
  hdr.appendChild(
    el('p', {}, 'Sign in to access your self-healing testing workspace and execution governance.')
  );
  wrap.appendChild(hdr);

  // Tabs
  const tabs = el('div', { class: 'auth-tabs' });
  const loginTab = el('button', { class: `auth-tab-btn ${mode === 'login' ? 'active' : ''}`, type: 'button' }, 'Sign In');
  const signupTab = el('button', { class: `auth-tab-btn ${mode === 'signup' ? 'active' : ''}`, type: 'button' }, 'Create Account');
  tabs.appendChild(loginTab);
  tabs.appendChild(signupTab);
  wrap.appendChild(tabs);

  const formContainer = el('div', { class: 'auth-form-container' });
  wrap.appendChild(formContainer);

  function renderForm() {
    formContainer.textContent = '';

    const errorMsg = el('p', { class: 'error-msg', hidden: '' });
    const successMsg = el('p', { class: 'settings-toast', hidden: '', style: 'margin-bottom: var(--gap);' });
    formContainer.appendChild(errorMsg);
    formContainer.appendChild(successMsg);

    const form = el('form', { novalidate: '' });

    if (mode === 'signup') {
      const nameGroup = el('div', { class: 'form-group' });
      nameGroup.appendChild(el('label', { for: 'auth-name' }, 'Full Name'));
      const nameInput = el('input', { id: 'auth-name', type: 'text', required: '', placeholder: 'John Doe' });
      nameGroup.appendChild(nameInput);
      form.appendChild(nameGroup);
    }

    const emailGroup = el('div', { class: 'form-group' });
    emailGroup.appendChild(el('label', { for: 'auth-email' }, 'Work Email'));
    const emailInput = el('input', { id: 'auth-email', type: 'email', required: '', placeholder: 'engineer@company.com' });
    emailGroup.appendChild(emailInput);
    form.appendChild(emailGroup);

    // Password field with show/hide toggle
    const passGroup = el('div', { class: 'form-group' });
    passGroup.appendChild(el('label', { for: 'auth-pass' }, 'Password'));
    const passWrap = el('div', { class: 'password-input-wrapper' });
    const passInput = el('input', { id: 'auth-pass', type: 'password', required: '', placeholder: '••••••••••••' });
    const togglePassBtn = el('button', { type: 'button', class: 'pwd-toggle-btn' }, '👁');
    togglePassBtn.addEventListener('click', () => {
      if (passInput.type === 'password') {
        passInput.type = 'text';
      } else {
        passInput.type = 'password';
      }
    });
    passWrap.appendChild(passInput);
    passWrap.appendChild(togglePassBtn);
    passGroup.appendChild(passWrap);
    form.appendChild(passGroup);

    let confirmInput = null;
    if (mode === 'signup') {
      const confGroup = el('div', { class: 'form-group' });
      confGroup.appendChild(el('label', { for: 'auth-conf-pass' }, 'Confirm Password'));
      confirmInput = el('input', { id: 'auth-conf-pass', type: 'password', required: '', placeholder: '••••••••••••' });
      confGroup.appendChild(confirmInput);
      form.appendChild(confGroup);
    }

    const submitBtn = el(
      'button',
      { class: 'btn btn--primary', type: 'submit', style: 'width: 100%; min-height: 44px; margin-top: calc(var(--gap) * 2);' },
      mode === 'login' ? 'Sign In' : 'Create Account'
    );
    form.appendChild(submitBtn);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      errorMsg.setAttribute('hidden', '');
      successMsg.setAttribute('hidden', '');

      const emailVal = emailInput.value.trim();
      const passVal = passInput.value;

      if (!emailVal || !emailVal.includes('@')) {
        errorMsg.textContent = 'Please enter a valid email address.';
        errorMsg.removeAttribute('hidden');
        return;
      }
      if (!passVal || passVal.length < 6) {
        errorMsg.textContent = 'Password must be at least 6 characters.';
        errorMsg.removeAttribute('hidden');
        return;
      }
      if (mode === 'signup' && confirmInput && confirmInput.value !== passVal) {
        errorMsg.textContent = 'Passwords do not match.';
        errorMsg.removeAttribute('hidden');
        return;
      }

      // Demo login success
      submitBtn.disabled = true;
      submitBtn.textContent = 'Authenticating...';

      setTimeout(() => {
        try {
          localStorage.setItem('healtest_user', JSON.stringify({ email: emailVal, loggedIn: true }));
        } catch {
          // Ignore
        }

        const navAuth = document.getElementById('nav-auth-btn');
        if (navAuth) {
          navAuth.textContent = 'Signed in (demo-lead)';
        }

        successMsg.textContent = '✓ Successfully authenticated! Redirecting to studio...';
        successMsg.removeAttribute('hidden');

        setTimeout(() => {
          window.location.hash = '#/dashboard';
        }, 600);
      }, 500);
    });

    formContainer.appendChild(form);
  }

  loginTab.addEventListener('click', () => {
    mode = 'login';
    loginTab.classList.add('active');
    signupTab.classList.remove('active');
    renderForm();
  });

  signupTab.addEventListener('click', () => {
    mode = 'signup';
    signupTab.classList.add('active');
    loginTab.classList.remove('active');
    renderForm();
  });

  renderForm();
  container.appendChild(wrap);
}

/* ==========================================================================
   6. DEMO VIDEO MODAL DIALOG CONTROLLER
   ========================================================================== */
export function initDemoVideoModal() {
  const dlg = document.getElementById('demo-video-dialog');
  const closeBtn = document.getElementById('close-video-modal');
  const playPauseBtn = document.getElementById('sim-play-pause-btn');
  const fill = document.getElementById('sim-progress-fill');
  const timeText = document.getElementById('sim-time-text');

  if (closeBtn && dlg) {
    closeBtn.addEventListener('click', () => dlg.close());
  }

  let isPlaying = false;
  let progressPct = 35;
  let timerId = null;

  if (playPauseBtn && fill && timeText) {
    playPauseBtn.addEventListener('click', () => {
      isPlaying = !isPlaying;
      if (isPlaying) {
        playPauseBtn.textContent = '❚❚ Pause';
        timerId = setInterval(() => {
          progressPct += 2;
          if (progressPct > 100) progressPct = 0;
          fill.style.width = `${progressPct}%`;
          const sec = Math.round((progressPct / 100) * 42);
          const secStr = sec < 10 ? `0${sec}` : `${sec}`;
          timeText.textContent = `00:${secStr} / 00:42`;
        }, 300);
      } else {
        playPauseBtn.textContent = '▶ Play';
        if (timerId) clearInterval(timerId);
      }
    });
  }
}


export function initTheme() {
  try {
    const saved = localStorage.getItem('healtest-theme');
    if (saved) {
      document.documentElement.dataset.theme = saved;
    }
  } catch {
    // Ignore localStorage failures
  }

  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const cur = document.documentElement.dataset.theme;
      let next = '';
      if (!cur) {
        next = 'light';
      } else if (cur === 'light') {
        next = 'dark';
      } else {
        next = '';
      }

      if (next) {
        document.documentElement.dataset.theme = next;
      } else {
        delete document.documentElement.dataset.theme;
      }

      try {
        if (next) {
          localStorage.setItem('healtest-theme', next);
        } else {
          localStorage.removeItem('healtest-theme');
        }
      } catch {
        // Ignore
      }
    });
  }
}

if (typeof window !== 'undefined') {
  window.App = {
    el,
    api,
    BADGE,
    badge,
    route,
    renderSimulationStudio,
    renderJapaneseDashboard,
    renderTestRunsView,
    renderJapaneseChanges,
    renderAIAgentView,
    renderComparisonView,
    renderRepairWorkflowView,
    renderReportsView,
    renderAnalyticsView,
    renderStorageView,
    showToast,
    updateHeader,
    renderLandingHero,
    renderOverview,
    renderDashboardWorkspace,
    renderChanges,
    renderChange,
    renderRepair,
    renderAudit,
    renderSettings,
    renderBilling,
    renderAuth,
    renderRepairPreview,
    renderActionsBar,
    openConfirmDialog,
    initConfirmDialog,
    initTheme,
    initDemoVideoModal,
  };
  window.addEventListener('hashchange', route);
  if (typeof document !== 'undefined') {
    const initApp = () => {
      initTheme();
      initConfirmDialog();
      initDemoVideoModal();
      route();
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initApp);
    } else {
      initApp();
    }
  }
}

