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

const views = [
  { id: 'view-overview', regex: /^(?:#\/?|#\/overview)?$/ },
  { id: 'view-changes', regex: /^#\/changes$/ },
  { id: 'view-change', regex: /^#\/changes\/(\d+)$/ },
  { id: 'view-repair', regex: /^#\/repairs\/(\d+)$/ },
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

  if (matchedView === 'view-overview') {
    renderOverview();
  } else if (matchedView === 'view-changes') {
    renderPlaceholder('view-changes', 'Changes');
  } else if (matchedView === 'view-change') {
    renderPlaceholder('view-change', `Change #${params[0] || ''}`);
  } else if (matchedView === 'view-repair') {
    renderPlaceholder('view-repair', `Repair #${params[0] || ''}`);
  } else if (matchedView === 'view-audit') {
    renderPlaceholder('view-audit', 'Audit Log');
  }
}

function renderPlaceholder(viewId, title) {
  const container = document.getElementById(viewId);
  if (!container) return;
  container.textContent = '';
  container.appendChild(el('h2', {}, title));
  container.appendChild(el('p', { class: 'coming-soon' }, 'Coming soon'));
}

export async function renderOverview() {
  const container = document.getElementById('view-overview');
  if (!container) return;
  container.textContent = '';
  container.appendChild(el('h2', {}, 'Overview'));

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
  window.App = { el, api, BADGE, badge, route, renderOverview, initTheme };
  window.addEventListener('hashchange', route);
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        initTheme();
        route();
      });
    } else {
      initTheme();
      route();
    }
  }
}
