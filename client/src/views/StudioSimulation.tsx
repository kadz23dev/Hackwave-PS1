import React, { useState } from 'react';
import { api } from '../api/client';

export const StudioSimulation: React.FC = () => {
  const [scenario, setScenario] = useState<'pass' | 'drift' | 'bug'>('drift');
  const [targetUrl, setTargetUrl] = useState('http://127.0.0.1:4102');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    verdict: string;
    oracleMessage: string;
    healedPatch?: { original: string; healed: string; score: number } | null;
    steps: Array<{ num: number; title: string; desc: string; status: string; badge: string }>;
  } | null>(null);

  const runSimulation = async () => {
    setRunning(true);
    setResult(null);
    try {
      const resp = await api.triggerSimulation(scenario, targetUrl);
      setResult(resp);
    } catch (err: any) {
      alert(err.message || 'Simulation execution failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="view-panel view-panel--active">
      <div className="view-header">
        <div>
          <h1 className="view-title">Playwright Self-Healing Studio & Simulation</h1>
          <p className="view-subtitle">
            Simulate real UI changes, multi-agent debate, selector drift healing, and deterministic oracle validation.
          </p>
        </div>
      </div>

      <div className="workspace-chatgpt-grid">
        {/* Left Column Controls */}
        <div className="agents-sidebar-column">
          <div className="stitch-search-command-panel">
            <span className="agents-section-header">Simulation Target</span>
            <input
              type="text"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              className="chat-prompt-input"
              placeholder="http://127.0.0.1:4102"
            />

            <span className="agents-section-header mt-3">Select Test Scenario</span>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className={`btn btn--sm text-left ${scenario === 'drift' ? 'btn--primary' : 'btn--outline'}`}
                onClick={() => setScenario('drift')}
              >
                ⚡ UI Drift (Button Renamed & ID Stripped)
              </button>
              <button
                type="button"
                className={`btn btn--sm text-left ${scenario === 'pass' ? 'btn--primary' : 'btn--outline'}`}
                onClick={() => setScenario('pass')}
              >
                ✓ Standard Pass (Clean Baseline Run)
              </button>
              <button
                type="button"
                className={`btn btn--sm text-left ${scenario === 'bug' ? 'btn--primary' : 'btn--outline'}`}
                onClick={() => setScenario('bug')}
              >
                ✕ Server 500 Bug (Oracle Invariant Fail)
              </button>
            </div>

            <button
              className="btn btn--primary w-full mt-4"
              disabled={running}
              onClick={runSimulation}
            >
              {running ? 'Executing Simulation...' : '▶ Run Live Replay'}
            </button>
          </div>

          {/* Cooperating Agents Roster */}
          <div className="agents-roster-list">
            <span className="agents-section-header">Cooperating AI Agents</span>
            <div className="agent-roster-card agent-roster-card--active">
              <div className="agent-roster-top">
                <span className="agent-roster-identity">Selector Healer</span>
                <span className="agent-roster-status">ONLINE</span>
              </div>
              <p className="agent-roster-desc">Semantic DOM element matching & synonym resolver</p>
            </div>
            <div className="agent-roster-card">
              <div className="agent-roster-top">
                <span className="agent-roster-identity">Backend Oracle</span>
                <span className="agent-roster-status">ONLINE</span>
              </div>
              <p className="agent-roster-desc">Deterministic API & SQLite invariant verifier</p>
            </div>
            <div className="agent-roster-card">
              <div className="agent-roster-top">
                <span className="agent-roster-identity">Governance Policy</span>
                <span className="agent-roster-status">ONLINE</span>
              </div>
              <p className="agent-roster-desc">Auto-accept boundary checks & audit log manager</p>
            </div>
          </div>
        </div>

        {/* Right Column: Execution Canvas */}
        <div className="qa-canvas-column">
          <div className="qa-canvas-header">
            <span className="font-bold">Execution Stream & Oracle Monitor</span>
            {result && (
              <span className={`badge badge--${result.verdict === 'PASS' ? 'pass' : result.verdict === 'HEALED_PASS' ? 'healed' : 'bug'}`}>
                {result.verdict}
              </span>
            )}
          </div>

          <div className="p-4 flex flex-col gap-3">
            {result?.steps?.map((step) => (
              <div key={step.num} className="pw-stream-step">
                <div className="pw-stream-step-left">
                  <div className={`pw-step-indicator pw-step-indicator--${step.status}`}>
                    {step.status === 'pass' ? '✓' : step.status === 'heal' ? '⚡' : '✕'}
                  </div>
                  <div className="pw-step-text-group">
                    <span className="pw-step-title">{step.title}</span>
                    <span className="pw-step-desc">{step.desc}</span>
                  </div>
                </div>
                <span className="mono text-xs">{step.badge}</span>
              </div>
            ))}

            {result?.healedPatch && (
              <div className="pw-diff-container mt-2">
                <div className="pw-diff-header">
                  <span>Self-Healed Playwright Patch (Confidence: {result.healedPatch.score})</span>
                </div>
                <div className="pw-diff-content">
                  <div className="pw-diff-del">- {result.healedPatch.original}</div>
                  <div className="pw-diff-add">+ {result.healedPatch.healed}</div>
                </div>
              </div>
            )}

            {result?.oracleMessage && (
              <div className="sim-oracle-toast mt-2">
                {result.oracleMessage}
              </div>
            )}

            {!result && !running && (
              <div className="text-center text-muted p-8">
                Select a scenario on the left and click <strong>Run Live Replay</strong> to observe autonomous Playwright execution.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
