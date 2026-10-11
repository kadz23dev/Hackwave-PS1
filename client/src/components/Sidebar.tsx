import React, { useState } from 'react';

interface SidebarProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentRoute, onNavigate }) => {
  const [themeIndex, setThemeIndex] = useState(0);

  const toggleTheme = () => {
    // 0: system (undefined), 1: light, 2: dark
    const next = (themeIndex + 1) % 3;
    setThemeIndex(next);
    if (next === 1) {
      document.documentElement.dataset.theme = 'light';
    } else if (next === 2) {
      document.documentElement.dataset.theme = 'dark';
    } else {
      delete document.documentElement.dataset.theme;
    }
  };

  const navItems = [
    { label: 'Overview', route: '#/', iconPath: 'M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z' },
    { label: 'Studio Workspace', route: '#/dashboard', iconPath: 'M10.5 2.5L3.5 11h6l-1 6.5 7-8.5h-6l1-6.5z' },
    { label: 'Simulation', route: '#/simulation', iconPath: 'M2.5 4h15v12h-15zM8 8l4.5 2-4.5 2V8z' },
    { label: 'Test Runs', route: '#/runs', iconPath: 'M10 2.5a7.5 7.5 0 100 15 7.5 7.5 0 000-15zm-1.5 5l4.5 2.5-4.5 2.5v-5z' },
    { label: 'Changes', route: '#/changes', iconPath: 'M4 4h12v12H4zM8 8h4v4H8z' },
    { label: 'Audit & Governance', route: '#/repairs', iconPath: 'M12 2l7 4v6c0 5-3.5 9-7 10-3.5-1-7-5-7-10V6l7-4z' },
    { label: 'Analytics', route: '#/analytics', iconPath: 'M4 16h2V8H4v8zm5 0h2V4H9v12zm5 0h2v-6h-2v6z' },
    { label: 'Reports', route: '#/reports', iconPath: 'M6 2h8l4 4v12H6V2zm7 1.5V6h2.5L13 3.5z' },
    { label: 'Storage & DB', route: '#/storage', iconPath: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3v8c0 1.7-3.6 3-8 3s-8-1.3-8-3V6z' },
    { label: 'Settings', route: '#/settings', iconPath: 'M10 6a4 4 0 100 8 4 4 0 000-8zm0-4a8 8 0 100 16 8 8 0 000-16z' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-crest">K</div>
        <a
          href="#/"
          className="brand sidebar-title-link"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('#/');
          }}
        >
          <span className="brand-text">Kaizen AI</span>
        </a>
        <a
          href="#/landing"
          className="btn-icon-round"
          title="Back to Landing Page"
          aria-label="Back to Landing Page"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('#/landing');
          }}
        >
          ⌂
        </a>
      </div>

      <nav className="sidebar-nav" role="navigation">
        {navItems.map((item) => {
          const isActive = currentRoute === item.route;
          return (
            <a
              key={item.route}
              href={item.route}
              className={`nav-item ${isActive ? 'nav-item--active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(item.route);
              }}
            >
              <span className="nav-icon">
                <svg
                  className="nav-icon-svg"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={item.iconPath} />
                </svg>
              </span>
              <span className="nav-label">{item.label}</span>
              {item.label === 'Overview' && <span className="sr-only">Overview</span>}
            </a>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="user-profile-widget">
          <div className="user-avatar-initials">AD</div>
          <div className="user-info-text">
            <span className="user-name-label">Admin QA</span>
            <span className="user-role-badge">Lead Engineer</span>
          </div>
        </div>

        <button
          id="theme-toggle"
          className="theme-toggle-btn"
          aria-label="Toggle visual theme"
          title="Toggle visual theme (Auto / Light / Dark)"
          onClick={toggleTheme}
        >
          <span className="theme-toggle-icon">🌓</span>
          <span className="theme-toggle-label">
            {themeIndex === 1 ? 'Light Mode' : themeIndex === 2 ? 'Dark Mode' : 'System Theme'}
          </span>
        </button>
      </div>
    </aside>
  );
};
