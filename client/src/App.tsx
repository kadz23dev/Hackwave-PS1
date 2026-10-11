import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatDrawer } from './components/ChatDrawer';
import { DashboardOverview } from './views/DashboardOverview';
import { VisualCompare } from './views/VisualCompare';
import { Analytics } from './views/Analytics';
import { RepairsGovernance } from './views/RepairsGovernance';
import { StudioSimulation } from './views/StudioSimulation';
import { ReportsStorage } from './views/ReportsStorage';
import { Settings } from './views/Settings';
import { LandingPage } from './views/LandingPage';
import { AuthPage } from './views/AuthPage';

export const App: React.FC = () => {
  const [route, setRoute] = useState<string>(() => window.location.hash || '#/');

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(window.location.hash || '#/');
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (newRoute: string) => {
    window.location.hash = newRoute;
    setRoute(newRoute);
  };

  // 1. Standalone Full-Page Views
  if (route === '#/landing') {
    return <LandingPage onNavigate={navigate} />;
  }

  if (route === '#/login') {
    return <AuthPage initialMode="signin" onNavigate={navigate} />;
  }

  if (route === '#/signup') {
    return <AuthPage initialMode="signup" onNavigate={navigate} />;
  }

  // 2. Parse Change ID for Deep Linking: #/changes/:id
  let changeId: number | undefined;
  if (route.startsWith('#/changes/')) {
    const cid = parseInt(route.replace('#/changes/', ''), 10);
    if (!isNaN(cid)) changeId = cid;
  }

  // 3. Main Dashboard Application Layout
  return (
    <div className="app-layout">
      <Sidebar currentRoute={route} onNavigate={navigate} />

      <main className="main-content">
        {route === '#/' && <DashboardOverview onNavigate={navigate} />}
        {route === '#/runs' && <DashboardOverview onNavigate={navigate} />}
        {(route === '#/changes' || route.startsWith('#/changes/')) && (
          <VisualCompare changeId={changeId} onNavigate={navigate} />
        )}
        {route === '#/analytics' && <Analytics />}
        {route === '#/repairs' && <RepairsGovernance />}
        {(route === '#/dashboard' || route === '#/simulation' || route === '#/studio') && (
          <StudioSimulation />
        )}
        {(route === '#/reports' || route === '#/storage') && <ReportsStorage />}
        {route === '#/settings' && <Settings />}
      </main>

      {/* Floating AI Assistant */}
      <ChatDrawer />
    </div>
  );
};
