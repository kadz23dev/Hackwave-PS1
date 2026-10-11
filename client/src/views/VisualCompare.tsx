import React, { useEffect, useState } from 'react';
import { api, CompareResponse } from '../api/client';

interface VisualCompareProps {
  changeId?: number;
  onNavigate: (route: string) => void;
}

export const VisualCompare: React.FC<VisualCompareProps> = ({ changeId, onNavigate }) => {
  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sliderPos, setSliderPos] = useState(50);
  const [severityFilter, setSeverityFilter] = useState<{ low: boolean; medium: boolean; high: boolean }>({
    low: true,
    medium: true,
    high: true,
  });

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api.getCompare(changeId)
      .then((resp) => {
        if (!mounted) return;
        setData(resp);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load compare data:', err);
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [changeId]);

  const filteredChanges = (data?.domChanges || []).filter((ch) => {
    const sev = (ch.severity || 'low').toLowerCase();
    if (sev === 'low' && !severityFilter.low) return false;
    if (sev === 'medium' && !severityFilter.medium) return false;
    if (sev === 'high' && !severityFilter.high) return false;
    return true;
  });

  return (
    <section id="view-change" className="view-panel view-panel--active">
      <div className="view-header">
        <div>
          <h1 className="view-title">Visual Diff & Change Inspector</h1>
          <p className="view-subtitle">
            Side-by-side DOM element delta matching and high-precision visual before/after analysis.
          </p>
        </div>
        <div className="view-header-actions">
          <button className="btn btn--outline" onClick={() => onNavigate('#/changes')}>
            ← All Changes
          </button>
        </div>
      </div>

      {/* Severity Filter Controls */}
      <div className="filter-bar card">
        <span className="filter-bar-title font-semibold">Filter Severity:</span>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={severityFilter.low}
            onChange={(e) => setSeverityFilter({ ...severityFilter, low: e.target.checked })}
          />
          <span>LOW Severity</span>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={severityFilter.medium}
            onChange={(e) => setSeverityFilter({ ...severityFilter, medium: e.target.checked })}
          />
          <span>MEDIUM Severity</span>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={severityFilter.high}
            onChange={(e) => setSeverityFilter({ ...severityFilter, high: e.target.checked })}
          />
          <span>HIGH Severity</span>
        </label>
      </div>

      {/* Comparison Grid */}
      <div className="compare-grid">
        <div className="card compare-viewport-card">
          <div className="card-header">
            <h2 className="card-title">Before (v1 Baseline) vs After (v2 Head)</h2>
            <span className="mono text-muted text-sm">Slider: {sliderPos}%</span>
          </div>

          <div className="compare-slider-wrapper">
            <div className="compare-pane compare-pane-before">
              <div className="compare-pane-badge">Version 1 (Baseline)</div>
              <div className="mock-browser-canvas">
                <div className="mock-browser-header">
                  <span className="mock-browser-url">http://127.0.0.1:4101/cart</span>
                </div>
                <div className="mock-browser-body">
                  <div className="mock-element mock-element--old">#add-to-cart (Button: "Add to cart")</div>
                  <div className="mock-element">#checkout-button (Button: "Checkout")</div>
                </div>
              </div>
            </div>

            <div
              className="compare-pane compare-pane-after"
              style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}
            >
              <div className="compare-pane-badge compare-pane-badge--new">Version 2 (Head)</div>
              <div className="mock-browser-canvas">
                <div className="mock-browser-header">
                  <span className="mock-browser-url">http://127.0.0.1:4102/bag</span>
                </div>
                <div className="mock-browser-body">
                  <div className="mock-element mock-element--new">#add-to-bag (Button: "Add to bag")</div>
                  <div className="mock-element mock-element--new">#proceed-to-payment (Button: "Proceed to payment")</div>
                </div>
              </div>
            </div>

            <input
              type="range"
              min="0"
              max="100"
              value={sliderPos}
              onChange={(e) => setSliderPos(Number(e.target.value))}
              className="compare-slider-input"
              aria-label="Drag before and after visual comparison slider"
            />
          </div>
        </div>

        {/* Change Deltas Tree */}
        <div className="card compare-deltas-card">
          <div className="card-header">
            <h2 className="card-title">Identified UI Structural Changes ({filteredChanges.length})</h2>
          </div>
          <div className="deltas-list">
            {filteredChanges.length > 0 ? (
              filteredChanges.map((ch, idx) => (
                <div key={idx} className={`delta-item delta-item--${(ch.severity || 'low').toLowerCase()}`}>
                  <div className="delta-item-header">
                    <span className="delta-kind-badge font-mono">{ch.kind}</span>
                    <span className={`badge badge--${(ch.severity || 'low').toLowerCase()}`}>
                      {ch.severity.toUpperCase()}
                    </span>
                  </div>
                  <p className="delta-explanation">{ch.explanation}</p>
                </div>
              ))
            ) : (
              <div className="text-center text-muted p-4">
                {loading ? 'Evaluating visual element changes...' : 'No changes matching current severity filter.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
