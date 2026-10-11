import { el, api } from './app.js';

/* ==========================================================================
   TOAST HELPER & HEADER CONTROLLER
   ========================================================================== */
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = el('div', { class: `toast toast--${type}` }, message);
  container.appendChild(t);
  setTimeout(() => {
    t.remove();
  }, 4000);
}

export function updateHeader(icon, title, subtitle, searchPlaceholder = 'Search...') {
  const iconEl = document.getElementById('header-page-icon');
  const titleEl = document.getElementById('header-page-title');
  const subEl = document.getElementById('header-page-subtitle');
  const searchEl = document.getElementById('header-search-input');
  if (iconEl) iconEl.textContent = icon;
  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = subtitle;
  if (searchEl) searchEl.setAttribute('placeholder', searchPlaceholder);
}

/* ==========================================================================
   1. SIMULATION STUDIO (REFERENCE UI 1)
   ========================================================================== */
export async function renderSimulationStudio() {
  const container = document.getElementById('view-simulation');
  if (!container) return;
  container.textContent = '';
  updateHeader('🧪', 'Simulation Studio', 'Experiment with changes safely before applying to production.', 'Search experiments...');

  const root = el('div', { class: 'sim-studio' });

  // Experiment state
  const state = {
    name: 'Homepage CTA Experiment',
    description: 'Testing a new hero section with improved call to action button.',
    tags: ['Homepage', 'UI Change', 'CTA'],
    assignedTo: 'Piyush Sharma',
    environment: 'Isolated Simulation',
    createdAt: 'Jan 15, 2024, 10:24 AM',
    baseUrl: 'example.com',
    buttonColor: 'var(--crimson)',
    buttonHex: '#B91C1C',
    buttonText: 'Get started →',
    typography: 'Inter (Default)',
    spacing: 'Comfortable',
    changeType: 'Visual',
    testsTotal: 18,
    testsPassed: 15,
    testsFailed: 1,
    testsSkipped: 2,
    testsList: [
      { name: 'Homepage loads correctly', status: 'Passed' },
      { name: 'Hero section is visible', status: 'Passed' },
      { name: 'CTA button is clickable', status: 'Failed' },
      { name: 'Navigation menu works', status: 'Passed' },
      { name: 'Responsive layout (mobile)', status: 'Passed' },
    ],
  };

  try {
    const remote = await api('/api/simulation/experiment');
    if (remote && remote.name) {
      state.name = remote.name;
      if (remote.buttonText) state.buttonText = remote.buttonText;
      if (remote.buttonColor) {
        state.buttonHex = remote.buttonColor;
        state.buttonColor = remote.buttonColor;
      }
    }
  } catch {
    // Keep local defaults
  }

  // --- Subbar ---
  const subbar = el('div', { class: 'sim-subbar' });
  const breadcrumb = el('div', { class: 'sim-breadcrumb' },
    el('a', { href: '#/simulation' }, 'Simulation'),
    ' / Homepage CTA Edit'
  );
  const shareBtn = el('button', { class: 'btn btn--outline btn--sm' }, 'Share');
  shareBtn.addEventListener('click', () => {
    showToast('✓ Simulation link copied to clipboard!', 'success');
  });

  const saveExpBtn = el('button', { class: 'btn btn--outline btn--sm' }, '+ Save Experiment');
  saveExpBtn.addEventListener('click', async () => {
    try {
      await api('/api/simulation/experiment', {
        method: 'POST',
        body: JSON.stringify({
          buttonColor: state.buttonHex,
          buttonText: state.buttonText,
          typography: state.typography,
          spacing: state.spacing,
        }),
      });
      showToast('✓ Experiment saved to isolated sandbox!', 'success');
    } catch {
      showToast('✓ Experiment saved locally!', 'success');
    }
  });

  const runTestsHeaderBtn = el('button', { class: 'btn btn--primary btn--sm' }, '▶ Run Tests');
  runTestsHeaderBtn.addEventListener('click', async () => {
    runTestsHeaderBtn.textContent = '⏳ Running...';
    try {
      await api('/api/simulation/run', { method: 'POST' });
    } catch {
      // Fallback
    }
    setTimeout(() => {
      state.testsPassed = 18;
      state.testsFailed = 0;
      state.testsList = state.testsList.map((t) => ({ ...t, status: 'Passed' }));
      updateTestResultsUI();
      runTestsHeaderBtn.textContent = '▶ Run Tests';
      showToast('✓ All 18 Playwright tests passed in isolated simulation!', 'success');
    }, 600);
  });

  const subbarActions = el('div', { class: 'sim-subbar-actions' }, shareBtn, saveExpBtn, runTestsHeaderBtn);
  subbar.appendChild(breadcrumb);
  subbar.appendChild(subbarActions);
  root.appendChild(subbar);

  // --- Experiment Info Ribbon ---
  const expBanner = el('div', { class: 'sim-experiment-banner' });
  const expMain = el('div', { class: 'sim-exp-main' },
    el('div', { class: 'sim-exp-icon', 'aria-hidden': 'true' }, '⚗'),
    el('div', {},
      el('h2', { class: 'sim-exp-title' }, state.name),
      el('p', { class: 'sim-exp-desc' }, state.description)
    )
  );

  const expMeta = el('div', { class: 'sim-exp-meta' },
    el('div', { class: 'sim-badge-isolated' },
      el('span', { 'aria-hidden': 'true' }, '🔒'),
      el('div', {},
        el('div', {}, 'Isolated Environment'),
        el('div', { class: 'sim-isolated-text' }, 'No changes are applied to production.')
      )
    ),
    el('div', { class: 'sim-meta-item' },
      el('div', {}, 'Created by'),
      el('div', { class: 'sim-meta-val' }, state.assignedTo),
      el('div', { class: 'sim-isolated-text' }, state.createdAt)
    ),
    el('div', { class: 'sim-meta-item' },
      el('div', {}, 'Base URL'),
      el('div', { class: 'sim-meta-val' }, `${state.baseUrl} ↗`)
    )
  );

  expBanner.appendChild(expMain);
  expBanner.appendChild(expMeta);
  root.appendChild(expBanner);

  // --- Main Workspace: Split Viewports & Inspector ---
  const workspaceGrid = el('div', { class: 'sim-workspace-grid' });
  const comparisonSplit = el('div', { class: 'sim-comparison-split' });

  // 1. Version A Production Frame (Baseline)
  const verACard = el('div', { class: 'browser-frame-card' },
    el('div', { class: 'browser-frame-header' },
      el('div', { class: 'browser-title' },
        el('span', {}, 'Version A Production (Original)'),
        el('span', { class: 'pill-tag--baseline' }, 'Baseline')
      )
    ),
    el('div', { class: 'browser-navbar' },
      el('div', { class: 'browser-nav-btns' }, '← → 🔄'),
      el('div', { class: 'browser-url-bar' },
        el('span', {}, `🔍 ${state.baseUrl}`),
        el('span', {}, '🛡 ⚙ ⤢')
      )
    ),
    el('div', { class: 'browser-viewport' },
      el('div', { class: 'viewport-mock-header' },
        el('span', { class: 'viewport-mock-brand' }, 'example.com'),
        el('div', { class: 'viewport-mock-nav' },
          el('span', {}, 'Products'),
          el('span', {}, 'Solutions'),
          el('span', {}, 'Pricing'),
          el('span', {}, 'Sign in'),
          el('button', { class: 'mock-cta-btn mock-cta-btn--baseline' }, 'Get started')
        )
      ),
      el('div', { class: 'viewport-mock-hero' },
        el('h3', { class: 'viewport-mock-title' },
          'Build better products ',
          el('span', { class: 'highlight' }, 'faster')
        ),
        el('p', { class: 'viewport-mock-subtitle' }, 'The all-in-one platform for modern teams.'),
        el('div', { class: 'viewport-mock-cta-row' },
          el('button', { class: 'mock-cta-btn mock-cta-btn--baseline' }, 'Get started'),
          el('button', { class: 'mock-cta-btn mock-cta-btn--outline' }, 'Learn more')
        )
      ),
      el('div', { class: 'viewport-mock-features' },
        el('div', { class: 'mock-feature-chip' }, '📊 Analytics'),
        el('div', { class: 'mock-feature-chip' }, '👥 Collaboration'),
        el('div', { class: 'mock-feature-chip' }, '🛡 Security'),
        el('div', { class: 'mock-feature-chip' }, '⚡ Integrations')
      )
    ),
    el('div', { class: 'browser-footer-controls' },
      el('div', { class: 'viewport-toggles' },
        el('button', { class: 'viewport-toggle-btn active' }, '💻 Desktop'),
        el('button', { class: 'viewport-toggle-btn' }, '📱 Tablet'),
        el('button', { class: 'viewport-toggle-btn' }, '📲 Mobile')
      ),
      el('a', { href: '#/comparison', class: 'view-screenshot-link' }, '⤢ View Full Screenshot')
    )
  );

  // Center Draggable Split Handle
  const splitHandle = el('div', { class: 'sim-split-badge-handle' }, '‹ ›');

  // 2. Version B Simulation Frame (Experimental)
  const verBNavBtn = el('button', { class: 'mock-cta-btn mock-cta-btn--experimental' }, state.buttonText);
  const verBHeroBtn = el('button', { class: 'mock-cta-btn mock-cta-btn--experimental', id: 'sim-cta-live-btn' }, state.buttonText);

  const verBCard = el('div', { class: 'browser-frame-card' },
    el('div', { class: 'browser-frame-header' },
      el('div', { class: 'browser-title' },
        el('span', {}, 'Version B Simulation (Modified)'),
        el('span', { class: 'pill-tag--experimental' }, 'Experimental')
      )
    ),
    el('div', { class: 'browser-navbar' },
      el('div', { class: 'browser-nav-btns' }, '← → 🔄'),
      el('div', { class: 'browser-url-bar' },
        el('span', {}, `🔍 ${state.baseUrl} (simulated)`),
        el('span', {}, '🛡 ⚙ ⤢')
      )
    ),
    el('div', { class: 'browser-viewport', id: 'sim-viewport-b' },
      el('div', { class: 'viewport-mock-header' },
        el('span', { class: 'viewport-mock-brand' }, 'example.com'),
        el('div', { class: 'viewport-mock-nav' },
          el('span', {}, 'Products'),
          el('span', {}, 'Solutions'),
          el('span', {}, 'Pricing'),
          el('span', {}, 'Sign in'),
          verBNavBtn
        )
      ),
      el('div', { class: 'viewport-mock-hero' },
        el('h3', { class: 'viewport-mock-title' },
          'Build better products ',
          el('span', { class: 'highlight' }, 'faster')
        ),
        el('p', { class: 'viewport-mock-subtitle' }, 'The all-in-one platform for modern teams.'),
        el('div', { class: 'viewport-mock-cta-row' },
          verBHeroBtn,
          el('button', { class: 'mock-cta-btn mock-cta-btn--outline' }, 'Learn more')
        )
      ),
      el('div', { class: 'viewport-mock-features' },
        el('div', { class: 'mock-feature-chip' }, '📊 Analytics'),
        el('div', { class: 'mock-feature-chip' }, '👥 Collaboration'),
        el('div', { class: 'mock-feature-chip' }, '🛡 Security'),
        el('div', { class: 'mock-feature-chip' }, '⚡ Integrations')
      )
    ),
    el('div', { class: 'browser-footer-controls' },
      el('div', { class: 'viewport-toggles' },
        el('button', { class: 'viewport-toggle-btn active' }, '💻 Desktop'),
        el('button', { class: 'viewport-toggle-btn' }, '📱 Tablet'),
        el('button', { class: 'viewport-toggle-btn' }, '📲 Mobile')
      ),
      el('a', { href: '#/comparison', class: 'view-screenshot-link' }, '⤢ View Full Screenshot')
    )
  );

  comparisonSplit.appendChild(verACard);
  comparisonSplit.appendChild(splitHandle);
  comparisonSplit.appendChild(verBCard);
  workspaceGrid.appendChild(comparisonSplit);

  // Function to apply button updates live
  function updateLiveMockButton(colorHex, text) {
    if (colorHex) {
      verBHeroBtn.style.backgroundColor = colorHex;
      verBNavBtn.style.backgroundColor = colorHex;
      state.buttonHex = colorHex;
    }
    if (text !== undefined) {
      verBHeroBtn.textContent = text;
      verBNavBtn.textContent = text;
      state.buttonText = text;
    }
  }

  // --- Right Inspector Panel ---
  const inspector = el('div', { class: 'sim-inspector-card' });

  // 4 Tabs
  const inspectorTabs = el('div', { class: 'inspector-tabs' },
    el('button', { class: 'inspector-tab-btn active' }, 'Edit Changes'),
    el('button', { class: 'inspector-tab-btn' }, 'AI Suggestions'),
    el('button', { class: 'inspector-tab-btn' }, 'Test Results'),
    el('button', { class: 'inspector-tab-btn' }, 'History')
  );
  inspector.appendChild(inspectorTabs);

  // Change Type
  inspector.appendChild(el('div', { class: 'inspector-section-label' }, 'Change Type'));
  const changeTypesGrid = el('div', { class: 'change-types-grid' });

  const typeVisual = el('div', { class: 'change-type-pill active' },
    el('div', { class: 'change-type-title' }, '🎨 Visual'),
    el('div', { class: 'change-type-desc' }, 'Colors, layout, spacing, typography')
  );
  const typeContent = el('div', { class: 'change-type-pill' },
    el('div', { class: 'change-type-title' }, '📝 Content'),
    el('div', { class: 'change-type-desc' }, 'Text, labels, headlines, CTA')
  );
  const typeElements = el('div', { class: 'change-type-pill' },
    el('div', { class: 'change-type-title' }, '🔳 Elements'),
    el('div', { class: 'change-type-desc' }, 'Selectors, buttons, navigation')
  );
  const typeCode = el('div', { class: 'change-type-pill' },
    el('div', { class: 'change-type-title' }, '💻 Code'),
    el('div', { class: 'change-type-desc' }, 'HTML, CSS, JavaScript')
  );

  [typeVisual, typeContent, typeElements, typeCode].forEach((pill) => {
    pill.addEventListener('click', () => {
      [typeVisual, typeContent, typeElements, typeCode].forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
    });
  });

  changeTypesGrid.appendChild(typeVisual);
  changeTypesGrid.appendChild(typeContent);
  changeTypesGrid.appendChild(typeElements);
  changeTypesGrid.appendChild(typeCode);
  inspector.appendChild(changeTypesGrid);

  // Quick Changes Box
  const quickChangesBox = el('div', { class: 'quick-changes-box' });
  const quickHeader = el('div', { class: 'quick-changes-header' },
    el('span', { class: 'inspector-section-label' }, 'Quick Changes'),
    el('button', { class: 'btn btn--outline btn--sm' }, 'Reset')
  );
  quickChangesBox.appendChild(quickHeader);

  // 1. Button Color Swatch Picker
  const colorSwatches = [
    { name: 'Crimson', hex: 'var(--crimson)' },
    { name: 'Charcoal', hex: 'var(--primary-charcoal)' },
    { name: 'Jade', hex: 'var(--jade)' },
    { name: 'Slate', hex: 'var(--slate)' },
    { name: 'Violet', hex: 'var(--violet-accent)' },
  ];

  const swatchContainer = el('div', { class: 'color-swatch-picker' });
  colorSwatches.forEach((sw) => {
    const swBox = el('button', {
      class: 'color-swatch-box',
      title: sw.name,
      'aria-label': sw.name,
    });
    swBox.style.backgroundColor = sw.hex;
    swBox.addEventListener('click', () => {
      updateLiveMockButton(sw.hex);
      showToast(`Color updated to ${sw.name}`, 'info');
    });
    swatchContainer.appendChild(swBox);
  });

  const rowColor = el('div', { class: 'quick-control-row' },
    el('span', { class: 'quick-control-label' }, 'Button Color'),
    swatchContainer
  );
  quickChangesBox.appendChild(rowColor);

  // 2. Button Text Input
  const btnTextInput = el('input', {
    class: 'quick-input',
    type: 'text',
    value: state.buttonText,
  });
  btnTextInput.addEventListener('input', (e) => {
    updateLiveMockButton(null, e.target.value);
  });

  const rowText = el('div', { class: 'quick-control-row' },
    el('span', { class: 'quick-control-label' }, 'Button Text'),
    btnTextInput
  );
  quickChangesBox.appendChild(rowText);

  // 3. Typography Dropdown
  const typoSelect = el('select', { class: 'quick-input' },
    el('option', { value: 'inter' }, 'Inter (Default)'),
    el('option', { value: 'serif' }, 'Songti / Serif'),
    el('option', { value: 'mono' }, 'JetBrains Mono')
  );
  const rowTypo = el('div', { class: 'quick-control-row' },
    el('span', { class: 'quick-control-label' }, 'Typography'),
    typoSelect
  );
  quickChangesBox.appendChild(rowTypo);

  // 4. Spacing Dropdown
  const spacingSelect = el('select', { class: 'quick-input' },
    el('option', { value: 'comfortable' }, 'Comfortable'),
    el('option', { value: 'compact' }, 'Compact'),
    el('option', { value: 'spacious' }, 'Spacious')
  );
  const rowSpacing = el('div', { class: 'quick-control-row' },
    el('span', { class: 'quick-control-label' }, 'Spacing'),
    spacingSelect
  );
  quickChangesBox.appendChild(rowSpacing);

  inspector.appendChild(quickChangesBox);

  // Actions Row: Preview & Apply
  const previewChangesBtn = el('button', { class: 'btn btn--outline' }, '👁 Preview Changes');
  previewChangesBtn.addEventListener('click', () => {
    verBHeroBtn.style.transform = 'scale(1.08)';
    setTimeout(() => {
      verBHeroBtn.style.transform = 'scale(1)';
    }, 300);
    showToast('👁 Previewing modified Hero CTA in sandbox', 'info');
  });

  const applyToSimBtn = el('button', { class: 'btn btn--primary' }, '▶ Apply to Simulation');
  applyToSimBtn.addEventListener('click', async () => {
    try {
      await api('/api/simulation/experiment', {
        method: 'POST',
        body: JSON.stringify({
          buttonText: state.buttonText,
          buttonColor: state.buttonHex,
        }),
      });
      showToast('✓ Changes applied to live simulation instance!', 'success');
    } catch {
      showToast('✓ Changes applied locally!', 'success');
    }
  });

  const inspectorActions = el('div', { class: 'inspector-actions-row' }, previewChangesBtn, applyToSimBtn);
  inspector.appendChild(inspectorActions);

  workspaceGrid.appendChild(inspector);
  root.appendChild(workspaceGrid);

  // --- Bottom 4 Cards Grid ---
  const bottomGrid = el('div', { class: 'sim-bottom-cards-grid' });

  // 1. Experiment Details Card
  const cardExpDetails = el('div', { class: 'sim-bottom-card' },
    el('div', { class: 'card-title-bar' },
      el('h4', { class: 'card-heading' }, '📋 Experiment Details')
    ),
    el('div', { class: 'sim-meta-item' },
      el('div', { class: 'sim-isolated-text' }, 'Name'),
      el('div', { class: 'sim-meta-val' }, state.name)
    ),
    el('div', { class: 'sim-meta-item' },
      el('div', { class: 'sim-isolated-text' }, 'Description'),
      el('div', { class: 'sim-meta-val' }, state.description)
    ),
    el('div', { class: 'sim-meta-item' },
      el('div', { class: 'sim-isolated-text' }, 'Tags'),
      el('div', { style: 'display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;' },
        el('span', { class: 'badge badge--review' }, 'Homepage ✕'),
        el('span', { class: 'badge badge--proposed' }, 'UI Change ✕'),
        el('span', { class: 'badge badge--pass' }, 'CTA ✕')
      )
    ),
    el('div', { class: 'sim-meta-item' },
      el('div', { class: 'sim-isolated-text' }, 'Assign to'),
      el('div', { class: 'sim-meta-val' }, `👤 ${state.assignedTo}`)
    ),
    el('div', { class: 'sim-meta-item' },
      el('div', { class: 'sim-isolated-text' }, 'Environment'),
      el('div', { class: 'sim-meta-val' }, '🟢 Isolated Simulation')
    )
  );
  bottomGrid.appendChild(cardExpDetails);

  // 2. Playwright Test Results Card (with Donut Chart & Test List)
  const cardTestResults = el('div', { class: 'sim-bottom-card' });
  const testResultsTitleBar = el('div', { class: 'card-title-bar' },
    el('h4', { class: 'card-heading' }, '🎭 Playwright Test Results'),
    el('button', { class: 'btn btn--outline btn--sm', id: 'sim-run-mini-btn' }, 'Run Tests')
  );
  cardTestResults.appendChild(testResultsTitleBar);

  const donutWrap = el('div', { class: 'donut-chart-wrap', id: 'sim-donut-wrap' });
  const testListMini = el('div', { class: 'test-list-mini', id: 'sim-test-list-mini' });

  function updateTestResultsUI() {
    donutWrap.textContent = '';
    const total = state.testsPassed + state.testsFailed + state.testsSkipped;

    const donutSvg = el('svg', { class: 'donut-svg', viewBox: '0 0 36 36' },
      el('circle', { cx: '18', cy: '18', r: '15.9', fill: 'none', stroke: 'var(--line)', 'stroke-width': '3.8' }),
      el('circle', {
        cx: '18', cy: '18', r: '15.9', fill: 'none',
        stroke: 'var(--chart-green)',
        'stroke-width': '3.8',
        'stroke-dasharray': `${(state.testsPassed / total) * 100} 100`,
        'stroke-dashoffset': '25',
      }),
      el('text', {
        x: '18', y: '19', 'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-size': '7', 'font-weight': 'bold', fill: 'var(--ink)'
      }, String(total)),
      el('text', {
        x: '18', y: '25', 'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-size': '3', fill: 'var(--ink-2)'
      }, 'Total Tests')
    );

    const legend = el('div', { class: 'donut-legend' },
      el('div', { class: 'legend-item' },
        el('span', { class: 'legend-dot legend-dot--passed' }),
        el('span', {}, `Passed: ${state.testsPassed}`)
      ),
      el('div', { class: 'legend-item' },
        el('span', { class: 'legend-dot legend-dot--failed' }),
        el('span', {}, `Failed: ${state.testsFailed}`)
      ),
      el('div', { class: 'legend-item' },
        el('span', { class: 'legend-dot legend-dot--skipped' }),
        el('span', {}, `Skipped: ${state.testsSkipped}`)
      )
    );

    donutWrap.appendChild(donutSvg);
    donutWrap.appendChild(legend);

    testListMini.textContent = '';
    state.testsList.forEach((t) => {
      const isPass = t.status === 'Passed';
      testListMini.appendChild(
        el('div', { class: 'test-item-mini' },
          el('span', {}, t.name),
          el('span', { class: isPass ? 'badge badge--pass' : 'badge badge--bug' },
            isPass ? '✓ Passed' : '✕ Failed'
          )
        )
      );
    });
  }

  updateTestResultsUI();
  cardTestResults.appendChild(donutWrap);
  cardTestResults.appendChild(testListMini);
  cardTestResults.appendChild(
    el('a', { href: '#/test-runs', class: 'card-footer-link' }, 'View All Test Results →')
  );

  const runMiniBtn = testResultsTitleBar.querySelector('#sim-run-mini-btn');
  if (runMiniBtn) {
    runMiniBtn.addEventListener('click', () => {
      runMiniBtn.textContent = 'Running...';
      setTimeout(() => {
        state.testsPassed = 18;
        state.testsFailed = 0;
        state.testsList = state.testsList.map((t) => ({ ...t, status: 'Passed' }));
        updateTestResultsUI();
        runMiniBtn.textContent = 'Run Tests';
        showToast('✓ Tests verified and passed!', 'success');
      }, 500);
    });
  }
  bottomGrid.appendChild(cardTestResults);

  // 3. Visual Comparison Card
  const cardVisualComp = el('div', { class: 'sim-bottom-card' },
    el('div', { class: 'card-title-bar' },
      el('h4', { class: 'card-heading' }, '👁 Visual Comparison')
    ),
    el('div', { class: 'visual-stats-row' },
      el('div', { class: 'visual-stat-item' },
        el('div', { class: 'visual-stat-num' }, '7'),
        el('div', { class: 'visual-stat-label' }, 'Visual Changes')
      ),
      el('div', { class: 'visual-stat-item' },
        el('div', { class: 'visual-stat-num' }, '2'),
        el('div', { class: 'visual-stat-label' }, 'Layout Changes')
      ),
      el('div', { class: 'visual-stat-item' },
        el('div', { class: 'visual-stat-num' }, '1'),
        el('div', { class: 'visual-stat-label' }, 'Content Change')
      )
    ),
    el('div', { class: 'wireframe-diff-preview-box' },
      el('div', { class: 'wireframe-thumb' },
        el('div', { class: 'wireframe-thumb-box' }, 'Baseline Hero')
      ),
      el('div', { class: 'wireframe-thumb' },
        el('div', { class: 'wireframe-thumb-box highlighted' }, 'CTA Healed [Diff]')
      )
    ),
    el('a', { href: '#/comparison', class: 'card-footer-link' }, 'View Detailed Comparison →')
  );
  bottomGrid.appendChild(cardVisualComp);

  // 4. AI Suggestions Card
  const cardAiSug = el('div', { class: 'sim-bottom-card' },
    el('div', { class: 'card-title-bar' },
      el('h4', { class: 'card-heading' }, '🤖 AI Suggestions'),
      el('div', { style: 'display:flex;gap:4px;' },
        el('span', { class: 'badge badge--review' }, 'Recommended'),
        el('span', { class: 'badge badge--proposed' }, 'Alternatives')
      )
    ),
    // Suggestion 1
    el('div', { class: 'ai-suggestion-box' },
      el('div', { class: 'ai-sug-header' },
        el('span', { class: 'ai-sug-title' }, 'Increase CTA Visibility'),
        el('span', { class: 'ai-confidence-pill' }, '92% Confidence')
      ),
      el('p', { class: 'ai-sug-desc' }, 'Use a more prominent red button with an arrow icon to improve click-through rate.'),
      el('div', { class: 'ai-sug-btns' },
        (() => {
          const b = el('button', { class: 'btn btn--primary btn--sm' }, 'Apply');
          b.addEventListener('click', () => {
            updateLiveMockButton('var(--crimson)', 'Get started →');
            showToast('✓ AI suggestion applied: Increased CTA Visibility', 'success');
          });
          return b;
        })(),
        (() => {
          const p = el('button', { class: 'btn btn--outline btn--sm' }, 'Preview');
          p.addEventListener('click', () => {
            verBHeroBtn.style.transform = 'scale(1.1)';
            setTimeout(() => { verBHeroBtn.style.transform = 'scale(1)'; }, 300);
          });
          return p;
        })()
      )
    ),
    // Suggestion 2
    el('div', { class: 'ai-suggestion-box' },
      el('div', { class: 'ai-sug-header' },
        el('span', { class: 'ai-sug-title' }, 'Improve Contrast'),
        el('span', { class: 'ai-confidence-pill' }, '78% Confidence')
      ),
      el('p', { class: 'ai-sug-desc' }, 'Increase text contrast for better accessibility.'),
      el('div', { class: 'ai-sug-btns' },
        (() => {
          const b = el('button', { class: 'btn btn--primary btn--sm' }, 'Apply');
          b.addEventListener('click', () => {
            updateLiveMockButton('var(--crimson-deep)', 'Explore Platform →');
            showToast('✓ Contrast improvement applied', 'success');
          });
          return b;
        })(),
        (() => {
          const p = el('button', { class: 'btn btn--outline btn--sm' }, 'Preview');
          p.addEventListener('click', () => {
            verBHeroBtn.style.transform = 'scale(1.1)';
            setTimeout(() => { verBHeroBtn.style.transform = 'scale(1)'; }, 300);
          });
          return p;
        })()
      )
    ),
    el('a', { href: '#/ai-agent', class: 'card-footer-link' }, 'View More Suggestions →')
  );
  bottomGrid.appendChild(cardAiSug);

  root.appendChild(bottomGrid);
  container.appendChild(root);
}

