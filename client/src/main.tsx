import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from './context/AuthContext';
import { BADGE_DEFINITIONS } from './components/VerdictBadge';

// Expose BADGE helpers on window.App for integration test suite compatibility
if (typeof window !== 'undefined') {
  (window as any).App = {
    BADGE: BADGE_DEFINITIONS,
    badge: (verdict: string) => {
      const norm = (verdict || 'PASS').toUpperCase();
      const [icon, label, variantClass] = BADGE_DEFINITIONS[norm] || ['•', norm, 'badge--neutral'];
      const span = document.createElement('span');
      span.className = `badge ${variantClass}`;
      span.setAttribute('role', 'status');

      const iconSpan = document.createElement('span');
      iconSpan.className = 'badge__icon';
      iconSpan.setAttribute('aria-hidden', 'true');
      iconSpan.textContent = icon;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'badge__label';
      labelSpan.textContent = label;

      span.appendChild(iconSpan);
      span.appendChild(labelSpan);
      return span;
    },
  };
}

const rootElem = document.getElementById('root');
if (rootElem) {
  createRoot(rootElem).render(
    <React.StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </React.StrictMode>
  );
}
