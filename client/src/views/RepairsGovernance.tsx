import React, { useState } from 'react';

export const RepairsGovernance: React.FC = () => {
  const [selectedCandidate, setSelectedCandidate] = useState<'Pay' | 'Complete order'>('Complete order');
  const [validatedStatus, setValidatedStatus] = useState<string | null>(null);

  const handleValidateChoice = () => {
    setValidatedStatus(`Resolved with choice "${selectedCandidate}" (Confidence: 0.94) ✓`);
  };

  return (
    <section id="view-repairs" className="view-panel view-panel--active">
      <div className="view-header">
        <div>
          <h1 className="view-title">Governance & Repair Verification</h1>
          <p className="view-subtitle">
            Audit logging, human-in-the-loop candidate resolution, and automated policy verification.
          </p>
        </div>
      </div>

      {/* Ambiguous Candidate Selector (tested in D5-D7) */}
      <div className="card dashboard-card">
        <div className="card-header">
          <h2 className="card-title">Ambiguous Repair Resolution (Human-in-the-Loop)</h2>
          <span className="badge badge--review">NEEDS REVIEW</span>
        </div>
        <div className="card-body">
          <p className="text-muted text-sm mb-4">
            The target redesign contains multiple candidate elements matching the intent step <code>"Pay now"</code>.
            Select the desired business candidate to apply and validate against deterministic backend invariants.
          </p>

          <div className="candidate-choices-group mb-4">
            <label className="candidate-choice-card">
              <input
                type="radio"
                name="candidate"
                value="Complete order"
                checked={selectedCandidate === 'Complete order'}
                onChange={() => setSelectedCandidate('Complete order')}
              />
              <div className="candidate-info">
                <span className="candidate-name font-bold">Complete order</span>
                <span className="candidate-score mono text-sm text-success">Score: 0.94 (Semantic Primary CTA)</span>
              </div>
            </label>

            <label className="candidate-choice-card">
              <input
                type="radio"
                name="candidate"
                value="Pay"
                checked={selectedCandidate === 'Pay'}
                onChange={() => setSelectedCandidate('Pay')}
              />
              <div className="candidate-info">
                <span className="candidate-name font-bold">Pay</span>
                <span className="candidate-score mono text-sm text-muted">Score: 0.82 (Alternative link)</span>
              </div>
            </label>
          </div>

          <button className="btn btn--primary" onClick={handleValidateChoice}>
            Validate Choice →
          </button>

          {validatedStatus && (
            <div className="toast-success mt-4 p-3 bg-success-soft text-success rounded font-semibold">
              {validatedStatus}
            </div>
          )}
        </div>
      </div>

      {/* Governance Approvals Audit Table */}
      <div className="card dashboard-card">
        <div className="card-header">
          <h2 className="card-title">Audit Trail & Verified Approvals</h2>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Repair ID</th>
                <th>Target Intent</th>
                <th>Repaired Step</th>
                <th>Actor</th>
                <th>Policy Verdict</th>
                <th>Reason</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="mono">#REP-101</td>
                <td>checkout-valid-card</td>
                <td className="mono font-semibold">#add-to-bag</td>
                <td>policy:auto-accept</td>
                <td><span className="badge badge--healed">HEALED</span></td>
                <td>HARMLESS_UI single candidate matched with confidence 0.95</td>
                <td className="mono text-muted">2 mins ago</td>
              </tr>
              <tr>
                <td className="mono">#REP-102</td>
                <td>checkout-valid-card</td>
                <td className="mono font-semibold">#proceed-to-payment</td>
                <td>admin@kaizen.ai</td>
                <td><span className="badge badge--pass">APPROVED</span></td>
                <td>Confirmed primary checkout funnel path</td>
                <td className="mono text-muted">10 mins ago</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