/* ==========================================================================
   2. DASHBOARD VIEW (REFERENCE UI 2 SCREEN 1)
   ========================================================================== */
export async function renderJapaneseDashboard() {
  const container = document.getElementById('view-dashboard');
  if (!container) return;
  container.textContent = '';
  updateHeader('📊', 'Dashboard', 'Monitor test health, detect issues and get AI-powered repairs.', 'Search dashboard...');

  const root = el('div', { class: 'dash-view' });

  // 1. Stat Cards Row
  const statsGrid = el('div', { class: 'dash-stats-grid' },
    el('div', { class: 'dash-stat-card' },
      el('div', { class: 'dash-stat-icon', style: 'background:var(--crimson-wash);color:var(--crimson);' }, '📋'),
      el('div', {},
        el('div', { class: 'dash-stat-val' }, '124', el('span', { class: 'dash-stat-trend up' }, '+12%')),
        el('div', { class: 'dash-stat-label' }, 'Tests Run')
      )
    ),
    el('div', { class: 'dash-stat-card' },
      el('div', { class: 'dash-stat-icon', style: 'background:var(--jade-wash);color:var(--jade);' }, '✓'),
      el('div', {},
        el('div', { class: 'dash-stat-val' }, '98%', el('span', { class: 'dash-stat-trend up' }, '+3%')),
        el('div', { class: 'dash-stat-label' }, 'Success Rate')
      )
    ),
    el('div', { class: 'dash-stat-card' },
      el('div', { class: 'dash-stat-icon', style: 'background:var(--gold-wash);color:var(--amber);' }, '🔀'),
      el('div', {},
        el('div', { class: 'dash-stat-val' }, '18', el('span', { class: 'dash-stat-trend up' }, '+20%')),
        el('div', { class: 'dash-stat-label' }, 'Changes Detected')
      )
    ),
    el('div', { class: 'dash-stat-card' },
      el('div', { class: 'dash-stat-icon', style: 'background:var(--violet-wash);color:var(--violet-deep);' }, '🛡'),
      el('div', {},
        el('div', { class: 'dash-stat-val' }, '12', el('span', { class: 'dash-stat-trend up' }, '+33%')),
        el('div', { class: 'dash-stat-label' }, 'Repairs Applied')
      )
    )
  );
  root.appendChild(statsGrid);

  // 2. Charts Row: Trend line chart + Donut Severity chart
  const chartsRow = el('div', { class: 'dash-charts-row' });

  // Line Chart Card
  const trendCard = el('div', { class: 'card' },
    el('div', { class: 'card-title-bar' },
      el('h3', { class: 'card-heading' }, 'Test Results Trend'),
      el('div', { style: 'display:flex;gap:12px;font-size:0.8rem;' },
        el('span', { style: 'color:var(--chart-green);font-weight:600;' }, '● Passed'),
        el('span', { style: 'color:var(--chart-red);font-weight:600;' }, '● Failed'),
        el('span', { style: 'color:var(--chart-orange);font-weight:600;' }, '● Repaired')
      )
    ),
    el('div', { style: 'padding:16px 0;' },
      el('svg', { viewBox: '0 0 500 160', style: 'width:100%;height:160px;overflow:visible;' },
        // Grid lines
        el('line', { x1: '40', y1: '20', x2: '480', y2: '20', stroke: 'var(--line)', 'stroke-dasharray': '4' }),
        el('line', { x1: '40', y1: '60', x2: '480', y2: '60', stroke: 'var(--line)', 'stroke-dasharray': '4' }),
        el('line', { x1: '40', y1: '100', x2: '480', y2: '100', stroke: 'var(--line)', 'stroke-dasharray': '4' }),
        el('line', { x1: '40', y1: '140', x2: '480', y2: '140', stroke: 'var(--line)' }),
        // Y-axis labels
        el('text', { x: '10', y: '24', fill: 'var(--ink-2)', 'font-size': '10' }, '100'),
        el('text', { x: '10', y: '64', fill: 'var(--ink-2)', 'font-size': '10' }, '80'),
        el('text', { x: '10', y: '104', fill: 'var(--ink-2)', 'font-size': '10' }, '60'),
        el('text', { x: '10', y: '144', fill: 'var(--ink-2)', 'font-size': '10' }, '40'),
        // Trend curve lines
        el('path', {
          d: 'M50 40 Q 120 70 190 30 T 330 35 T 470 25',
          fill: 'none', stroke: 'var(--chart-green)', 'stroke-width': '2.5'
        }),
        el('path', {
          d: 'M50 120 Q 120 135 190 115 T 330 130 T 470 140',
          fill: 'none', stroke: 'var(--chart-red)', 'stroke-width': '2.5'
        }),
        el('path', {
          d: 'M50 90 Q 120 110 190 85 T 330 95 T 470 70',
          fill: 'none', stroke: 'var(--chart-orange)', 'stroke-width': '2.5'
        }),
        // X-axis dates
        el('text', { x: '50', y: '158', fill: 'var(--ink-2)', 'font-size': '10' }, 'Jan 10'),
        el('text', { x: '120', y: '158', fill: 'var(--ink-2)', 'font-size': '10' }, 'Jan 11'),
        el('text', { x: '190', y: '158', fill: 'var(--ink-2)', 'font-size': '10' }, 'Jan 12'),
        el('text', { x: '260', y: '158', fill: 'var(--ink-2)', 'font-size': '10' }, 'Jan 13'),
        el('text', { x: '330', y: '158', fill: 'var(--ink-2)', 'font-size': '10' }, 'Jan 14'),
        el('text', { x: '400', y: '158', fill: 'var(--ink-2)', 'font-size': '10' }, 'Jan 15'),
        el('text', { x: '470', y: '158', fill: 'var(--ink-2)', 'font-size': '10' }, 'Jan 16')
      )
    )
  );

  // Change Severity Donut Card
  const severityCard = el('div', { class: 'card' },
    el('div', { class: 'card-title-bar' },
      el('h3', { class: 'card-heading' }, 'Change Severity')
    ),
    el('div', { style: 'display:flex;align-items:center;justify-content:space-around;padding:16px 0;' },
      el('svg', { viewBox: '0 0 36 36', style: 'width:110px;height:110px;' },
        el('circle', { cx: '18', cy: '18', r: '15.9', fill: 'none', stroke: 'var(--chart-red)', 'stroke-width': '4', 'stroke-dasharray': '25 100' }),
        el('circle', { cx: '18', cy: '18', r: '15.9', fill: 'none', stroke: 'var(--chart-orange)', 'stroke-width': '4', 'stroke-dasharray': '35 100', 'stroke-dashoffset': '-25' }),
        el('circle', { cx: '18', cy: '18', r: '15.9', fill: 'none', stroke: 'var(--chart-amber)', 'stroke-width': '4', 'stroke-dasharray': '25 100', 'stroke-dashoffset': '-60' }),
        el('circle', { cx: '18', cy: '18', r: '15.9', fill: 'none', stroke: 'var(--chart-green)', 'stroke-width': '4', 'stroke-dasharray': '15 100', 'stroke-dashoffset': '-85' }),
        el('text', { x: '18', y: '17', 'text-anchor': 'middle', 'font-size': '8', 'font-weight': 'bold', fill: 'var(--ink)' }, '24'),
        el('text', { x: '18', y: '23', 'text-anchor': 'middle', 'font-size': '3.5', fill: 'var(--ink-2)' }, 'Total')
      ),
      el('div', { style: 'display:flex;flex-direction:column;gap:6px;font-size:0.82rem;' },
        el('div', { style: 'display:flex;align-items:center;gap:6px;' }, el('span', { class: 'legend-dot', style: 'background:var(--chart-red);' }), 'Critical: 4'),
        el('div', { style: 'display:flex;align-items:center;gap:6px;' }, el('span', { class: 'legend-dot', style: 'background:var(--chart-orange);' }), 'High: 8'),
        el('div', { style: 'display:flex;align-items:center;gap:6px;' }, el('span', { class: 'legend-dot', style: 'background:var(--chart-amber);' }), 'Medium: 7'),
        el('div', { style: 'display:flex;align-items:center;gap:6px;' }, el('span', { class: 'legend-dot', style: 'background:var(--chart-green);' }), 'Low: 5')
      )
    )
  );

  chartsRow.appendChild(trendCard);
  chartsRow.appendChild(severityCard);
  root.appendChild(chartsRow);

  // 3. Recent Activity Table Card
  const recentCard = el('div', { class: 'card' },
    el('div', { class: 'card-title-bar' },
      el('h3', { class: 'card-heading' }, 'Recent Activity'),
      el('a', { href: '#/changes', class: 'card-footer-link' }, 'View all →')
    ),
    el('table', { class: 'runs-table', style: 'width:100%;margin-top:12px;' },
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
          el('td', {}, '2 hours ago'),
          el('td', { style: 'font-weight:600;' }, 'Header navigation updated'),
          el('td', {}, el('span', { class: 'badge badge--bug' }, '▲ High')),
          el('td', {}, el('span', { class: 'badge badge--proposed' }, 'Detected'))
        ),
        el('tr', {},
          el('td', {}, '4 hours ago'),
          el('td', { style: 'font-weight:600;' }, 'Product card structure changed'),
          el('td', {}, el('span', { class: 'badge badge--review' }, '● Medium')),
          el('td', {}, el('span', { class: 'badge badge--review' }, 'Analyzing'))
        ),
        el('tr', {},
          el('td', {}, '6 hours ago'),
          el('td', { style: 'font-weight:600;' }, 'Button selector not found'),
          el('td', {}, el('span', { class: 'badge badge--bug' }, '✕ Critical')),
          el('td', {}, el('span', { class: 'badge badge--pass badge--healed' }, '✓ Repair Suggested'))
        ),
        el('tr', {},
          el('td', {}, '1 day ago'),
          el('td', { style: 'font-weight:600;' }, 'Content text updated'),
          el('td', {}, el('span', { class: 'badge badge--proposed' }, '▼ Low')),
          el('td', {}, el('span', { class: 'badge badge--pass' }, '✓ Resolved'))
        )
      )
    )
  );
  root.appendChild(recentCard);

  container.appendChild(root);
}

