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
    renderChanges();
  } else if (matchedView === 'view-change') {
    renderChange(params[0]);
  } else if (matchedView === 'view-repair') {
    renderRepair(params[0]);
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
    renderOverview,
    renderChanges,
    renderChange,
    renderRepair,
    renderAudit,
    renderRepairPreview,
    renderActionsBar,
    openConfirmDialog,
    initConfirmDialog,
    initTheme,
  };
  window.addEventListener('hashchange', route);
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        initTheme();
        initConfirmDialog();
        route();
      });
    } else {
      initTheme();
      initConfirmDialog();
      route();
    }
  }
}
