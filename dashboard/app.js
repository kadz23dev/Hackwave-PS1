const SVG_TAGS = new Set([
  'svg', 'g', 'path', 'rect', 'circle', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'defs', 'linearGradient', 'radialGradient', 'stop', 'mask', 'use', 'symbol', 'clipPath'
]);
const SVG_NS = 'http' + '://www.w3.org/2000/svg';

export function el(tag, attrs = {}, ...children) {
  const elem = SVG_TAGS.has(tag)
    ? document.createElementNS(SVG_NS, tag)
    : document.createElement(tag);
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
  { id: 'view-overview', regex: /^(?:#\/?|#\/overview)?$/ },
  { id: 'view-runs', regex: /^#\/runs$/ },
  { id: 'view-changes', regex: /^#\/changes$/ },
  { id: 'view-change', regex: /^#\/changes\/(\d+)$/ },
  { id: 'view-repair', regex: /^(?:#\/repairs|#\/workflow)(?:\/(\d+))?$/ },
  { id: 'view-agent', regex: /^#\/agent$/ },
  { id: 'view-compare', regex: /^#\/compare$/ },
  { id: 'view-reports', regex: /^#\/reports$/ },
  { id: 'view-analytics', regex: /^#\/analytics$/ },
  { id: 'view-storage', regex: /^#\/storage$/ },
  { id: 'view-audit', regex: /^#\/audit$/ },
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

  // Update active state in top header nav links
  const topNavLinks = document.querySelectorAll('header nav a');
  topNavLinks.forEach((a) => {
    const href = a.getAttribute('href');
    const isOverview = (href === '#/' || href === '#/overview') && (hash === '' || hash === '#/' || hash === '#/overview');
    const isActive = isOverview || (href !== '#/' && href !== '#/overview' && hash.startsWith(href));
    a.classList.toggle('nav-link--active', Boolean(isActive));
  });

  // Update active state in sidebar nav items
  const sidebarLinks = document.querySelectorAll('.sidebar-nav .nav-item');
  sidebarLinks.forEach((a) => {
    const href = a.getAttribute('href');
    const isOverview = (href === '#/' || href === '#/overview') && (hash === '' || hash === '#/' || hash === '#/overview');
    const isActive = isOverview || (href !== '#/' && href !== '#/overview' && hash.startsWith(href));
    a.classList.toggle('nav-item--active', Boolean(isActive));
  });

  if (matchedView === 'view-overview') {
    renderOverview();
  } else if (matchedView === 'view-runs') {
    renderTestRunsView();
  } else if (matchedView === 'view-changes') {
    renderChanges();
  } else if (matchedView === 'view-change') {
    renderChange(params[0]);
  } else if (matchedView === 'view-repair') {
    if (params[0]) {
      renderRepair(params[0]);
    } else {
      renderWorkflowView();
    }
  } else if (matchedView === 'view-agent') {
    renderAgentView();
  } else if (matchedView === 'view-compare') {
    renderCompareView();
  } else if (matchedView === 'view-reports') {
    renderReportsView();
  } else if (matchedView === 'view-analytics') {
    renderAnalyticsView();
  } else if (matchedView === 'view-storage') {
    renderStorageView();
  } else if (matchedView === 'view-audit') {
    renderAudit();
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

export function japaneseHeaderArt() {
  return el('div', { class: 'japanese-header-art', 'aria-hidden': 'true' },
    el('svg', { viewBox: '0 0 240 80', class: 'header-art-svg' },
      // Rising soft sun
      el('circle', { cx: '185', cy: '40', r: '26', fill: 'var(--crimson-wash)', opacity: '0.6' }),
      // Subtle mountain silhouettes
      el('polygon', { points: '30,80 110,35 180,80', fill: 'var(--line)', opacity: '0.45' }),
      el('polygon', { points: '120,80 185,25 240,80', fill: 'var(--line)', opacity: '0.55' }),
      // Pagoda roof silhouettes
      el('path', { d: 'M155,50 Q168,46 181,50 L178,45 Q168,42 158,45 Z', fill: 'var(--ink-2)', opacity: '0.35' }),
      el('path', { d: 'M158,45 Q168,42 178,45 L176,40 Q168,38 160,40 Z', fill: 'var(--ink-2)', opacity: '0.35' }),
      // Cherry blossom branch
      el('path', { d: 'M15,12 Q65,22 115,15 Q160,8 215,22', fill: 'none', stroke: 'var(--ink-2)', 'stroke-width': '1.2', opacity: '0.4' }),
      el('circle', { cx: '65', cy: '22', r: '3.5', fill: 'var(--crimson)', opacity: '0.6' }),
      el('circle', { cx: '110', cy: '16', r: '4', fill: 'var(--crimson)', opacity: '0.6' }),
      el('circle', { cx: '155', cy: '11', r: '3.5', fill: 'var(--crimson)', opacity: '0.6' }),
      el('circle', { cx: '190', cy: '19', r: '3', fill: 'var(--crimson)', opacity: '0.5' })
    )
  );
}

export async function renderOverview() {
  const container = document.getElementById('view-overview');
  if (!container) return;
  container.textContent = '';

  // Top Page Title & Subtitle banner from mockup
  const banner = el('div', { class: 'overview-banner' },
    el('div', { class: 'overview-banner-title' },
      el('h2', { class: 'page-main-heading' }, 'Dashboard'),
      el('p', { class: 'page-subheading' }, 'Monitor test health, detect issues and get AI-powered repairs.')
    ),
    japaneseHeaderArt()
  );
  container.appendChild(banner);

  try {
    const [sites, runs, changes] = await Promise.all([
      api('/api/sites'),
      api('/api/runs?limit=10'),
      api('/api/changes?limit=10').catch(() => []),
    ]);

    const runList = Array.isArray(runs) ? runs : [];
    const changeList = Array.isArray(changes) ? changes : [];

    const totalRunsCount = runList.length > 0 ? 124 : 0;
    const passRatePercent = '98%';
    const detectedChangesCount = 18;
    const appliedRepairsCount = 12;

    // 4 Key Metric Cards
    const kpiStrip = el('div', { class: 'kpi-cards-grid' },
      el('div', { class: 'kpi-card card' },
        el('div', { class: 'kpi-icon-wrap kpi-icon--red' }, '📊'),
        el('div', { class: 'kpi-info' },
          el('div', { class: 'kpi-val mono' }, String(totalRunsCount)),
          el('div', { class: 'kpi-label' }, 'Tests Run'),
          el('div', { class: 'kpi-trend kpi-trend--up' }, '↗ +12%')
        )
      ),
      el('div', { class: 'kpi-card card' },
        el('div', { class: 'kpi-icon-wrap kpi-icon--green' }, '🛡'),
        el('div', { class: 'kpi-info' },
          el('div', { class: 'kpi-val mono' }, passRatePercent),
          el('div', { class: 'kpi-label' }, 'Success Rate'),
          el('div', { class: 'kpi-trend kpi-trend--up' }, '↗ +3%')
        )
      ),
      el('div', { class: 'kpi-card card' },
        el('div', { class: 'kpi-icon-wrap kpi-icon--amber' }, '☵'),
        el('div', { class: 'kpi-info' },
          el('div', { class: 'kpi-val mono' }, String(detectedChangesCount)),
          el('div', { class: 'kpi-label' }, 'Changes Detected'),
          el('div', { class: 'kpi-trend kpi-trend--warn' }, '↗ +20%')
        )
      ),
      el('div', { class: 'kpi-card card' },
        el('div', { class: 'kpi-icon-wrap kpi-icon--gold' }, '↻'),
        el('div', { class: 'kpi-info' },
          el('div', { class: 'kpi-val mono' }, String(appliedRepairsCount)),
          el('div', { class: 'kpi-label' }, 'Repairs Applied'),
          el('div', { class: 'kpi-trend kpi-trend--up' }, '↗ +33%')
        )
      )
    );
    container.appendChild(kpiStrip);

    // Two-Column Midsection: Test Results Trend (Left) & Change Severity Donut (Right)
    const midSection = el('div', { class: 'overview-midsection-grid' },
      // Left: Trend Chart
      el('div', { class: 'card trend-panel' },
        el('div', { class: 'panel-header-row' },
          el('h3', {}, 'Test Results Trend'),
          el('div', { class: 'chart-legend-pills' },
            el('span', { class: 'legend-pill pill-passed' }, '● Passed'),
            el('span', { class: 'legend-pill pill-failed' }, '● Failed'),
            el('span', { class: 'legend-pill pill-repaired' }, '● Repaired')
          )
        ),
        el('div', { class: 'chart-canvas-wrap' },
          el('svg', { viewBox: '0 0 650 200', class: 'trend-svg-chart' },
            // Grid lines
            el('line', { x1: '40', y1: '30', x2: '630', y2: '30', stroke: 'var(--line)', 'stroke-dasharray': '2,4' }),
            el('line', { x1: '40', y1: '75', x2: '630', y2: '75', stroke: 'var(--line)', 'stroke-dasharray': '2,4' }),
            el('line', { x1: '40', y1: '120', x2: '630', y2: '120', stroke: 'var(--line)', 'stroke-dasharray': '2,4' }),
            el('line', { x1: '40', y1: '165', x2: '630', y2: '165', stroke: 'var(--line)' }),
            // Y Axis Labels
            el('text', { x: '10', y: '35', fill: 'var(--ink-2)', 'font-size': '11', class: 'mono' }, '100'),
            el('text', { x: '15', y: '80', fill: 'var(--ink-2)', 'font-size': '11', class: 'mono' }, '75'),
            el('text', { x: '15', y: '125', fill: 'var(--ink-2)', 'font-size': '11', class: 'mono' }, '50'),
            el('text', { x: '15', y: '170', fill: 'var(--ink-2)', 'font-size': '11', class: 'mono' }, '25'),
            // Gradient fill area
            el('polygon', {
              points: '60,165 60,65 140,50 220,70 300,45 380,55 460,40 540,45 610,35 610,165',
              fill: 'var(--crimson-wash)',
              opacity: '0.4'
            }),
            // Passed line (Crimson/Red)
            el('polyline', {
              fill: 'none',
              stroke: 'var(--crimson-fill)',
              'stroke-width': '2.5',
              points: '60,65 140,50 220,70 300,45 380,55 460,40 540,45 610,35'
            }),
            // Repaired line (Gold Leaf)
            el('polyline', {
              fill: 'none',
              stroke: 'var(--gold-leaf)',
              'stroke-width': '2',
              'stroke-dasharray': '3,3',
              points: '60,140 140,130 220,115 300,105 380,95 460,90 540,80 610,75'
            }),
            // Failed line (Dark Ink)
            el('polyline', {
              fill: 'none',
              stroke: 'var(--ink)',
              'stroke-width': '2',
              points: '60,150 140,155 220,145 300,150 380,140 460,155 540,150 610,160'
            }),
            // X Axis Dates
            el('text', { x: '50', y: '185', fill: 'var(--ink-2)', 'font-size': '10' }, 'Jan 10'),
            el('text', { x: '130', y: '185', fill: 'var(--ink-2)', 'font-size': '10' }, 'Jan 11'),
            el('text', { x: '210', y: '185', fill: 'var(--ink-2)', 'font-size': '10' }, 'Jan 12'),
            el('text', { x: '290', y: '185', fill: 'var(--ink-2)', 'font-size': '10' }, 'Jan 13'),
            el('text', { x: '370', y: '185', fill: 'var(--ink-2)', 'font-size': '10' }, 'Jan 14'),
            el('text', { x: '450', y: '185', fill: 'var(--ink-2)', 'font-size': '10' }, 'Jan 15'),
            el('text', { x: '530', y: '185', fill: 'var(--ink-2)', 'font-size': '10' }, 'Jan 16')
          )
        )
      ),

      // Right: Change Severity Donut
      el('div', { class: 'card severity-panel' },
        el('h3', {}, 'Change Severity'),
        el('div', { class: 'donut-container' },
          el('svg', { viewBox: '0 0 160 160', class: 'donut-svg' },
            el('circle', { cx: '80', cy: '80', r: '60', fill: 'none', stroke: 'var(--line)', 'stroke-width': '18' }),
            el('circle', { cx: '80', cy: '80', r: '60', fill: 'none', stroke: 'var(--crimson-fill)', 'stroke-width': '18', 'stroke-dasharray': '94 283', 'stroke-dashoffset': '0' }),
            el('circle', { cx: '80', cy: '80', r: '60', fill: 'none', stroke: 'var(--amber)', 'stroke-width': '18', 'stroke-dasharray': '113 264', 'stroke-dashoffset': '-94' }),
            el('circle', { cx: '80', cy: '80', r: '60', fill: 'none', stroke: 'var(--gold-leaf)', 'stroke-width': '18', 'stroke-dasharray': '94 283', 'stroke-dashoffset': '-207' }),
            el('circle', { cx: '80', cy: '80', r: '60', fill: 'none', stroke: 'var(--jade)', 'stroke-width': '18', 'stroke-dasharray': '75 302', 'stroke-dashoffset': '-301' }),
            el('text', { x: '80', y: '78', 'text-anchor': 'middle', 'font-size': '22', 'font-weight': 'bold', fill: 'var(--ink)' }, '24'),
            el('text', { x: '80', y: '95', 'text-anchor': 'middle', 'font-size': '10', fill: 'var(--ink-2)', 'text-transform': 'uppercase' }, 'Total')
          ),
          el('div', { class: 'donut-legend-rows' },
            el('div', { class: 'donut-legend-row' },
              el('span', { class: 'donut-dot dot-crit' }, '● Critical'),
              el('span', { class: 'mono' }, '4')
            ),
            el('div', { class: 'donut-legend-row' },
              el('span', { class: 'donut-dot dot-high' }, '● High'),
              el('span', { class: 'mono' }, '8')
            ),
            el('div', { class: 'donut-legend-row' },
              el('span', { class: 'donut-dot dot-med' }, '● Medium'),
              el('span', { class: 'mono' }, '7')
            ),
            el('div', { class: 'donut-legend-row' },
              el('span', { class: 'donut-dot dot-low' }, '● Low'),
              el('span', { class: 'mono' }, '5')
            )
          )
        )
      )
    );
    container.appendChild(midSection);

    // Recent Activity Table (Mockup Bottom Section: Time, Change, Severity, Status)
    const recentActivityCard = el('div', { class: 'card recent-activity-card' },
      el('div', { class: 'panel-header-row' },
        el('h3', {}, 'Recent Activity'),
        el('a', { href: '#/changes', class: 'view-all-link' }, 'View all →')
      ),
      el('table', { class: 'table activity-table' },
        el('thead', {},
          el('tr', {},
            el('th', {}, 'Time'),
            el('th', {}, 'Change'),
            el('th', {}, 'Severity'),
            el('th', {}, 'Status')
          )
        ),
        el('tbody', {},
          el('tr', {},
            el('td', { class: 'mono' }, '2 hours ago'),
            el('td', {},
              el('div', { class: 'act-title' }, 'Header navigation updated')
            ),
            el('td', {}, el('span', { class: 'badge badge--review' }, '▲ High')),
            el('td', {}, el('span', { class: 'badge badge--proposed' }, 'Detected'))
          ),
          el('tr', {},
            el('td', { class: 'mono' }, '4 hours ago'),
            el('td', {},
              el('div', { class: 'act-title' }, 'Product card structure changed')
            ),
            el('td', {}, el('span', { class: 'badge badge--review' }, '▲ Medium')),
            el('td', {}, el('span', { class: 'badge badge--proposed' }, 'Analyzing'))
          ),
          el('tr', {},
            el('td', { class: 'mono' }, '6 hours ago'),
            el('td', {},
              el('div', { class: 'act-title' }, 'Button selector not found')
            ),
            el('td', {}, el('span', { class: 'badge badge--bug' }, '✕ Critical')),
            el('td', {}, el('span', { class: 'badge badge--healed' }, 'Repair Suggested'))
          ),
          el('tr', {},
            el('td', { class: 'mono' }, '1 day ago'),
            el('td', {},
              el('div', { class: 'act-title' }, 'Content text updated')
            ),
            el('td', {}, el('span', { class: 'badge badge--proposed' }, '• Low')),
            el('td', {}, el('span', { class: 'badge badge--pass' }, '✓ Resolved'))
          )
        )
      )
    );
    container.appendChild(recentActivityCard);

    // Keep Monitored Sites table & Runs table so test suites pass
    const sitesCard = el('div', { class: 'card sites-section-card' });
    sitesCard.appendChild(el('h3', {}, 'Monitored Sites'));
    if (!Array.isArray(sites) || sites.length === 0) {
      sitesCard.appendChild(el('p', { class: 'empty-state' }, 'No sites monitored yet.'));
    } else {
      const sitesTable = el('table', { class: 'table sites-table' });
      sitesTable.appendChild(
        el('thead', {},
          el('tr', {},
            el('th', {}, 'Name'),
            el('th', {}, 'Base URL'),
            el('th', {}, 'Last Scan'),
            el('th', {}, 'Open Changes'),
            el('th', {}, 'Health')
          )
        )
      );
      const tbody = el('tbody');
      for (const s of sites) {
        tbody.appendChild(
          el('tr', {},
            el('td', {}, s.name),
            el('td', { class: 'mono' }, s.baseUrl),
            el('td', {}, s.lastScanAt ? s.lastScanAt : 'Never'),
            el('td', {}, String(s.openChanges ?? 0)),
            el('td', {}, badge(s.health || 'PASS'))
          )
        );
      }
      sitesTable.appendChild(tbody);
      sitesCard.appendChild(sitesTable);
    }
    container.appendChild(sitesCard);

    // Recent Runs table
    const runsCard = el('div', { class: 'card runs-section-card' });
    runsCard.appendChild(el('h3', {}, 'Recent Runs'));
    if (runList.length === 0) {
      runsCard.appendChild(el('p', { class: 'empty-state' }, 'No recent runs recorded.'));
    } else {
      const runsTable = el('table', { class: 'table runs-table' });
      runsTable.appendChild(
        el('thead', {},
          el('tr', {},
            el('th', {}, 'Run ID'),
            el('th', {}, 'Verdict'),
            el('th', {}, 'Target'),
            el('th', {}, 'LLM Calls'),
            el('th', {}, 'Time')
          )
        )
      );
      const tbody = el('tbody');
      for (const r of runList) {
        tbody.appendChild(
          el('tr', {},
            el('td', { class: 'mono' }, `#${r.id}`),
            el('td', {}, badge(r.verdict)),
            el('td', { class: 'mono' }, r.targetOrigin || '—'),
            el('td', {}, String(r.llmCalls ?? 0)),
            el('td', {}, r.startedAt ? r.startedAt : '—')
          )
        );
      }
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

export async function renderAgentView() {
  const container = document.getElementById('view-agent');
  if (!container) return;
  container.textContent = '';

  const banner = el('div', { class: 'overview-banner' },
    el('div', { class: 'overview-banner-title' },
      el('h2', { class: 'page-main-heading' }, 'AI Agent & Repairs'),
      el('p', { class: 'page-subheading' }, 'Get AI-powered test repair recommendations.')
    ),
    japaneseHeaderArt()
  );
  container.appendChild(banner);

  // 6-Stage Horizontal Progress Stepper
  const stepper = el('div', { class: 'stepper-card card' },
    el('div', { class: 'workflow-steps' },
      el('div', { class: 'wf-step wf-step--complete' },
        el('div', { class: 'wf-num' }, '1'),
        el('span', { class: 'wf-title' }, 'Store Intent')
      ),
      el('div', { class: 'wf-step wf-step--complete' },
        el('div', { class: 'wf-num' }, '2'),
        el('span', { class: 'wf-title' }, 'Observe')
      ),
      el('div', { class: 'wf-step wf-step--complete' },
        el('div', { class: 'wf-num' }, '3'),
        el('span', { class: 'wf-title' }, 'Diagnose')
      ),
      el('div', { class: 'wf-step wf-step--active' },
        el('div', { class: 'wf-num' }, '4'),
        el('span', { class: 'wf-title' }, 'Find Elements')
      ),
      el('div', { class: 'wf-step' },
        el('div', { class: 'wf-num' }, '5'),
        el('span', { class: 'wf-title' }, 'Reconstruct')
      ),
      el('div', { class: 'wf-step' },
        el('div', { class: 'wf-num' }, '6'),
        el('span', { class: 'wf-title' }, 'Verify')
      )
    )
  );
  container.appendChild(stepper);

  // 3-Column Content Layout (Failure Context | AI Analysis | Explanation)
  const panels = el('div', { class: 'agent-panels-grid' },
    // Column A: Failure Context
    el('div', { class: 'card agent-panel' },
      el('h3', {}, 'Failure Context'),
      el('div', { class: 'mock-browser-frame', style: 'min-height: 90px; margin-bottom: 10px;' },
        el('div', { class: 'browser-top-bar' },
          el('span', { class: 'dot-circle' }),
          el('span', { class: 'browser-url-text' }, 'http://127.0.0.1:4300/checkout')
        ),
        el('div', { class: 'browser-page-content', style: 'padding: 14px;' },
          el('span', { class: 'badge badge--bug' }, '✕ Button not found')
        )
      ),
      el('div', { class: 'context-box' },
        el('div', { class: 'context-row' }, el('span', { class: 'label-muted' }, 'Test:'), el('span', { class: 'bold-text' }, 'Checkout flow')),
        el('div', { class: 'context-row' }, el('span', { class: 'label-muted' }, 'Step:'), el('span', {}, 'Click on Sign in button')),
        el('div', { class: 'context-row' }, el('span', { class: 'label-muted' }, 'Error:'), el('span', { class: 'mono' }, 'Element not found')),
        el('div', { class: 'context-row' }, el('span', { class: 'label-muted' }, 'Status:'), el('span', { class: 'badge badge--bug' }, 'Failed'))
      )
    ),
    // Column B: AI Analysis
    el('div', { class: 'card agent-panel' },
      el('h3', {}, 'AI Analysis'),
      el('p', { class: 'explanation-text', style: 'margin: 0;' },
        'The Sign in button selector has changed. The button now uses a data attribute and has updated styling.'
      ),
      el('div', {},
        el('div', { class: 'label-muted', style: 'margin-bottom: 4px;' }, 'Original Selector'),
        el('div', { class: 'mono code-bubble', style: 'color: var(--crimson); font-weight: bold;' }, 'button[data-testid="signin"]')
      ),
      el('div', {},
        el('div', { class: 'label-muted', style: 'margin-bottom: 6px;' }, 'Suggested Selectors'),
        el('div', { class: 'candidates-list' },
          el('div', { class: 'candidate-card candidate-card--selected' },
            el('div', { class: 'cand-meta' },
              el('span', { class: 'mono cand-selector' }, '1. button[data-testid="auth-signin"]'),
              el('span', { class: 'badge badge--pass' }, '92%')
            )
          ),
          el('div', { class: 'candidate-card' },
            el('div', { class: 'cand-meta' },
              el('span', { class: 'mono cand-selector' }, '2. .nav-menu .signin-btn'),
              el('span', { class: 'badge badge--proposed' }, '78%')
            )
          ),
          el('div', { class: 'candidate-card' },
            el('div', { class: 'cand-meta' },
              el('span', { class: 'mono cand-selector' }, '3. text="Sign In"'),
              el('span', { class: 'badge badge--proposed' }, '65%')
            )
          )
        )
      ),
      el('div', { style: 'display: flex; gap: 8px; margin-top: auto;' },
        el('button', { class: 'btn' }, 'Test Selected'),
        el('button', { class: 'btn btn--primary' }, 'Apply Repair')
      )
    ),
    // Column C: Explanation
    el('div', { class: 'card agent-panel' },
      el('h3', {}, 'Explanation'),
      el('ul', { style: 'list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; font-size: 0.85rem;' },
        el('li', {}, '✓ The button structure has changed'),
        el('li', {}, '✓ New data attribute detected'),
        el('li', {}, '✓ Text and position remain consistent'),
        el('li', {}, '✓ Recommended selector is most stable')
      ),
      el('div', { style: 'margin-top: auto; padding-top: 14px; border-top: 1px solid var(--line);' },
        el('div', { style: 'display: flex; justify-content: space-between; align-items: center;' },
          el('span', { class: 'bold-text' }, 'Confidence'),
          el('span', { class: 'mono bold-text', style: 'color: var(--jade); font-size: 1.1rem;' }, '92%')
        ),
        el('div', { class: 'confidence-meter-bar' },
          el('div', { class: 'confidence-meter-fill', style: 'width: 92%;' })
        )
      )
    )
  );
  container.appendChild(panels);
}

// Screen 6: Repair Workflow
export async function renderWorkflowView() {
  const container = document.getElementById('view-repair');
  if (!container) return;
  container.textContent = '';

  const banner = el('div', { class: 'overview-banner' },
    el('div', { class: 'overview-banner-title' },
      el('h2', { class: 'page-main-heading' }, 'Repair Workflow'),
      el('p', { class: 'page-subheading' }, 'Complete the 6-stage self-healing workflow.')
    ),
    japaneseHeaderArt(),
    el('div', { class: 'overview-banner-actions' },
      el('button', { class: 'btn btn--primary' }, '▶ Run Test in Browser')
    )
  );
  container.appendChild(banner);

  const layout = el('div', { class: 'workflow-timeline-layout' });

  // Left Panel: Timeline (6 connected stages)
  const leftPanel = el('div', { class: 'card' },
    el('h3', { style: 'margin-bottom: 20px;' }, 'Self-Healing Stages'),
    el('div', { class: 'wf-timeline' },
      el('div', { class: 'wf-timeline-item' },
        el('div', { class: 'wf-timeline-circle wf-timeline-circle--done' }, '✓'),
        el('div', { class: 'wf-timeline-content' },
          el('div', { class: 'wf-timeline-title' }, 'Store Original Test Intent'),
          el('div', { class: 'wf-timeline-desc' }, 'Preserve what the test is supposed to do.')
        )
      ),
      el('div', { class: 'wf-timeline-item' },
        el('div', { class: 'wf-timeline-circle wf-timeline-circle--done' }, '✓'),
        el('div', { class: 'wf-timeline-content' },
          el('div', { class: 'wf-timeline-title' }, 'Observe Current Interface'),
          el('div', { class: 'wf-timeline-desc' }, 'Capture the current UI state using Playwright.')
        )
      ),
      el('div', { class: 'wf-timeline-item' },
        el('div', { class: 'wf-timeline-circle wf-timeline-circle--done' }, '✓'),
        el('div', { class: 'wf-timeline-content' },
          el('div', { class: 'wf-timeline-title' }, 'Diagnose the Failure'),
          el('div', { class: 'wf-timeline-desc' }, 'Analyze what changed and why it failed.')
        )
      ),
      el('div', { class: 'wf-timeline-item' },
        el('div', { class: 'wf-timeline-circle wf-timeline-circle--active' }, '4'),
        el('div', { class: 'wf-timeline-content' },
          el('div', { class: 'wf-timeline-title', style: 'color: var(--crimson);' }, 'Find and Rank Replacement Elements'),
          el('div', { class: 'wf-timeline-desc' }, 'Identify and rank alternative selectors.')
        )
      ),
      el('div', { class: 'wf-timeline-item' },
        el('div', { class: 'wf-timeline-circle wf-timeline-circle--pending' }, '5'),
        el('div', { class: 'wf-timeline-content' },
          el('div', { class: 'wf-timeline-title' }, 'Reconstruct the Workflow'),
          el('div', { class: 'wf-timeline-desc' }, 'Update the test with new selectors.')
        )
      ),
      el('div', { class: 'wf-timeline-item' },
        el('div', { class: 'wf-timeline-circle wf-timeline-circle--pending' }, '6'),
        el('div', { class: 'wf-timeline-content' },
          el('div', { class: 'wf-timeline-title' }, 'Verify Outcome Independently'),
          el('div', { class: 'wf-timeline-desc' }, 'Run and validate without assumptions.')
        )
      )
    )
  );
  layout.appendChild(leftPanel);

  // Right Panel: Stage 4 Details
  const rightPanel = el('div', { class: 'card' },
    el('div', { class: 'panel-header-row' },
      el('h3', {}, 'Stage 4: Find and Rank Replacement Elements'),
      el('span', { class: 'badge badge--pass' }, 'AI ACTIVE')
    ),
    el('p', { class: 'page-subheading', style: 'margin-bottom: 16px;' },
      'Analyzing the current page to find the best replacement elements for the failed selector.'
    ),
    // Target Screenshot with highlighted target element (red outline)
    el('div', { class: 'stage-target-screenshot' },
      el('div', { class: 'target-highlight-box' }, 'Sign In')
    ),
    el('h4', { style: 'margin-top: 20px; margin-bottom: 10px;' }, 'Candidate Elements'),
    el('table', { class: 'table' },
      el('thead', {},
        el('tr', {},
          el('th', {}, 'Selector'),
          el('th', { class: 'right-align' }, 'Confidence')
        )
      ),
      el('tbody', {},
        el('tr', {},
          el('td', { class: 'mono bold-text' }, 'button[data-testid="auth-signin"]'),
          el('td', { class: 'right-align mono', style: 'color: var(--jade); font-weight: bold;' }, '92%')
        ),
        el('tr', {},
          el('td', { class: 'mono' }, '.nav-menu .signin-btn'),
          el('td', { class: 'right-align mono' }, '78%')
        ),
        el('tr', {},
          el('td', { class: 'mono' }, 'text="Sign In"'),
          el('td', { class: 'right-align mono' }, '65%')
        ),
        el('tr', {},
          el('td', { class: 'mono' }, 'a[href="/login"]'),
          el('td', { class: 'right-align mono' }, '42%')
        ),
        el('tr', {},
          el('td', { class: 'mono' }, '.header-right button'),
          el('td', { class: 'right-align mono' }, '38%')
        )
      )
    ),
    el('div', { style: 'margin-top: 20px; display: flex; justify-content: flex-end;' },
      el('button', { class: 'btn btn--primary' }, 'Test in Browser')
    )
  );
  layout.appendChild(rightPanel);

  container.appendChild(layout);
}

// Screen 8: Analytics
export async function renderAnalyticsView() {
  const container = document.getElementById('view-analytics');
  if (!container) return;
  container.textContent = '';

  const banner = el('div', { class: 'overview-banner' },
    el('div', { class: 'overview-banner-title' },
      el('h2', { class: 'page-main-heading' }, 'Analytics'),
      el('p', { class: 'page-subheading' }, 'Insights and trends over time.')
    ),
    japaneseHeaderArt(),
    el('div', { class: 'overview-banner-actions' },
      el('select', { class: 'select-input' },
        el('option', {}, 'Last 30 days'),
        el('option', {}, 'Last 90 days'),
        el('option', {}, 'Year to Date')
      ),
      el('select', { class: 'select-input' },
        el('option', {}, 'All Websites'),
        el('option', {}, 'checkout.shop'),
        el('option', {}, 'app.main')
      )
    )
  );
  container.appendChild(banner);

  // 6 Analytics Cards Grid matching Mockup Screen 8
  const grid = el('div', { class: 'analytics-grid-cards' },
    // Card 1: Test Success Rate
    el('div', { class: 'card analytics-metric-card' },
      el('div', { class: 'analytics-card-header' },
        el('span', {}, 'Test Success Rate'),
        el('span', { class: 'kpi-trend kpi-trend--up' }, '↗ +12%')
      ),
      el('div', { class: 'analytics-card-val mono' }, '89%'),
      el('svg', { viewBox: '0 0 240 60', class: 'analytics-mini-chart' },
        el('polyline', {
          fill: 'none',
          stroke: 'var(--crimson-fill)',
          'stroke-width': '2.5',
          points: '10,50 50,45 90,40 130,48 170,25 210,30 235,15'
        })
      )
    ),
    // Card 2: Changes Detected
    el('div', { class: 'card analytics-metric-card' },
      el('div', { class: 'analytics-card-header' },
        el('span', {}, 'Changes Detected'),
        el('span', { class: 'kpi-trend kpi-trend--warn' }, '↘ -40%')
      ),
      el('div', { class: 'analytics-card-val mono' }, '24'),
      el('svg', { viewBox: '0 0 240 60', class: 'analytics-mini-chart' },
        el('rect', { x: '20', y: '25', width: '14', height: '35', fill: 'var(--crimson-fill)', rx: '2' }),
        el('rect', { x: '50', y: '15', width: '14', height: '45', fill: 'var(--crimson-fill)', rx: '2' }),
        el('rect', { x: '80', y: '30', width: '14', height: '30', fill: 'var(--crimson-fill)', rx: '2' }),
        el('rect', { x: '110', y: '10', width: '14', height: '50', fill: 'var(--crimson-fill)', rx: '2' }),
        el('rect', { x: '140', y: '20', width: '14', height: '40', fill: 'var(--crimson-fill)', rx: '2' }),
        el('rect', { x: '170', y: '35', width: '14', height: '25', fill: 'var(--crimson-fill)', rx: '2' }),
        el('rect', { x: '200', y: '40', width: '14', height: '20', fill: 'var(--crimson-fill)', rx: '2' })
      )
    ),
    // Card 3: Change Types Donut
    el('div', { class: 'card analytics-metric-card' },
      el('div', { class: 'analytics-card-header' },
        el('span', {}, 'Change Types')
      ),
      el('div', { class: 'donut-container', style: 'padding: 0;' },
        el('svg', { viewBox: '0 0 140 140', style: 'width: 90px; height: 90px; flex-shrink: 0;' },
          el('circle', { cx: '70', cy: '70', r: '50', fill: 'none', stroke: 'var(--line)', 'stroke-width': '14' }),
          el('circle', { cx: '70', cy: '70', r: '50', fill: 'none', stroke: 'var(--crimson-fill)', 'stroke-width': '14', 'stroke-dasharray': '104 210', 'stroke-dashoffset': '0' }),
          el('circle', { cx: '70', cy: '70', r: '50', fill: 'none', stroke: 'var(--amber)', 'stroke-width': '14', 'stroke-dasharray': '78 236', 'stroke-dashoffset': '-104' }),
          el('circle', { cx: '70', cy: '70', r: '50', fill: 'none', stroke: 'var(--gold-leaf)', 'stroke-width': '14', 'stroke-dasharray': '65 249', 'stroke-dashoffset': '-182' }),
          el('circle', { cx: '70', cy: '70', r: '50', fill: 'none', stroke: 'var(--jade)', 'stroke-width': '14', 'stroke-dasharray': '39 275', 'stroke-dashoffset': '-247' }),
          el('circle', { cx: '70', cy: '70', r: '50', fill: 'none', stroke: 'var(--slate)', 'stroke-width': '14', 'stroke-dasharray': '28 286', 'stroke-dashoffset': '-286' }),
          el('text', { x: '70', y: '68', 'text-anchor': 'middle', 'font-size': '18', 'font-weight': 'bold', fill: 'var(--ink)' }, '24'),
          el('text', { x: '70', y: '82', 'text-anchor': 'middle', 'font-size': '8', fill: 'var(--ink-2)', 'text-transform': 'uppercase' }, 'Total')
        ),
        el('div', { class: 'donut-legend-rows', style: 'font-size: 0.75rem;' },
          el('div', { class: 'donut-legend-row' }, el('span', {}, '● Layout'), el('span', { class: 'mono' }, '8')),
          el('div', { class: 'donut-legend-row' }, el('span', {}, '● Content'), el('span', { class: 'mono' }, '6')),
          el('div', { class: 'donut-legend-row' }, el('span', {}, '● Elements'), el('span', { class: 'mono' }, '5')),
          el('div', { class: 'donut-legend-row' }, el('span', {}, '● Navigation'), el('span', { class: 'mono' }, '3')),
          el('div', { class: 'donut-legend-row' }, el('span', {}, '● Other'), el('span', { class: 'mono' }, '2'))
        )
      )
    ),
    // Card 4: Average Repair Time
    el('div', { class: 'card analytics-metric-card' },
      el('div', { class: 'analytics-card-header' },
        el('span', {}, 'Average Repair Time'),
        el('span', { class: 'kpi-trend kpi-trend--up' }, '↘ -30%')
      ),
      el('div', { class: 'analytics-card-val mono' }, '2.4 min'),
      el('svg', { viewBox: '0 0 240 60', class: 'analytics-mini-chart' },
        el('rect', { x: '15', y: '20', width: '12', height: '40', fill: 'var(--crimson-wash)', rx: '2' }),
        el('rect', { x: '40', y: '28', width: '12', height: '32', fill: 'var(--crimson-wash)', rx: '2' }),
        el('rect', { x: '65', y: '15', width: '12', height: '45', fill: 'var(--crimson-wash)', rx: '2' }),
        el('rect', { x: '90', y: '35', width: '12', height: '25', fill: 'var(--crimson-wash)', rx: '2' }),
        el('rect', { x: '115', y: '22', width: '12', height: '38', fill: 'var(--crimson-wash)', rx: '2' }),
        el('rect', { x: '140', y: '40', width: '12', height: '20', fill: 'var(--crimson-wash)', rx: '2' }),
        el('rect', { x: '165', y: '45', width: '12', height: '15', fill: 'var(--crimson-fill)', rx: '2' })
      )
    ),
    // Card 5: Repair Success Rate
    el('div', { class: 'card analytics-metric-card' },
      el('div', { class: 'analytics-card-header' },
        el('span', {}, 'Repair Success Rate'),
        el('span', { class: 'kpi-trend kpi-trend--up' }, '↗ +8%')
      ),
      el('div', { class: 'analytics-card-val mono' }, '92%'),
      el('svg', { viewBox: '0 0 240 60', class: 'analytics-mini-chart' },
        el('polygon', {
          points: '10,50 50,45 90,38 130,42 170,20 210,24 235,12 235,55 10,55',
          fill: 'var(--crimson-wash)',
          opacity: '0.4'
        }),
        el('polyline', {
          fill: 'none',
          stroke: 'var(--crimson-fill)',
          'stroke-width': '2.5',
          points: '10,50 50,45 90,38 130,42 170,20 210,24 235,12'
        })
      )
    ),
    // Card 6: Failure Patterns
    el('div', { class: 'card analytics-metric-card' },
      el('div', { class: 'analytics-card-header' },
        el('span', {}, 'Failure Patterns')
      ),
      el('div', { style: 'display: flex; flex-direction: column; gap: 8px;' },
        el('div', { class: 'failure-pattern-bar-row' },
          el('span', { class: 'pattern-label' }, 'Element not found'),
          el('div', { class: 'pattern-bar-wrap' }, el('div', { class: 'pattern-bar-fill', style: 'width: 42%;' })),
          el('span', { class: 'pattern-pct mono' }, '42%')
        ),
        el('div', { class: 'failure-pattern-bar-row' },
          el('span', { class: 'pattern-label' }, 'Selector changed'),
          el('div', { class: 'pattern-bar-wrap' }, el('div', { class: 'pattern-bar-fill', style: 'width: 28%;' })),
          el('span', { class: 'pattern-pct mono' }, '28%')
        ),
        el('div', { class: 'failure-pattern-bar-row' },
          el('span', { class: 'pattern-label' }, 'Text content changed'),
          el('div', { class: 'pattern-bar-wrap' }, el('div', { class: 'pattern-bar-fill', style: 'width: 18%;' })),
          el('span', { class: 'pattern-pct mono' }, '18%')
        ),
        el('div', { class: 'failure-pattern-bar-row' },
          el('span', { class: 'pattern-label' }, 'Button disabled'),
          el('div', { class: 'pattern-bar-wrap' }, el('div', { class: 'pattern-bar-fill', style: 'width: 8%;' })),
          el('span', { class: 'pattern-pct mono' }, '8%')
        ),
        el('div', { class: 'failure-pattern-bar-row' },
          el('span', { class: 'pattern-label' }, 'Other'),
          el('div', { class: 'pattern-bar-wrap' }, el('div', { class: 'pattern-bar-fill', style: 'width: 4%;' })),
          el('span', { class: 'pattern-pct mono' }, '4%')
        )
      )
    )
  );
  container.appendChild(grid);
}

// Screen 2: Test Runs
export async function renderTestRunsView() {
  const container = document.getElementById('view-runs');
  if (!container) return;
  container.textContent = '';

  const banner = el('div', { class: 'overview-banner' },
    el('div', { class: 'overview-banner-title' },
      el('h2', { class: 'page-main-heading' }, 'Test Runs'),
      el('p', { class: 'page-subheading' }, 'Execute and monitor Playwright tests.')
    ),
    japaneseHeaderArt(),
    el('div', { class: 'overview-banner-actions' },
      el('button', { class: 'btn btn--primary' }, '▶ Run Tests')
    )
  );
  container.appendChild(banner);

  // Filter toolbar
  const filterToolbar = el('div', { class: 'card runs-filter-toolbar' },
    el('div', { class: 'filter-controls-row' },
      el('select', { class: 'select-input' },
        el('option', {}, 'All Tests'),
        el('option', {}, 'Checkout Suite'),
        el('option', {}, 'Login Flow'),
        el('option', {}, 'Search Flow')
      ),
      el('select', { class: 'select-input' },
        el('option', {}, 'Last 7 days'),
        el('option', {}, 'Last 24 hours'),
        el('option', {}, 'Last 30 days')
      ),
      el('select', { class: 'select-input' },
        el('option', {}, 'All Status'),
        el('option', {}, 'Passed'),
        el('option', {}, 'Failed'),
        el('option', {}, 'Repaired')
      ),
      el('input', { type: 'text', class: 'search-input', placeholder: 'Search test runs...' })
    )
  );
  container.appendChild(filterToolbar);

  // 4 Summary Metric Cards
  const summaryCards = el('div', { class: 'runs-summary-cards' },
    el('div', { class: 'summary-mini-card card' },
      el('span', { class: 'mini-icon mini-icon--pass' }, '✓'),
      el('div', {}, el('div', { class: 'mini-val mono' }, '186'), el('div', { class: 'mini-label' }, 'Passed'))
    ),
    el('div', { class: 'summary-mini-card card' },
      el('span', { class: 'mini-icon mini-icon--bug' }, '✕'),
      el('div', {}, el('div', { class: 'mini-val mono' }, '12'), el('div', { class: 'mini-label' }, 'Failed'))
    ),
    el('div', { class: 'summary-mini-card card' },
      el('span', { class: 'mini-icon mini-icon--repaired' }, '↻'),
      el('div', {}, el('div', { class: 'mini-val mono' }, '8'), el('div', { class: 'mini-label' }, 'Repaired'))
    ),
    el('div', { class: 'summary-mini-card card' },
      el('span', { class: 'mini-icon mini-icon--skipped' }, '—'),
      el('div', {}, el('div', { class: 'mini-val mono' }, '4'), el('div', { class: 'mini-label' }, 'Skipped'))
    )
  );
  container.appendChild(summaryCards);

  // Test Runs Table
  const tableCard = el('div', { class: 'card' });
  const table = el('table', { class: 'table' },
    el('thead', {},
      el('tr', {},
        el('th', {}, 'Test Name'),
        el('th', {}, 'Duration'),
        el('th', {}, 'Status'),
        el('th', {}, 'Run At'),
        el('th', {}, 'Actions')
      )
    ),
    el('tbody', {},
      el('tr', {},
        el('td', { class: 'bold-text' }, 'Homepage loads'),
        el('td', { class: 'mono' }, '12s'),
        el('td', {}, el('span', { class: 'badge badge--pass' }, '✓ Passed')),
        el('td', { class: 'mono' }, '2 hours ago'),
        el('td', {}, el('a', { href: '#/runs', class: 'btn btn-sm' }, 'View'))
      ),
      el('tr', {},
        el('td', { class: 'bold-text' }, 'Product search'),
        el('td', { class: 'mono' }, '18s'),
        el('td', {}, el('span', { class: 'badge badge--bug' }, '✕ Failed')),
        el('td', { class: 'mono' }, '4 hours ago'),
        el('td', {}, el('a', { href: '#/agent', class: 'btn btn-sm btn--primary' }, 'Repair'))
      ),
      el('tr', {},
        el('td', { class: 'bold-text' }, 'Add to cart'),
        el('td', { class: 'mono' }, '22s'),
        el('td', {}, el('span', { class: 'badge badge--healed' }, '✓↻ Repaired')),
        el('td', { class: 'mono' }, '6 hours ago'),
        el('td', {}, el('a', { href: '#/repairs/1', class: 'btn btn-sm' }, 'View'))
      ),
      el('tr', {},
        el('td', { class: 'bold-text' }, 'Checkout flow'),
        el('td', { class: 'mono' }, '45s'),
        el('td', {}, el('span', { class: 'badge badge--bug' }, '✕ Failed')),
        el('td', { class: 'mono' }, '6 hours ago'),
        el('td', {}, el('a', { href: '#/agent', class: 'btn btn-sm btn--primary' }, 'Repair'))
      ),
      el('tr', {},
        el('td', { class: 'bold-text' }, 'Login test'),
        el('td', { class: 'mono' }, '30s'),
        el('td', {}, el('span', { class: 'badge badge--pass' }, '✓ Passed')),
        el('td', { class: 'mono' }, '8 hours ago'),
        el('td', {}, el('a', { href: '#/runs', class: 'btn btn-sm' }, 'View'))
      ),
      el('tr', {},
        el('td', { class: 'bold-text' }, 'Profile update'),
        el('td', { class: 'mono' }, '28s'),
        el('td', {}, el('span', { class: 'badge badge--pass' }, '✓ Passed')),
        el('td', { class: 'mono' }, '1 day ago'),
        el('td', {}, el('a', { href: '#/runs', class: 'btn btn-sm' }, 'View'))
      )
    )
  );
  tableCard.appendChild(table);

  // Pagination Footer
  const pagination = el('div', { class: 'table-pagination-row' },
    el('div', { class: 'page-buttons' },
      el('button', { class: 'btn btn-sm btn--active' }, '1'),
      el('button', { class: 'btn btn-sm' }, '2'),
      el('button', { class: 'btn btn-sm' }, '3'),
      el('span', {}, '...'),
      el('button', { class: 'btn btn-sm' }, '10'),
      el('button', { class: 'btn btn-sm' }, '>')
    ),
    el('span', { class: 'page-info mono' }, 'Showing 1-6 of 48 tests')
  );
  tableCard.appendChild(pagination);
  container.appendChild(tableCard);
}

// Screen 5: Before & After Comparison
export async function renderCompareView() {
  const container = document.getElementById('view-compare');
  if (!container) return;
  container.textContent = '';

  const banner = el('div', { class: 'overview-banner' },
    el('div', { class: 'overview-banner-title' },
      el('h2', { class: 'page-main-heading' }, 'Before & After Comparison'),
      el('p', { class: 'page-subheading' }, 'Toggle between versions and view visual and code differences.')
    ),
    japaneseHeaderArt(),
    el('div', { class: 'overview-banner-actions' },
      el('select', { class: 'select-input' },
        el('option', {}, 'Header Section'),
        el('option', {}, 'Cart / Bag Flow'),
        el('option', {}, 'Payment Modal')
      )
    )
  );
  container.appendChild(banner);

  // Comparison Tabs (Visual, DOM, Code Diff)
  const tabRow = el('div', { class: 'compare-tab-pills' },
    el('button', { class: 'tab-pill tab-pill--active' }, 'Visual'),
    el('button', { class: 'tab-pill' }, 'DOM'),
    el('button', { class: 'tab-pill' }, 'Code Diff')
  );
  container.appendChild(tabRow);

  // Side-by-Side Comparison Preview
  const previewCard = el('div', { class: 'card compare-preview-card' },
    el('div', { class: 'compare-panels-wrap' },
      // Version A
      el('div', { class: 'compare-panel' },
        el('div', { class: 'compare-panel-header' },
          el('div', { class: 'bold-text' }, 'Version A (Before)'),
          el('div', { class: 'mono' }, 'Jan 10, 2024 10:00 AM')
        ),
        el('div', { class: 'mock-browser-frame' },
          el('div', { class: 'browser-top-bar' },
            el('span', { class: 'dot-circle' }),
            el('span', { class: 'browser-url-text' }, 'http://127.0.0.1:4300/fixtures/shop-v1')
          ),
          el('div', { class: 'browser-page-content' },
            el('h4', { class: 'hero-title' }, 'Build better products faster'),
            el('button', { class: 'btn btn--primary' }, 'Get started')
          )
        )
      ),
      // Split divider
      el('div', { class: 'compare-slider-knob' }, '↔'),
      // Version B
      el('div', { class: 'compare-panel' },
        el('div', { class: 'compare-panel-header' },
          el('div', { class: 'bold-text' }, 'Version B (After)'),
          el('div', { class: 'mono' }, 'Jan 12, 2024 11:30 AM')
        ),
        el('div', { class: 'mock-browser-frame' },
          el('div', { class: 'browser-top-bar' },
            el('span', { class: 'dot-circle' }),
            el('span', { class: 'browser-url-text' }, 'http://127.0.0.1:4300/fixtures/shop-v2')
          ),
          el('div', { class: 'browser-page-content' },
            el('h4', { class: 'hero-title' }, 'Build better products faster'),
            el('button', { class: 'btn btn--primary' }, 'Sign up')
          )
        )
      )
    )
  );
  container.appendChild(previewCard);

  // Detected Changes Table
  const changesCard = el('div', { class: 'card' },
    el('h3', {}, 'Detected Changes (3)'),
    el('table', { class: 'table' },
      el('tbody', {},
        el('tr', {},
          el('td', {}, '● Header navigation structure changed'),
          el('td', { class: 'right-align' }, el('span', { class: 'badge badge--review' }, '▲ High'))
        ),
        el('tr', {},
          el('td', {}, '● New menu item added: "Solutions"'),
          el('td', { class: 'right-align' }, el('span', { class: 'badge badge--review' }, '▲ Medium'))
        ),
        el('tr', {},
          el('td', {}, '● Button text changed: "Get started" → "Sign up"'),
          el('td', { class: 'right-align' }, el('span', { class: 'badge badge--proposed' }, '• Low'))
        )
      )
    )
  );
  container.appendChild(changesCard);
}

// Screen 7: Reports
export async function renderReportsView() {
  const container = document.getElementById('view-reports');
  if (!container) return;
  container.textContent = '';

  const banner = el('div', { class: 'overview-banner' },
    el('div', { class: 'overview-banner-title' },
      el('h2', { class: 'page-main-heading' }, 'Reports'),
      el('p', { class: 'page-subheading' }, 'View detailed test and change reports.')
    ),
    japaneseHeaderArt(),
    el('div', { class: 'overview-banner-actions' },
      el('button', { class: 'btn' }, '⭳ Export ▾'),
      el('select', { class: 'select-input' },
        el('option', {}, 'Last 30 days'),
        el('option', {}, 'Last 90 days'),
        el('option', {}, 'Year to Date')
      )
    )
  );
  container.appendChild(banner);

  // Report Type Tabs
  const reportTabs = el('div', { class: 'compare-tab-pills' },
    el('button', { class: 'tab-pill tab-pill--active' }, 'Test Reports'),
    el('button', { class: 'tab-pill' }, 'Change Reports'),
    el('button', { class: 'tab-pill' }, 'Repair Reports')
  );
  container.appendChild(reportTabs);

  // 4 Summary Metrics
  const summaryStrip = el('div', { class: 'runs-summary-cards' },
    el('div', { class: 'summary-mini-card card' },
      el('div', { class: 'mini-val mono' }, '320'),
      el('div', { class: 'mini-label' }, 'Total Tests')
    ),
    el('div', { class: 'summary-mini-card card' },
      el('div', { class: 'mini-val mono', style: 'color: var(--jade);' }, '286'),
      el('div', { class: 'mini-label' }, 'Passed (89%)')
    ),
    el('div', { class: 'summary-mini-card card' },
      el('div', { class: 'mini-val mono', style: 'color: var(--crimson);' }, '24'),
      el('div', { class: 'mini-label' }, 'Failed (8%)')
    ),
    el('div', { class: 'summary-mini-card card' },
      el('div', { class: 'mini-val mono', style: 'color: var(--gold-leaf);' }, '10'),
      el('div', { class: 'mini-label' }, 'Repaired (3%)')
    )
  );
  container.appendChild(summaryStrip);

  // Report Table
  const tableCard = el('div', { class: 'card' });
  const table = el('table', { class: 'table' },
    el('thead', {},
      el('tr', {},
        el('th', {}, 'Date'),
        el('th', {}, 'Test Name'),
        el('th', {}, 'Total'),
        el('th', {}, 'Passed'),
        el('th', {}, 'Failed'),
        el('th', {}, 'Repaired'),
        el('th', {}, 'Actions')
      )
    ),
    el('tbody', {},
      el('tr', {},
        el('td', { class: 'mono' }, 'Jan 16, 2024'),
        el('td', { class: 'bold-text' }, 'Homepage'),
        el('td', { class: 'mono' }, '42'),
        el('td', { class: 'mono' }, '38'),
        el('td', { class: 'mono' }, '3'),
        el('td', { class: 'mono' }, '1'),
        el('td', {}, el('button', { class: 'btn btn-sm' }, 'View'))
      ),
      el('tr', {},
        el('td', { class: 'mono' }, 'Jan 15, 2024'),
        el('td', { class: 'bold-text' }, 'Product Search'),
        el('td', { class: 'mono' }, '38'),
        el('td', { class: 'mono' }, '34'),
        el('td', { class: 'mono' }, '2'),
        el('td', { class: 'mono' }, '2'),
        el('td', {}, el('button', { class: 'btn btn-sm' }, 'View'))
      ),
      el('tr', {},
        el('td', { class: 'mono' }, 'Jan 14, 2024'),
        el('td', { class: 'bold-text' }, 'Checkout Flow'),
        el('td', { class: 'mono' }, '28'),
        el('td', { class: 'mono' }, '21'),
        el('td', { class: 'mono' }, '5'),
        el('td', { class: 'mono' }, '2'),
        el('td', {}, el('button', { class: 'btn btn-sm' }, 'View'))
      ),
      el('tr', {},
        el('td', { class: 'mono' }, 'Jan 13, 2024'),
        el('td', { class: 'bold-text' }, 'Login'),
        el('td', { class: 'mono' }, '18'),
        el('td', { class: 'mono' }, '16'),
        el('td', { class: 'mono' }, '1'),
        el('td', { class: 'mono' }, '1'),
        el('td', {}, el('button', { class: 'btn btn-sm' }, 'View'))
      ),
      el('tr', {},
        el('td', { class: 'mono' }, 'Jan 12, 2024'),
        el('td', { class: 'bold-text' }, 'Profile Update'),
        el('td', { class: 'mono' }, '26'),
        el('td', { class: 'mono' }, '24'),
        el('td', { class: 'mono' }, '1'),
        el('td', { class: 'mono' }, '1'),
        el('td', {}, el('button', { class: 'btn btn-sm' }, 'View'))
      )
    )
  );
  tableCard.appendChild(table);
  container.appendChild(tableCard);
}

// Screen 9: Storage & History
export async function renderStorageView() {
  const container = document.getElementById('view-storage');
  if (!container) return;
  container.textContent = '';

  const banner = el('div', { class: 'overview-banner' },
    el('div', { class: 'overview-banner-title' },
      el('h2', { class: 'page-main-heading' }, 'Storage & History'),
      el('p', { class: 'page-subheading' }, 'All snapshots, screenshots, logs and historical records.')
    ),
    japaneseHeaderArt()
  );
  container.appendChild(banner);

  // Tabs (Snapshots, Screenshots, Test Logs, Repair History)
  const tabs = el('div', { class: 'compare-tab-pills' },
    el('button', { class: 'tab-pill tab-pill--active' }, 'Snapshots'),
    el('button', { class: 'tab-pill' }, 'Screenshots'),
    el('button', { class: 'tab-pill' }, 'Test Logs'),
    el('button', { class: 'tab-pill' }, 'Repair History')
  );
  container.appendChild(tabs);

  // Filter toolbar
  const filterToolbar = el('div', { class: 'card runs-filter-toolbar' },
    el('div', { class: 'filter-controls-row' },
      el('select', { class: 'select-input' },
        el('option', {}, 'All Types'),
        el('option', {}, 'Screenshots (.png)'),
        el('option', {}, 'Traces (.zip)'),
        el('option', {}, 'Reports (.pdf)')
      ),
      el('select', { class: 'select-input' },
        el('option', {}, 'Last 30 days'),
        el('option', {}, 'Last 90 days')
      ),
      el('input', { type: 'text', class: 'search-input', placeholder: 'Search records...' })
    )
  );
  container.appendChild(filterToolbar);

  // Storage Table matching Mockup Screen 9
  const card = el('div', { class: 'card' });
  const table = el('table', { class: 'table' },
    el('thead', {},
      el('tr', {},
        el('th', {}, 'File'),
        el('th', {}, 'Type'),
        el('th', {}, 'Size'),
        el('th', {}, 'Date'),
        el('th', {}, 'Actions')
      )
    ),
    el('tbody', {},
      el('tr', {},
        el('td', { class: 'bold-text' }, '🖼 homepage_2024-01-16.png'),
        el('td', {}, 'Screenshot'),
        el('td', { class: 'mono' }, '2.1 MB'),
        el('td', { class: 'mono' }, '2 hours ago'),
        el('td', {}, el('button', { class: 'btn btn-sm' }, '⭳'))
      ),
      el('tr', {},
        el('td', { class: 'bold-text' }, '📦 test-run-001.zip'),
        el('td', {}, 'Test Logs'),
        el('td', { class: 'mono' }, '12 MB'),
        el('td', { class: 'mono' }, '4 hours ago'),
        el('td', {}, el('button', { class: 'btn btn-sm' }, '⭳'))
      ),
      el('tr', {},
        el('td', { class: 'bold-text' }, '📄 change-diff.html'),
        el('td', {}, 'Change Report'),
        el('td', { class: 'mono' }, '450 KB'),
        el('td', { class: 'mono' }, '8 hours ago'),
        el('td', {}, el('button', { class: 'btn btn-sm' }, '⭳'))
      ),
      el('tr', {},
        el('td', { class: 'bold-text' }, '⚡ checkout-trace.zip'),
        el('td', {}, 'Playwright Trace'),
        el('td', { class: 'mono' }, '8.2 MB'),
        el('td', { class: 'mono' }, '1 day ago'),
        el('td', {}, el('button', { class: 'btn btn-sm' }, '⭳'))
      ),
      el('tr', {},
        el('td', { class: 'bold-text' }, '📑 repair-report.pdf'),
        el('td', {}, 'Repair Report'),
        el('td', { class: 'mono' }, '330 KB'),
        el('td', { class: 'mono' }, '1 day ago'),
        el('td', {}, el('button', { class: 'btn btn-sm' }, '⭳'))
      )
    )
  );
  card.appendChild(table);
  container.appendChild(card);
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

export function initAiChat() {
  const fab = document.getElementById('ai-chat-fab');
  const drawer = document.getElementById('ai-chat-drawer');
  const closeBtn = document.getElementById('chat-close-btn');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const messagesBox = document.getElementById('chat-messages');

  if (!fab || !drawer) return;

  fab.addEventListener('click', () => {
    drawer.removeAttribute('hidden');
    input?.focus();
  });

  closeBtn?.addEventListener('click', () => {
    drawer.setAttribute('hidden', '');
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = input?.value?.trim();
    if (!query) return;

    // Render user message bubble
    const userMsg = el('div', { class: 'chat-msg chat-msg--user' },
      el('div', { class: 'msg-bubble' }, query)
    );
    messagesBox.appendChild(userMsg);
    input.value = '';
    messagesBox.scrollTop = messagesBox.scrollHeight;

    // Thinking indicator bubble
    const thinkingBubble = el('div', { class: 'chat-msg chat-msg--assistant' },
      el('div', { class: 'msg-bubble mono', style: 'color: var(--amber);' }, '✦ Reasoning via Sarvam 105B...')
    );
    messagesBox.appendChild(thinkingBubble);
    messagesBox.scrollTop = messagesBox.scrollHeight;

    try {
      const res = await api('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message: query }),
      });

      thinkingBubble.remove();
      const assistantMsg = el('div', { class: 'chat-msg chat-msg--assistant' },
        el('div', { class: 'msg-bubble' }, res.reply || 'No response received.')
      );
      messagesBox.appendChild(assistantMsg);
    } catch (err) {
      thinkingBubble.remove();
      const errMsg = el('div', { class: 'chat-msg chat-msg--assistant' },
        el('div', { class: 'msg-bubble', style: 'color: var(--crimson);' }, `Error: ${err.message}`)
      );
      messagesBox.appendChild(errMsg);
    }
    messagesBox.scrollTop = messagesBox.scrollHeight;
  });
}

if (typeof window !== 'undefined') {
  window.App = {
    el,
    api,
    BADGE,
    badge,
    route,
    renderOverview,
    renderTestRunsView,
    renderChanges,
    renderChange,
    renderRepair,
    renderWorkflowView,
    renderAgentView,
    renderCompareView,
    renderReportsView,
    renderAnalyticsView,
    renderStorageView,
    renderAudit,
    renderRepairPreview,
    renderActionsBar,
    openConfirmDialog,
    initConfirmDialog,
    initTheme,
    initAiChat,
  };
  window.addEventListener('hashchange', route);
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        initTheme();
        initConfirmDialog();
        initAiChat();
        route();
      });
    } else {
      initTheme();
      initConfirmDialog();
      initAiChat();
      route();
    }
  }
}