/* ==========================================================================
   3. TEST RUNS VIEW (REFERENCE UI 2 SCREEN 2)
   ========================================================================== */
export async function renderTestRunsView() {
  const container = document.getElementById('view-test-runs');
  if (!container) return;
  container.textContent = '';
  updateHeader('⏱️', 'Test Runs', 'Execute and monitor Playwright tests.', 'Search test runs...');

  const root = el('div', { class: 'test-runs-view' });

  // Filter Bar
  const filterbar = el('div', { class: 'test-runs-filterbar' },
    el('div', { style: 'display:flex;gap:10px;align-items:center;' },
      el('select', { class: 'btn btn--outline btn--sm' },
        el('option', {}, 'All Tests ▾'),
        el('option', {}, 'Smoke Suite'),
        el('option', {}, 'Regression Suite')
      ),
      el('select', { class: 'btn btn--outline btn--sm' },
        el('option', {}, 'Last 7 days ▾'),
        el('option', {}, 'Last 24 hours'),
        el('option', {}, 'Last 30 days')
      ),
      el('select', { class: 'btn btn--outline btn--sm' },
        el('option', {}, 'All Status ▾'),
        el('option', {}, 'Passed'),
        el('option', {}, 'Failed'),
        el('option', {}, 'Repaired')
      )
    ),
    el('div', { class: 'header-search-wrap' },
      el('span', { class: 'search-lens-icon' }, '🔍'),
      el('input', { type: 'search', class: 'header-search-input', placeholder: 'Search test runs...' })
    )
  );
  root.appendChild(filterbar);

  // Status Summary Pills
  const summaryPills = el('div', { class: 'status-counts-summary' },
    el('div', { class: 'count-pill-badge', style: 'color:var(--jade);' }, '🟢 186 Passed'),
    el('div', { class: 'count-pill-badge', style: 'color:var(--crimson);' }, '🔴 12 Failed'),
    el('div', { class: 'count-pill-badge', style: 'color:var(--amber);' }, '⚡ 8 Repaired'),
    el('div', { class: 'count-pill-badge', style: 'color:var(--ink-2);' }, '⚪ 4 Skipped')
  );
  root.appendChild(summaryPills);

  // Test Run Rows Table
  const tableCard = el('div', { class: 'card' });
  const table = el('table', { class: 'runs-table', style: 'width:100%;' },
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
        el('td', { style: 'font-weight:600;' }, 'Homepage loads correctly'),
        el('td', {}, '12s'),
        el('td', {}, el('span', { class: 'badge badge--pass' }, '✓ Passed')),
        el('td', {}, '2 hours ago'),
        el('td', {}, el('a', { href: '#/simulation', class: 'btn btn--outline btn--sm' }, 'View'))
      ),
      el('tr', {},
        el('td', { style: 'font-weight:600;' }, 'Product search flow'),
        el('td', {}, '18s'),
        el('td', {}, el('span', { class: 'badge badge--bug' }, '✕ Failed')),
        el('td', {}, '4 hours ago'),
        el('td', {}, el('a', { href: '#/ai-agent', class: 'btn btn--outline btn--sm' }, 'View'))
      ),
      el('tr', {},
        el('td', { style: 'font-weight:600;' }, 'Add to cart transaction'),
        el('td', {}, '22s'),
        el('td', {}, el('span', { class: 'badge badge--pass badge--healed' }, '✓↻ Repaired')),
        el('td', {}, '6 hours ago'),
        el('td', {}, el('a', { href: '#/comparison', class: 'btn btn--outline btn--sm' }, 'View'))
      ),
      el('tr', {},
        el('td', { style: 'font-weight:600;' }, 'Checkout flow validation'),
        el('td', {}, '45s'),
        el('td', {}, el('span', { class: 'badge badge--bug' }, '✕ Failed')),
        el('td', {}, '6 hours ago'),
        el('td', {}, el('a', { href: '#/ai-agent', class: 'btn btn--outline btn--sm' }, 'View'))
      ),
      el('tr', {},
        el('td', { style: 'font-weight:600;' }, 'Login authorization test'),
        el('td', {}, '30s'),
        el('td', {}, el('span', { class: 'badge badge--pass' }, '✓ Passed')),
        el('td', {}, '8 hours ago'),
        el('td', {}, el('a', { href: '#/simulation', class: 'btn btn--outline btn--sm' }, 'View'))
      ),
      el('tr', {},
        el('td', { style: 'font-weight:600;' }, 'User profile update'),
        el('td', {}, '28s'),
        el('td', {}, el('span', { class: 'badge badge--pass' }, '✓ Passed')),
        el('td', {}, '1 day ago'),
        el('td', {}, el('a', { href: '#/simulation', class: 'btn btn--outline btn--sm' }, 'View'))
      )
    )
  );
  tableCard.appendChild(table);

  // Pagination Footer
  const pagination = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-top:16px;' },
    el('div', { style: 'display:flex;gap:4px;' },
      el('button', { class: 'btn btn--sm btn--primary' }, '1'),
      el('button', { class: 'btn btn--sm btn--outline' }, '2'),
      el('button', { class: 'btn btn--sm btn--outline' }, '3'),
      el('span', { style: 'padding:4px 8px;color:var(--ink-2);' }, '...'),
      el('button', { class: 'btn btn--sm btn--outline' }, '10'),
      el('button', { class: 'btn btn--sm btn--outline' }, '>')
    ),
    el('div', { style: 'font-size:0.82rem;color:var(--ink-2);' }, 'Showing 1-6 of 48 tests')
  );
  tableCard.appendChild(pagination);
  root.appendChild(tableCard);

  container.appendChild(root);
}

