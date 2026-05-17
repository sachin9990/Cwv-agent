import { useEffect, useState } from "react";
import { API_BASE } from "../lib/api";
import "./HistoryPage.css";

type HistoryRun = {
  date: string;
  ticket_count: number;
  green: number;
  amber: number;
  red: number;
};

type HistoryEntry = {
  work_item_id: string;
  url: string;
  metric: string;
  status: string;
  value: number;
  deviceType: string;
  days: number;
  timestamp: string;
};

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

export default function HistoryPage() {
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detail, setDetail] = useState<HistoryEntry[] | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    setLoadingList(true);
    setListError(null);
    fetch(`${API_BASE}/history`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: HistoryRun[]) => setRuns(data))
      .catch((e) => setListError(String(e)))
      .finally(() => setLoadingList(false));
  }, []);

  const openDetail = (date: string) => {
    setSelectedDate(date);
    setDetail(null);
    setDetailError(null);
    setLoadingDetail(true);
    fetch(`${API_BASE}/history/${date}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: HistoryEntry[]) => setDetail(data))
      .catch((e) => setDetailError(String(e)))
      .finally(() => setLoadingDetail(false));
  };

  const closeDetail = () => {
    setSelectedDate(null);
    setDetail(null);
    setDetailError(null);
  };

  // ── Detail view ──────────────────────────────────────────────────────────
  if (selectedDate !== null) {
    const run = runs.find((r) => r.date === selectedDate);
    return (
      <div className="history-page">
        <div className="history-detail-card">
          <button className="history-back-btn" onClick={closeDetail}>
            ← Back to History
          </button>

          <div className="history-detail-header">
            <h2 className="history-detail-title">{formatDate(selectedDate)}</h2>
            <p className="history-detail-sub">Analysis Report</p>
          </div>

          {run && (
            <div className="history-detail-stats">
              <div className="hds-card hds-total">
                <span className="hds-num">{run.ticket_count}</span>
                <span className="hds-label">Total</span>
              </div>
              <div className="hds-card hds-green">
                <span className="hds-num">{run.green}</span>
                <span className="hds-label">Good</span>
              </div>
              <div className="hds-card hds-amber">
                <span className="hds-num">{run.amber}</span>
                <span className="hds-label">Needs Fix</span>
              </div>
              <div className="hds-card hds-red">
                <span className="hds-num">{run.red}</span>
                <span className="hds-label">Critical</span>
              </div>
            </div>
          )}

          {loadingDetail && (
            <div className="history-detail-loading">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="history-skeleton-row">
                  <span className="skeleton-cell skeleton-short" />
                  <span className="skeleton-cell skeleton-long" />
                  <span className="skeleton-cell skeleton-short" />
                  <span className="skeleton-cell skeleton-short" />
                  <span className="skeleton-cell skeleton-short" />
                  <span className="skeleton-cell skeleton-short" />
                </div>
              ))}
            </div>
          )}

          {detailError && (
            <div className="history-error">Could not load report: {detailError}</div>
          )}

          {detail && detail.length === 0 && (
            <p className="history-empty-detail">No entries recorded for this date.</p>
          )}

          {detail && detail.length > 0 && (
            <div className="table-wrapper">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Ticket ID</th>
                    <th>URL</th>
                    <th>Metric</th>
                    <th>Value</th>
                    <th>Status</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.map((entry, i) => (
                    <tr key={i}>
                      <td className="ht-id">{entry.work_item_id}</td>
                      <td className="ht-url">
                        {entry.url ? (
                          <a href={entry.url} target="_blank" rel="noopener noreferrer" title={entry.url}>
                            {entry.url}
                          </a>
                        ) : (
                          <span className="ht-na">—</span>
                        )}
                      </td>
                      <td>{entry.metric ?? "—"}</td>
                      <td>
                        <span className={`value-cell ${entry.status?.toLowerCase() ?? ""}`}>
                          {entry.value != null ? entry.value.toFixed(3) : "—"}
                        </span>
                      </td>
                      <td>
                        <span className={`history-status-badge history-status-badge--${entry.status?.toLowerCase() ?? "unknown"}`}>
                          {entry.status ?? "—"}
                        </span>
                      </td>
                      <td className="ht-time">{formatTime(entry.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────
  return (
    <div className="history-page">
      <div className="history-list-card">
        <div className="history-list-header">
          <h2 className="history-list-title">Analysis History</h2>
          <p className="history-list-sub">Past CWV analysis runs logged by the server</p>
        </div>

        {loadingList && (
          <div className="history-run-list">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="history-run-skeleton">
                <span className="skeleton-cell skeleton-medium" style={{ height: 18 }} />
                <span className="skeleton-cell skeleton-long" style={{ height: 10, marginTop: 10 }} />
                <span className="skeleton-cell skeleton-short" style={{ height: 10, marginTop: 8 }} />
              </div>
            ))}
          </div>
        )}

        {listError && (
          <div className="history-error">Could not load history: {listError}</div>
        )}

        {!loadingList && !listError && runs.length === 0 && (
          <div className="history-empty">
            <svg className="history-empty-svg" viewBox="0 0 160 120" fill="none" aria-hidden="true">
              <rect x="12" y="20" width="136" height="80" rx="8" stroke="currentColor" strokeWidth="2" strokeDasharray="6 4" opacity="0.25" />
              <rect x="28" y="38" width="40" height="7" rx="3" fill="currentColor" opacity="0.15" />
              <rect x="28" y="53" width="64" height="7" rx="3" fill="currentColor" opacity="0.10" />
              <rect x="28" y="68" width="52" height="7" rx="3" fill="currentColor" opacity="0.07" />
              <circle cx="118" cy="56" r="18" fill="currentColor" opacity="0.06" />
              <text x="118" y="62" textAnchor="middle" fontSize="18" fill="currentColor" opacity="0.25">📋</text>
            </svg>
            <h3 className="history-empty-title">No history yet</h3>
            <p className="history-empty-body">
              Run an analysis on the Analyze page and fetch New Relic data — the server will log results automatically.
            </p>
          </div>
        )}

        {!loadingList && runs.length > 0 && (
          <ul className="history-run-list">
            {runs.map((run) => {
              const total = run.ticket_count || 1;
              return (
                <li key={run.date} className="history-run-item" onClick={() => openDetail(run.date)}>
                  <div className="history-run-main">
                    <div className="history-run-date">{formatDate(run.date)}</div>
                    <div className="history-run-counts">
                      <span className="hrc hrc--total">{run.ticket_count} tickets</span>
                      <span className="hrc hrc--green">✓ {run.green}</span>
                      <span className="hrc hrc--amber">~ {run.amber}</span>
                      <span className="hrc hrc--red">✕ {run.red}</span>
                    </div>
                    <div className="history-run-bar">
                      {run.green > 0 && (
                        <span className="hrb hrb--green" style={{ flex: run.green / total }} />
                      )}
                      {run.amber > 0 && (
                        <span className="hrb hrb--amber" style={{ flex: run.amber / total }} />
                      )}
                      {run.red > 0 && (
                        <span className="hrb hrb--red" style={{ flex: run.red / total }} />
                      )}
                      {run.ticket_count === 0 && (
                        <span className="hrb hrb--empty" style={{ flex: 1 }} />
                      )}
                    </div>
                  </div>
                  <span className="history-run-arrow">›</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
