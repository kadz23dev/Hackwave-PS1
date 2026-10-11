import React, { useState } from 'react';

interface LandingPageProps {
  onNavigate: (route: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  // ROI Calculator interactive state
  const [testCount, setTestCount] = useState(250);
  const [hourlyRate, setHourlyRate] = useState(65);
  const [failureRate, setFailureRate] = useState(12);

  // Formula: (tests * failureRate% * 0.75 hrs triage * rate) * 52 weeks
  const annualFlakyHours = Math.round(testCount * (failureRate / 100) * 0.75 * 52);
  const annualSavings = Math.round(annualFlakyHours * hourlyRate * 0.88); // 88% healed

  return (
    <div className="landing-wrapper">
      {/* Liquid Glow Ambient Orbs */}
      <div className="ambient-glow-container" aria-hidden="true">
        <div className="ambient-orb ambient-orb-1" />
        <div className="ambient-orb ambient-orb-2" />
        <div className="ambient-orb ambient-orb-3" />
      </div>

      <div className="cyber-grid" aria-hidden="true" />

      {/* Header Navbar */}
      <header className="navbar container">
        <nav className="nav-container morphism-card">
          <a
            href="#/"
            className="brand-logo"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('#/');
            }}
          >
            <div className="brand-icon">⚡</div>
            <span>
              Kaizen<span style={{ color: 'var(--crimson)' }}>AI</span>
            </span>
          </a>

          <ul className="nav-links">
            <li><a href="#features" className="nav-link">Features</a></li>
            <li><a href="#simulator" className="nav-link">Live Simulator</a></li>
            <li><a href="#roi" className="nav-link">ROI Calculator</a></li>
            <li><a href="#pricing" className="nav-link">Pricing</a></li>
          </ul>

          <div className="nav-actions flex gap-2 items-center">
            <button
              className="btn btn--outline btn--sm"
              onClick={() => onNavigate('#/login')}
            >
              Sign In
            </button>
            <button
              className="btn btn--primary btn--sm"
              onClick={() => onNavigate('#/signup')}
            >
              Sign Up
            </button>
            <button
              className="btn btn--primary btn--sm"
              onClick={() => onNavigate('#/')}
            >
              ⚡ Launch Dashboard →
            </button>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="container pt-12 pb-16">
        <section className="hero-section text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-6 bg-crimson-wash text-crimson border border-crimson">
            <span>✦ Powered by Google Gemini & Multi-Agent Reasoning</span>
          </div>

          <h1 className="hero-headline text-5xl font-extrabold tracking-tight mb-6">
            Autonomous Intent-Aware Testing & UI Drift Self-Healing
          </h1>

          <p className="hero-subheading text-lg text-muted mb-8 max-w-2xl mx-auto">
            Stop losing engineering cycles to renamed buttons, altered DOM IDs, and split checkout flows.
            KaizenAI diagnoses UI drifts, auto-repairs Playwright locators, and deterministically validates backend state.
          </p>

          <div className="flex justify-center gap-4 flex-wrap mb-12">
            <button
              className="btn btn--primary btn--lg"
              onClick={() => onNavigate('#/')}
            >
              ⚡ Launch Live Dashboard
            </button>
            <button
              className="btn btn--outline btn--lg"
              onClick={() => onNavigate('#/simulation')}
            >
              ▶ Watch 3-Second Replay
            </button>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            <div className="card p-5 morphism-card">
              <span className="text-3xl font-bold text-accent">94.8%</span>
              <p className="text-sm font-semibold mt-1">Autonomous Repair Rate</p>
              <p className="text-xs text-muted">Zero test re-runs required</p>
            </div>
            <div className="card p-5 morphism-card">
              <span className="text-3xl font-bold text-success">0</span>
              <p className="text-sm font-semibold mt-1">False-Positive Heals</p>
              <p className="text-xs text-muted">Backend HTTP 500 flagged as APP BUG</p>
            </div>
            <div className="card p-5 morphism-card">
              <span className="text-3xl font-bold text-accent">&lt; 3s</span>
              <p className="text-sm font-semibold mt-1">Self-Healing Latency</p>
              <p className="text-xs text-muted">Instant Playwright plan rewrite</p>
            </div>
          </div>
        </section>

        {/* Interactive ROI Calculator */}
        <section id="roi" className="mt-20 card p-8 morphism-card max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-2 text-center">Interactive Engineering ROI Calculator</h2>
          <p className="text-center text-muted text-sm mb-8">
            Estimate how much developer time and engineering spend your organization recovers with autonomous self-healing.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
            <div>
              <label className="text-sm font-semibold block mb-2">Weekly Test Executions: {testCount}</label>
              <input
                type="range"
                min="50"
                max="1000"
                step="25"
                value={testCount}
                onChange={(e) => setTestCount(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-sm font-semibold block mb-2">Estimated Drift Rate: {failureRate}%</label>
              <input
                type="range"
                min="3"
                max="30"
                step="1"
                value={failureRate}
                onChange={(e) => setFailureRate(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-sm font-semibold block mb-2">Engineer Rate: ${hourlyRate}/hr</label>
              <input
                type="range"
                min="30"
                max="150"
                step="5"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          <div className="p-6 bg-crimson-wash rounded-xl text-center border border-crimson">
            <span className="text-sm uppercase tracking-wider font-bold text-crimson">Estimated Annual Engineering Savings</span>
            <div className="text-4xl font-extrabold text-crimson my-2">
              ${annualSavings.toLocaleString()}
            </div>
            <p className="text-xs text-muted">
              Based on {annualFlakyHours.toLocaleString()} manual selector debugging hours recovered per year.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
};