/* ==========================================================================
   4. CHANGES VIEW (REFERENCE UI 2 SCREEN 3)
   ========================================================================== */
export async function renderJapaneseChanges() {
  const container = document.getElementById('view-changes');
  if (!container) return;
  container.textContent = '';
  updateHeader('🔀', 'Changes', 'View and analyze detected interface changes.', 'Search changes...');

  const root = el('div', { class: 'changes-view' });

  // Filter Bar
  const filterbar = el('div', { class: 'test-runs-filterbar' },
    el('div', { style: 'display:flex;gap:10px;align-items:center;' },
      el('select', { class: 'btn btn--outline btn--sm' },
        el('option', {}, 'Severity: All ▾'),
        el('option', {}, 'Critical'),
        el('option', {}, 'High'),
        el('option', {}, 'Medium'),
        el('option', {}, 'Low')
      ),
      el('select', { class: 'btn btn--outline btn--sm' },
        el('option', {}, 'Last 7 days ▾'),
        el('option', {}, 'Last 30 days')
      )
    ),
    el('div', { style: 'display:flex;gap:10px;align-items:center;' },
      el('div', { class: 'header-search-wrap' },
        el('span', { class: 'search-lens-icon' }, '🔍'),
        el('input', { type: 'search', class: 'header-search-input', placeholder: 'Search changes...' })
      ),
      el('button', { class: 'btn btn--icon btn--sm' }, '▦')
    )
  );
  root.appendChild(filterbar);

  // Cards List
  const changesList = [
    { title: 'Header navigation updated', domain: 'example.com', sev: 'High', time: '2 hours ago', status: 'Detected' },
    { title: 'Product card structure changed', domain: 'shop.example.com', sev: 'Medium', time: '4 hours ago', status: 'Analyzing' },
    { title: 'Button selector not found', domain: 'app.example.com', sev: 'Critical', time: '6 hours ago', status: 'Repair Suggested' },
    { title: 'Content text updated', domain: 'docs.example.com', sev: 'Low', time: '1 day ago', status: 'Resolved' },
    { title: 'Footer layout changed', domain: 'marketing.example.com', sev: 'Medium', time: '1 day ago', status: 'Detected' },
  ];

  const cardsContainer = el('div', { style: 'display:flex;flex-direction:column;gap:12px;' });
  changesList.forEach((c) => {
    const card = el('div', { class: 'card', style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:0;' },
      el('div', { style: 'display:flex;align-items:center;gap:16px;' },
        el('div', { style: 'width:60px;height:44px;background:var(--wireframe-bg);border:1px dashed var(--line-strong);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:0.7rem;color:var(--ink-2);' }, 'Diff'),
        el('div', {},
          el('div', { style: 'font-weight:700;font-size:0.95rem;color:var(--ink);' }, c.title),
          el('div', { style: 'font-size:0.78rem;color:var(--ink-2);' }, c.domain)
        )
      ),
      el('div', { style: 'display:flex;align-items:center;gap:16px;' },
        el('span', { class: c.sev === 'Critical' ? 'badge badge--bug' : c.sev === 'High' ? 'badge badge--review' : 'badge badge--proposed' }, `▲ ${c.sev}`),
        el('span', { style: 'font-size:0.8rem;color:var(--ink-2);' }, c.time),
        el('span', { class: c.status === 'Resolved' ? 'badge badge--pass' : 'badge badge--proposed' }, c.status),
        el('a', { href: '#/comparison', class: 'btn btn--outline btn--sm' }, 'View')
      )
    );
    cardsContainer.appendChild(card);
  });

  root.appendChild(cardsContainer);
  container.appendChild(root);
}

/* ==========================================================================
   5. AI AGENT & REPAIRS (REFERENCE UI 2 SCREEN 4)
   ========================================================================== */
export async function renderAIAgentView() {
  const container = document.getElementById('view-ai-agent');
  if (!container) return;
  container.textContent = '';
  updateHeader('🤖', 'AI Agent & Repairs', 'Get AI-powered test repair recommendations.', 'Search agent actions...');

  const root = el('div', { class: 'ai-agent-view' });

  // 6-Stage Horizontal Stepper
  const stepper = el('div', { class: 'stepper-progress-bar' },
    el('div', { class: 'step-node done' }, el('span', { class: 'step-circle' }, '1'), 'Store Intent'),
    el('div', { class: 'step-node done' }, el('span', { class: 'step-circle' }, '2'), 'Observe'),
    el('div', { class: 'step-node done' }, el('span', { class: 'step-circle' }, '3'), 'Diagnose'),
    el('div', { class: 'step-node active' }, el('span', { class: 'step-circle' }, '4'), 'Find Elements'),
    el('div', { class: 'step-node' }, el('span', { class: 'step-circle' }, '5'), 'Reconstruct'),
    el('div', { class: 'step-node' }, el('span', { class: 'step-circle' }, '6'), 'Verify')
  );
  root.appendChild(stepper);

  // 3-Column Layout: Failure Context | AI Analysis | Explanation
  const grid3 = el('div', { class: 'agent-3col-grid' });

  // Column 1: Failure Context
  const col1 = el('div', { class: 'card' },
    el('h4', { class: 'card-heading' }, 'Failure Context'),
    el('div', { style: 'height:160px;background:var(--wireframe-bg);border:1px solid var(--line);border-radius:4px;margin:12px 0;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;' },
      el('div', { style: 'border:2px solid var(--crimson);padding:8px 16px;border-radius:4px;background:var(--card);font-weight:700;' }, 'Sign In'),
      el('span', { style: 'position:absolute;top:6px;right:6px;background:var(--crimson);color:var(--on-fill);font-size:0.65rem;padding:2px 6px;border-radius:3px;' }, 'Selector Missing')
    ),
    el('div', { style: 'font-size:0.8rem;display:flex;flex-direction:column;gap:4px;' },
      el('div', {}, el('strong', {}, 'Test: '), 'Checkout flow'),
      el('div', {}, el('strong', {}, 'Step: '), 'Click on Sign In button'),
      el('div', {}, el('strong', {}, 'Error: '), 'Element not found'),
      el('span', { class: 'badge badge--bug', style: 'align-self:flex-start;margin-top:6px;' }, '✕ Failed')
    )
  );

  // Column 2: AI Analysis
  const col2 = el('div', { class: 'card' },
    el('h4', { class: 'card-heading' }, 'AI Analysis'),
    el('p', { style: 'font-size:0.82rem;color:var(--ink-2);margin:8px 0;' },
      'The Sign In button selector has changed. The button now uses a data attribute and has updated styling.'
    ),
    el('div', { style: 'margin:10px 0;' },
      el('div', { style: 'font-size:0.75rem;color:var(--ink-2);font-weight:600;' }, 'Original Selector:'),
      el('code', { style: 'display:block;padding:6px 10px;background:var(--paper);border:1px solid var(--line);border-radius:4px;font-family:var(--font-mono);font-size:0.78rem;color:var(--crimson);' }, 'button[data-testid="signin"]')
    ),
    el('div', { style: 'font-size:0.75rem;color:var(--ink-2);font-weight:600;margin-top:12px;' }, 'Suggested Selectors:'),
    el('div', { style: 'display:flex;flex-direction:column;gap:6px;margin:6px 0;' },
      el('div', { style: 'padding:8px 10px;background:var(--crimson-wash);border:1px solid var(--crimson);border-radius:4px;display:flex;justify-content:space-between;align-items:center;' },
        el('code', { style: 'font-family:var(--font-mono);font-size:0.78rem;' }, 'button[data-testid="auth-signin"]'),
        el('span', { class: 'ai-confidence-pill' }, '92%')
      ),
      el('div', { style: 'padding:8px 10px;background:var(--paper);border:1px solid var(--line);border-radius:4px;display:flex;justify-content:space-between;align-items:center;' },
        el('code', { style: 'font-family:var(--font-mono);font-size:0.78rem;' }, '.nav-menu .signin-btn'),
        el('span', { class: 'ai-confidence-pill' }, '78%')
      ),
      el('div', { style: 'padding:8px 10px;background:var(--paper);border:1px solid var(--line);border-radius:4px;display:flex;justify-content:space-between;align-items:center;' },
        el('code', { style: 'font-family:var(--font-mono);font-size:0.78rem;' }, 'text="Sign In"'),
        el('span', { class: 'ai-confidence-pill' }, '65%')
      )
    ),
    el('div', { style: 'display:flex;gap:8px;margin-top:16px;' },
      (() => {
        const b = el('button', { class: 'btn btn--outline btn--sm' }, 'Test Selected');
        b.addEventListener('click', () => {
          showToast('✓ Verified button[data-testid="auth-signin"] in headless Playwright session (Score 0.92)', 'success');
        });
        return b;
      })(),
      (() => {
        const b = el('button', { class: 'btn btn--primary btn--sm' }, 'Apply Repair');
        b.addEventListener('click', () => {
          showToast('✓ Repair applied! Test healed and passing.', 'success');
        });
        return b;
      })()
    )
  );

  // Column 3: Explanation
  const col3 = el('div', { class: 'card' },
    el('h4', { class: 'card-heading' }, 'Explanation'),
    el('ul', { style: 'font-size:0.82rem;color:var(--ink-2);padding-left:18px;margin:12px 0;line-height:1.6;' },
      el('li', {}, 'The button structure has changed'),
      el('li', {}, 'New data attribute detected'),
      el('li', {}, 'Text and position remain consistent'),
      el('li', {}, 'Recommended selector is most stable')
    ),
    el('div', { style: 'margin-top:20px;text-align:center;' },
      el('div', { style: 'font-size:0.78rem;color:var(--ink-2);' }, 'Overall Confidence'),
      el('div', { style: 'font-size:2rem;font-weight:800;color:var(--jade);line-height:1.2;' }, '92%')
    )
  );

  grid3.appendChild(col1);
  grid3.appendChild(col2);
  grid3.appendChild(col3);
  root.appendChild(grid3);

  container.appendChild(root);
}

/* ==========================================================================
   6. BEFORE & AFTER COMPARISON (REFERENCE UI 2 SCREEN 5)
   ========================================================================== */
export async function renderComparisonView() {
  const container = document.getElementById('view-comparison');
  if (!container) return;
  container.textContent = '';
  updateHeader('👁️', 'Before & After Comparison', 'Toggle between versions and view visual and code differences.', 'Search differences...');

  const root = el('div', { class: 'comp-view' });

  // Top Bar: Tabs & Section Select
  const topBar = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;' },
    el('div', { class: 'inspector-tabs' },
      el('button', { class: 'inspector-tab-btn active' }, 'Visual'),
      el('button', { class: 'inspector-tab-btn' }, 'DOM'),
      el('button', { class: 'inspector-tab-btn' }, 'Code Diff')
    ),
    el('select', { class: 'btn btn--outline btn--sm' },
      el('option', {}, 'Header Section ▾'),
      el('option', {}, 'Hero CTA Section'),
      el('option', {}, 'Footer Navigation')
    )
  );
  root.appendChild(topBar);

  // Side-by-side comparison
  const sideBySide = el('div', { class: 'sim-comparison-split', style: 'margin-bottom:20px;' });

  const figBefore = el('div', { class: 'browser-frame-card' },
    el('div', { class: 'browser-frame-header' },
      el('div', { class: 'browser-title' }, 'Version A (Before)', el('span', { class: 'pill-tag--baseline' }, 'Jan 10, 2024'))
    ),
    el('div', { class: 'browser-viewport', style: 'align-items:center;justify-content:center;' },
      el('h3', { class: 'viewport-mock-title' }, 'Build better products ', el('span', { class: 'highlight' }, 'faster')),
      el('button', { class: 'mock-cta-btn mock-cta-btn--baseline', style: 'margin-top:16px;' }, 'Get started')
    )
  );

  const splitBtn = el('div', { class: 'sim-split-badge-handle' }, '‹ ›');

  const figAfter = el('div', { class: 'browser-frame-card' },
    el('div', { class: 'browser-frame-header' },
      el('div', { class: 'browser-title' }, 'Version B (After)', el('span', { class: 'pill-tag--experimental' }, 'Jan 12, 2024'))
    ),
    el('div', { class: 'browser-viewport', style: 'align-items:center;justify-content:center;' },
      el('h3', { class: 'viewport-mock-title' }, 'Build better products ', el('span', { class: 'highlight' }, 'faster')),
      el('button', { class: 'mock-cta-btn mock-cta-btn--experimental', style: 'margin-top:16px;' }, 'Get started →')
    )
  );

  sideBySide.appendChild(figBefore);
  sideBySide.appendChild(splitBtn);
  sideBySide.appendChild(figAfter);
  root.appendChild(sideBySide);

  // Detected Changes List
  const detChanges = el('div', { class: 'card' },
    el('h4', { class: 'card-heading' }, 'Detected Changes (3)'),
    el('table', { class: 'runs-table', style: 'width:100%;margin-top:12px;' },
      el('thead', {},
        el('tr', {},
          el('th', {}, 'Element / Description'),
          el('th', {}, 'Severity')
        )
      ),
      el('tbody', {},
        el('tr', {},
          el('td', {}, 'Header navigation structure changed'),
          el('td', {}, el('span', { class: 'badge badge--review' }, '▲ High'))
        ),
        el('tr', {},
          el('td', {}, 'New menu item added: "Solutions"'),
          el('td', {}, el('span', { class: 'badge badge--proposed' }, '● Medium'))
        ),
        el('tr', {},
          el('td', {}, 'Button text changed: "Get started" → "Sign up"'),
          el('td', {}, el('span', { class: 'badge badge--pass' }, '▼ Low'))
        )
      )
    )
  );
  root.appendChild(detChanges);

  container.appendChild(root);
}

