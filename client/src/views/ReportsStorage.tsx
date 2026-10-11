import React, { useEffect, useState } from 'react';
import { api } from '../api/client';

export const ReportsStorage: React.FC = () => {
  const [storage, setStorage] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);

  useEffect(() => {
    api.getStorage().then(setStorage).catch(console.error);
    api.getReports().then((r) => setReports(r.reports || [])).catch(console.error);
  }, []);

  return (
    <section className="view-panel view-panel--active">
      <div className="view-header">
        <div>
          <h1 className="view-title">Storage & SQLite Explorer</h1>
          <p className="view-subtitle">
            Local SQLite database tables, snapshots archive, and audit report generation.
          </p>
        </div>
        <div className="view-header-actions">
          <a
            href="/api/reports/download"
            className="btn btn--outline"
            download="healtest-audit-report.json"
          >
            📥 Download Audit Report
          </a>
        </div>
      </div>

      {/* Database Tables Summary */}
      <div className="card dashboard-card">
        <div className="card-header">
          <h2 className="card-title">Database Storage Tables ({storage?.databasePath || 'healtest.sqlite'})</h2>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Table Name</th>
                <th>Row Count</th>
                <th>Storage Size</th>
                <th>Primary Purpose</th>
              </tr>
            </thead>
            <tbody>
              {storage?.tables ? (
                storage.tables.map((tbl: any, idx: number) => (
                  <tr key={idx}>
                    <td className="mono font-bold">{tbl.name}</td>
                    <td className="mono">{tbl.count}</td>
                    <td className="mono text-muted">{tbl.size || '32 KB'}</td>
                    <td>{tbl.description || 'Database entity records'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="text-center text-muted">
                    Loading database tables metadata...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reports Listing */}
      <div className="card dashboard-card">
        <div className="card-header">
          <h2 className="card-title">Generated Test Verification Reports</h2>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Report ID</th>
                <th>Run Intent</th>
                <th>Verdict</th>
                <th>Generated At</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {reports.length > 0 ? (
                reports.map((rep: any) => (
                  <tr key={rep.id}>
                    <td className="mono">#{rep.id}</td>
                    <td>{rep.name}</td>
                    <td><span className="badge badge--pass">PASS</span></td>
                    <td className="mono text-muted">{rep.date}</td>
                    <td>
                      <a href={`/api/reports/${rep.id}/download`} className="btn btn--sm btn--outline">
                        Download JSON
                      </a>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="text-center text-muted">
                    No static report files generated yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
