import React, { useState } from 'react';

export const Settings: React.FC = () => {
  const [provider, setProvider] = useState<'gemini' | 'sarvam' | 'replay'>('gemini');
  const [actionBudget, setActionBudget] = useState(15);
  const [autoAcceptHarmless, setAutoAcceptHarmless] = useState(true);

  return (
    <section className="view-panel view-panel--active">
      <div className="view-header">
        <div>
          <h1 className="view-title">System Settings & Engine Configuration</h1>
          <p className="view-subtitle">
            Configure multi-agent LLM credentials, governance auto-accept policies, and action execution budgets.
          </p>
        </div>
      </div>

      <div className="card dashboard-card">
        <div className="card-header">
          <h2 className="card-title">Multi-Agent LLM Intelligence Engine</h2>
        </div>
        <div className="p-4 flex flex-col gap-4">
          <div>
            <label className="font-semibold block mb-1">Active Reasoning Engine:</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as any)}
              className="chat-prompt-input p-2 rounded border"
            >
              <option value="gemini">Google Gemini 2.5 Flash / Pro (Google API Key Active)</option>
              <option value="sarvam">Sarvam AI 105B (Indian Language & English Healer)</option>
              <option value="replay">Deterministic Replay Mode (Zero Network Calls)</option>
            </select>
          </div>

          <div className="p-3 bg-muted-soft rounded">
            <span className="font-semibold">Google API Key: </span>
            <span className="mono text-success">✓ Attached and loaded from .env (GEMINI_API_KEY)</span>
          </div>

          <div>
            <label className="font-semibold block mb-1">Per-Intent Action Budget:</label>
            <input
              type="number"
              min="5"
              max="50"
              value={actionBudget}
              onChange={(e) => setActionBudget(Number(e.target.value))}
              className="chat-prompt-input p-2 rounded border w-32"
            />
            <p className="text-muted text-xs mt-1">Maximum DOM actions before declaring run UNREPAIRABLE.</p>
          </div>

          <div className="mt-2">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={autoAcceptHarmless}
                onChange={(e) => setAutoAcceptHarmless(e.target.checked)}
              />
              <span>Auto-accept single candidate repairs for HARMLESS_UI drifts (Policy R-F3-05)</span>
            </label>
          </div>
        </div>
      </div>
    </section>
  );
};