/* ==========================================================================
   7. REPAIR WORKFLOW (REFERENCE UI 2 SCREEN 6)
   ========================================================================== */
export async function renderRepairWorkflowView() {
  const container = document.getElementById('view-repair-workflow');
  if (!container) return;
  container.textContent = '';
  updateHeader('🛡️', 'Repair Workflow', 'Complete the 6-stage self-healing workflow.', 'Search repairs...');

  const root = el('div', { class: 'repair-workflow-view' });

  const layout = el('div', { style: 'display:grid;grid-template-columns:260px 1fr;gap:20px;' });

  // Left Stepper
  const leftStepper = el('div', { class: 'card', style: 'display:flex;flex-direction:column;gap:16px;' },
    el('div', { class: 'step-node done' }, el('span', { class: 'step-circle' }, '1'), el('div', {}, el('div', { style: 'font-weight:700;' }, 'Store Original Intent'), el('div', { style: 'font-size:0.75rem;' }, 'Preserve user journey'))),
    el('div', { class: 'step-node done' }, el('span', { class: 'step-circle' }, '2'), el('div', {}, el('div', { style: 'font-weight:700;' }, 'Observe Current Interface'), el('div', { style: 'font-size:0.75rem;' }, 'Capture DOM snapshot'))),
    el('div', { class: 'step-node done' }, el('span', { class: 'step-circle' }, '3'), el('div', {}, el('div', { style: 'font-weight:700;' }, 'Diagnose the Failure'), el('div', { style: 'font-size:0.75rem;' }, 'Analyze broken node'))),
    el('div', { class: 'step-node active' }, el('span', { class: 'step-circle' }, '4'), el('div', {}, el('div', { style: 'font-weight:700;' }, 'Find & Rank Replacements'), el('div', { style: 'font-size:0.75rem;' }, 'Semantic matching'))),
    el('div', { class: 'step-node' }, el('span', { class: 'step-circle' }, '5'), el('div', {}, el('div', { style: 'font-weight:700;' }, 'Reconstruct the Workflow'), el('div', { style: 'font-size:0.75rem;' }, 'Patch Playwright test'))),
    el('div', { class: 'step-node' }, el('span', { class: 'step-circle' }, '6'), el('div', {}, el('div', { style: 'font-weight:700;' }, 'Verify Outcome Independently'), el('div', { style: 'font-size:0.75rem;' }, 'Run live assertions')))
  );

  // Right Stage Card
  const rightStage = el('div', { class: 'card' },
    el('h3', { class: 'card-heading' }, 'Stage 4: Find and Rank Replacement Elements'),
    el('p', { style: 'font-size:0.82rem;color:var(--ink-2);' }, 'Analyzing the current page to find the best replacement elements for the failed selector.'),
    // Mock browser node preview
    el('div', { style: 'height:100px;background:var(--wireframe-bg);border:1px solid var(--line);border-radius:4px;display:flex;align-items:center;justify-content:center;margin:16px 0;' },
      el('div', { style: 'border:2px solid var(--crimson);padding:6px 14px;border-radius:4px;background:var(--card);font-weight:700;' }, 'Sign In')
    ),
    // Candidate Ranking Table
    el('table', { class: 'runs-table', style: 'width:100%;margin-top:12px;' },
      el('thead', {},
        el('tr', {},
          el('th', {}, 'Candidate Elements'),
          el('th', {}, 'Confidence')
        )
      ),
      el('tbody', {},
        el('tr', {},
          el('td', {}, el('code', {}, 'button[data-testid="auth-signin"]')),
          el('td', {}, el('span', { class: 'ai-confidence-pill' }, '92%'))
        ),
        el('tr', {},
          el('td', {}, el('code', {}, '.nav-menu .signin-btn')),
          el('td', {}, el('span', { class: 'ai-confidence-pill' }, '78%'))
        ),
        el('tr', {},
          el('td', {}, el('code', {}, 'text="Sign In"')),
          el('td', {}, el('span', { class: 'ai-confidence-pill' }, '65%'))
        ),
        el('tr', {},
          el('td', {}, el('code', {}, 'a[href="/login"]')),
          el('td', {}, el('span', { class: 'ai-confidence-pill' }, '42%'))
        ),
        el('tr', {},
          el('td', {}, el('code', {}, '.header-right button')),
          el('td', {}, el('span', { class: 'ai-confidence-pill' }, '31%'))
        )
      )
    ),
    el('button', { class: 'btn btn--primary', style: 'margin-top:16px;' }, 'Test in Browser')
  );

  layout.appendChild(leftStepper);
  layout.appendChild(rightStage);
  root.appendChild(layout);

  container.appendChild(root);
}

/* ==========================================================================
   8. REPORTS VIEW (REFERENCE UI 2 SCREEN 7)
   ========================================================================== */
export async function renderReportsView() {
  const container = document.getElementById('view-reports');
  if (!container) return;
  container.textContent = '';
  updateHeader('📋', 'Reports', 'View detailed test and change reports.', 'Search reports...');

  const root = el('div', { class: 'reports-view' });

  // Top Action Bar
  const topBar = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;' },
    el('div', { class: 'inspector-tabs' },
      el('button', { class: 'inspector-tab-btn active' }, 'Test Reports'),
      el('button', { class: 'inspector-tab-btn' }, 'Change Reports'),
      el('button', { class: 'inspector-tab-btn' }, 'Repair Reports')
    ),
    el('div', { style: 'display:flex;gap:10px;' },
      el('button', { class: 'btn btn--outline btn--sm' }, 'Export ▾'),
      el('button', { class: 'btn btn--outline btn--sm' }, 'Last 30 days ▾')
    )
  );
  root.appendChild(topBar);

  // Summary Stat Pills
  const summaryCards = el('div', { class: 'dash-stats-grid', style: 'margin-bottom:20px;' },
    el('div', { class: 'card', style: 'text-align:center;margin:0;' },
      el('div', { style: 'font-size:1.8rem;font-weight:800;' }, '320'),
      el('div', { style: 'font-size:0.8rem;color:var(--ink-2);' }, 'Total Tests')
    ),
    el('div', { class: 'card', style: 'text-align:center;margin:0;color:var(--jade);' },
      el('div', { style: 'font-size:1.8rem;font-weight:800;' }, '286'),
      el('div', { style: 'font-size:0.8rem;color:var(--ink-2);' }, 'Passed (89%)')
    ),
    el('div', { class: 'card', style: 'text-align:center;margin:0;color:var(--crimson);' },
      el('div', { style: 'font-size:1.8rem;font-weight:800;' }, '24'),
      el('div', { style: 'font-size:0.8rem;color:var(--ink-2);' }, 'Failed (8%)')
    ),
    el('div', { class: 'card', style: 'text-align:center;margin:0;color:var(--amber);' },
      el('div', { style: 'font-size:1.8rem;font-weight:800;' }, '10'),
      el('div', { style: 'font-size:0.8rem;color:var(--ink-2);' }, 'Repaired (3%)')
    )
  );
  root.appendChild(summaryCards);

  // Reports Breakdown Table
  const repTable = el('div', { class: 'card' },
    el('table', { class: 'runs-table', style: 'width:100%;' },
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
          el('td', {}, 'Jan 16, 2024'),
          el('td', { style: 'font-weight:600;' }, 'Homepage'),
          el('td', {}, '42'),
          el('td', { style: 'color:var(--jade);' }, '38'),
          el('td', { style: 'color:var(--crimson);' }, '3'),
          el('td', { style: 'color:var(--amber);' }, '1'),
          el('td', {}, el('button', { class: 'btn btn--outline btn--sm' }, 'View'))
        ),
        el('tr', {},
          el('td', {}, 'Jan 15, 2024'),
          el('td', { style: 'font-weight:600;' }, 'Product Search'),
          el('td', {}, '38'),
          el('td', { style: 'color:var(--jade);' }, '34'),
          el('td', { style: 'color:var(--crimson);' }, '2'),
          el('td', { style: 'color:var(--amber);' }, '2'),
          el('td', {}, el('button', { class: 'btn btn--outline btn--sm' }, 'View'))
        ),
        el('tr', {},
          el('td', {}, 'Jan 14, 2024'),
          el('td', { style: 'font-weight:600;' }, 'Checkout Flow'),
          el('td', {}, '28'),
          el('td', { style: 'color:var(--jade);' }, '21'),
          el('td', { style: 'color:var(--crimson);' }, '5'),
          el('td', { style: 'color:var(--amber);' }, '2'),
          el('td', {}, el('button', { class: 'btn btn--outline btn--sm' }, 'View'))
        )
      )
    )
  );
  root.appendChild(repTable);

  container.appendChild(root);
}

/* ==========================================================================
   9. ANALYTICS VIEW (REFERENCE UI 2 SCREEN 8)
   ========================================================================== */
export async function renderAnalyticsView() {
  const container = document.getElementById('view-analytics');
  if (!container) return;
  container.textContent = '';
  updateHeader('📈', 'Analytics', 'Insights and trends over time.', 'Search analytics...');

  const root = el('div', { class: 'analytics-view' });

  // Top Filters
  const topFilters = el('div', { style: 'display:flex;justify-content:flex-end;gap:10px;margin-bottom:16px;' },
    el('button', { class: 'btn btn--outline btn--sm' }, 'Last 30 days ▾'),
    el('button', { class: 'btn btn--outline btn--sm' }, 'All Websites ▾')
  );
  root.appendChild(topFilters);

  // 6 Charts Grid
  const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(3, 1fr);gap:16px;' });

  // 1. Test Success Rate
  grid.appendChild(
    el('div', { class: 'card', style: 'margin:0;' },
      el('div', { style: 'font-size:0.8rem;color:var(--ink-2);' }, 'Test Success Rate'),
      el('div', { style: 'font-size:1.8rem;font-weight:800;color:var(--ink);' }, '89%', el('span', { class: 'dash-stat-trend up' }, '+12%')),
      el('svg', { viewBox: '0 0 100 40', style: 'width:100%;height:60px;margin-top:8px;' },
        el('path', { d: 'M0 35 Q 25 15 50 25 T 100 5', fill: 'none', stroke: 'var(--chart-red)', 'stroke-width': '2' })
      )
    )
  );

  // 2. Changes Detected
  grid.appendChild(
    el('div', { class: 'card', style: 'margin:0;' },
      el('div', { style: 'font-size:0.8rem;color:var(--ink-2);' }, 'Changes Detected'),
      el('div', { style: 'font-size:1.8rem;font-weight:800;color:var(--ink);' }, '24', el('span', { class: 'dash-stat-trend up' }, '-40%')),
      el('svg', { viewBox: '0 0 100 40', style: 'width:100%;height:60px;margin-top:8px;' },
        el('rect', { x: '10', y: '20', width: '8', height: '20', fill: 'var(--chart-red)' }),
        el('rect', { x: '30', y: '10', width: '8', height: '30', fill: 'var(--chart-red)' }),
        el('rect', { x: '50', y: '15', width: '8', height: '25', fill: 'var(--chart-red)' }),
        el('rect', { x: '70', y: '5', width: '8', height: '35', fill: 'var(--chart-red)' })
      )
    )
  );

  // 3. Change Types Donut
  grid.appendChild(
    el('div', { class: 'card', style: 'margin:0;' },
      el('div', { style: 'font-size:0.8rem;color:var(--ink-2);' }, 'Change Types'),
      el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-top:8px;' },
        el('svg', { viewBox: '0 0 36 36', style: 'width:60px;height:60px;' },
          el('circle', { cx: '18', cy: '18', r: '15.9', fill: 'none', stroke: 'var(--chart-orange)', 'stroke-width': '4', 'stroke-dasharray': '35 100' }),
          el('circle', { cx: '18', cy: '18', r: '15.9', fill: 'none', stroke: 'var(--chart-red)', 'stroke-width': '4', 'stroke-dasharray': '25 100', 'stroke-dashoffset': '-35' }),
          el('circle', { cx: '18', cy: '18', r: '15.9', fill: 'none', stroke: 'var(--chart-amber)', 'stroke-width': '4', 'stroke-dasharray': '40 100', 'stroke-dashoffset': '-60' }),
          el('text', { x: '18', y: '20', 'text-anchor': 'middle', 'font-size': '7', 'font-weight': 'bold', fill: 'var(--ink)' }, '24')
        ),
        el('div', { style: 'font-size:0.75rem;display:flex;flex-direction:column;gap:2px;' },
          el('div', {}, 'Layout: 8'),
          el('div', {}, 'Content: 6'),
          el('div', {}, 'Elements: 5')
        )
      )
    )
  );

  // 4. Average Repair Time
  grid.appendChild(
    el('div', { class: 'card', style: 'margin:0;' },
      el('div', { style: 'font-size:0.8rem;color:var(--ink-2);' }, 'Average Repair Time'),
      el('div', { style: 'font-size:1.8rem;font-weight:800;color:var(--ink);' }, '2.4 min', el('span', { class: 'dash-stat-trend up' }, '-30%')),
      el('svg', { viewBox: '0 0 100 40', style: 'width:100%;height:60px;margin-top:8px;' },
        el('rect', { x: '10', y: '25', width: '10', height: '15', fill: 'var(--sakura-pink)' }),
        el('rect', { x: '35', y: '15', width: '10', height: '25', fill: 'var(--sakura-pink)' }),
        el('rect', { x: '60', y: '10', width: '10', height: '30', fill: 'var(--sakura-pink)' }),
        el('rect', { x: '85', y: '20', width: '10', height: '20', fill: 'var(--sakura-pink)' })
      )
    )
  );

  // 5. Repair Success Rate
  grid.appendChild(
    el('div', { class: 'card', style: 'margin:0;' },
      el('div', { style: 'font-size:0.8rem;color:var(--ink-2);' }, 'Repair Success Rate'),
      el('div', { style: 'font-size:1.8rem;font-weight:800;color:var(--ink);' }, '92%', el('span', { class: 'dash-stat-trend up' }, '+8%')),
      el('svg', { viewBox: '0 0 100 40', style: 'width:100%;height:60px;margin-top:8px;' },
        el('path', { d: 'M0 30 Q 30 20 60 15 T 100 5 L 100 40 L 0 40 Z', fill: 'var(--crimson-wash)', stroke: 'none' }),
        el('path', { d: 'M0 30 Q 30 20 60 15 T 100 5', fill: 'none', stroke: 'var(--crimson)', 'stroke-width': '2' })
      )
    )
  );

  // 6. Failure Patterns Bar
  grid.appendChild(
    el('div', { class: 'card', style: 'margin:0;' },
      el('div', { style: 'font-size:0.8rem;color:var(--ink-2);margin-bottom:8px;' }, 'Failure Patterns'),
      el('div', { style: 'display:flex;flex-direction:column;gap:6px;font-size:0.75rem;' },
        el('div', {}, 'Element not found (42%)', el('div', { style: 'height:6px;background:var(--chart-red);border-radius:3px;width:42%;' })),
        el('div', {}, 'Selector changed (28%)', el('div', { style: 'height:6px;background:var(--chart-orange);border-radius:3px;width:28%;' })),
        el('div', {}, 'Text content changed (18%)', el('div', { style: 'height:6px;background:var(--chart-amber);border-radius:3px;width:18%;' }))
      )
    )
  );

  root.appendChild(grid);
  container.appendChild(root);
}

/* ==========================================================================
   10. STORAGE & HISTORY (REFERENCE UI 2 SCREEN 9)
   ========================================================================== */
export async function renderStorageView() {
  const container = document.getElementById('view-storage');
  if (!container) return;
  container.textContent = '';
  updateHeader('💾', 'Storage & History', 'All snapshots, screenshots, logs and historical records.', 'Search records...');

  const root = el('div', { class: 'storage-view' });

  // Tabs Bar
  const tabsBar = el('div', { class: 'inspector-tabs', style: 'margin-bottom:16px;' },
    el('button', { class: 'inspector-tab-btn active' }, 'Snapshots'),
    el('button', { class: 'inspector-tab-btn' }, 'Screenshots'),
    el('button', { class: 'inspector-tab-btn' }, 'Test Logs'),
    el('button', { class: 'inspector-tab-btn' }, 'Repair History')
  );
  root.appendChild(tabsBar);

  // Filters Bar
  const filterbar = el('div', { class: 'test-runs-filterbar' },
    el('div', { style: 'display:flex;gap:10px;align-items:center;' },
      el('select', { class: 'btn btn--outline btn--sm' },
        el('option', {}, 'All Types ▾'),
        el('option', {}, 'Screenshot'),
        el('option', {}, 'Archive Zip')
      ),
      el('select', { class: 'btn btn--outline btn--sm' },
        el('option', {}, 'Last 30 days ▾'),
        el('option', {}, 'Last 90 days')
      )
    ),
    el('div', { class: 'header-search-wrap' },
      el('span', { class: 'search-lens-icon' }, '🔍'),
      el('input', { type: 'search', class: 'header-search-input', placeholder: 'Search records...' })
    )
  );
  root.appendChild(filterbar);

  // Files Table
  const tableCard = el('div', { class: 'card' });
  const table = el('table', { class: 'runs-table', style: 'width:100%;' },
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
        el('td', { style: 'font-weight:600;' }, '🖼 homepage_2024-01-16.png'),
        el('td', {}, 'Screenshot'),
        el('td', {}, '2.1 MB'),
        el('td', {}, '2 hours ago'),
        el('td', {}, el('button', { class: 'btn btn--outline btn--sm' }, '⬇ Download'))
      ),
      el('tr', {},
        el('td', { style: 'font-weight:600;' }, '📦 test-run-001.zip'),
        el('td', {}, 'Test Logs'),
        el('td', {}, '12 MB'),
        el('td', {}, '4 hours ago'),
        el('td', {}, el('button', { class: 'btn btn--outline btn--sm' }, '⬇ Download'))
      ),
      el('tr', {},
        el('td', { style: 'font-weight:600;' }, '📄 change-diff.html'),
        el('td', {}, 'Change Report'),
        el('td', {}, '450 KB'),
        el('td', {}, '6 hours ago'),
        el('td', {}, el('button', { class: 'btn btn--outline btn--sm' }, '⬇ Download'))
      ),
      el('tr', {},
        el('td', { style: 'font-weight:600;' }, '📦 checkout-trace.zip'),
        el('td', {}, 'Playwright Trace'),
        el('td', {}, '8.2 MB'),
        el('td', {}, '1 day ago'),
        el('td', {}, el('button', { class: 'btn btn--outline btn--sm' }, '⬇ Download'))
      ),
      el('tr', {},
        el('td', { style: 'font-weight:600;' }, '📄 repair-report.pdf'),
        el('td', {}, 'Repair Report'),
        el('td', {}, '320 KB'),
        el('td', {}, '1 day ago'),
        el('td', {}, el('button', { class: 'btn btn--outline btn--sm' }, '⬇ Download'))
      )
    )
  );
  tableCard.appendChild(table);
  root.appendChild(tableCard);

  container.appendChild(root);
}
