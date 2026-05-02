import React, { useEffect, useMemo, useState } from "react";
import TimeRangePicker, { type TimeRange } from "./TimeRangePicker";
import "./CWVDashboard.css";

type Row = {
  ticket_id: string;
  url: string | null;
  metric: string | null;
  value: number | null;
  status: string | null;
  newRelicValue?: number | null;
  newRelicStatus?: string | null;
  prevValue?: number | null;
};

type PsiAudit = {
  id: string;
  title: string;
  description: string;
  score: number;
  displayValue: string;
};

type PsiState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; audits: PsiAudit[] };

const DEFAULT_RANGE: TimeRange = {
  kind: "relative",
  since: "7 days",
  label: "7 days",
};

export default function CWVDashboard({ data }: { data: Row[] }) {
  const [rows, setRows] = useState<Row[]>(data);
  const [showNewRelic, setShowNewRelic] = useState(false);
  const [range, setRange] = useState<TimeRange>(DEFAULT_RANGE);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [commentingId, setCommentingId] = useState<string | null>(null);
  const [psiMap, setPsiMap] = useState<Record<string, PsiState>>({});
  const [commentMap, setCommentMap] = useState<Record<string, string>>({});

  useEffect(() => {
    setRows(data);
    setShowNewRelic(false);
    setPage(1);
  }, [data]);

  const buildMetricUrl = (row: Row) => {
    const params = new URLSearchParams({
      ticket_id: row.ticket_id,
      url: row.url ?? "",
      metric: row.metric ?? "",
    });
    if (range.kind === "relative") {
      params.set("since", range.since);
    } else {
      params.set("from_time", range.from);
      params.set("to_time", range.to);
      params.set("timezone", range.timezone);
    }
    return `http://127.0.0.1:8000/get-metric?${params.toString()}`;
  };

  const fetchMetric = async (row: Row): Promise<Row> => {
    if (!row.url || !row.metric) return row;
    try {
      const resp = await fetch(buildMetricUrl(row));
      const result = await resp.json();
      return {
        ...row,
        newRelicValue: result.value ?? null,
        newRelicStatus: result.status ?? null,
      };
    } catch {
      return row;
    }
  };

  const handleGetData = async () => {
    setLoading(true);
    const updated = await Promise.all(rows.map(fetchMetric));
    setRows(updated);
    setShowNewRelic(true);
    setLoading(false);
  };

  const handleComment = async (row: Row) => {
    setCommentingId(row.ticket_id);
    try {
      const body: Record<string, unknown> = {
        ticket_id: row.ticket_id,
        metric: row.metric ?? null,
        newrelic_value: row.newRelicValue ?? null,
        newrelic_status: row.newRelicStatus ?? null,
      };
      if (range.kind === "relative") {
        body.since = range.since;
      } else {
        body.from_time = range.from;
        body.to_time = range.to;
        body.timezone = range.timezone;
      }
      const resp = await fetch("http://127.0.0.1:8000/comment-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await resp.json();
      if (result.success && result.comment_preview) {
        setCommentMap((prev) => ({ ...prev, [row.ticket_id]: result.comment_preview }));
      } else {
        alert(result.message ?? "Failed to add comment");
      }
    } catch (err) {
      alert(`Error: ${err}`);
    } finally {
      setCommentingId(null);
    }
  };

  const fetchPsi = async (row: Row) => {
    if (!row.url) return;
    setPsiMap((prev) => ({ ...prev, [row.ticket_id]: { status: "loading" } }));
    try {
      const params = new URLSearchParams({ url: row.url, strategy: "mobile" });
      if (row.metric) params.set("metric", row.metric);
      const resp = await fetch(`http://127.0.0.1:8000/get-pagespeed?${params}`);
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.detail ?? `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setPsiMap((prev) => ({
        ...prev,
        [row.ticket_id]: { status: "done", audits: data.recommendations },
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setPsiMap((prev) => ({
        ...prev,
        [row.ticket_id]: { status: "error", message },
      }));
    }
  };

  const handleFix = (row: Row) => {
    if (!row.url) return;
    if (psiMap[row.ticket_id]) {
      setPsiMap((prev) => {
        const next = { ...prev };
        delete next[row.ticket_id];
        return next;
      });
      return;
    }
    fetchPsi(row);
  };

  // Stats from New Relic responses only
  const stats = useMemo(() => {
    if (!showNewRelic) return { total: 0, good: 0, needsFix: 0, critical: 0 };
    const counted = rows.filter((r) => r.newRelicStatus);
    const total = counted.length;
    const good = counted.filter((r) => r.newRelicStatus === "Green").length;
    const critical = counted.filter((r) => r.newRelicStatus === "Red").length;
    const needsFix = counted.filter((r) => r.newRelicStatus === "Amber").length;
    return { total, good, needsFix, critical };
  }, [rows, showNewRelic]);

  const pct = (n: number, d: number) =>
    d === 0 ? "0%" : `${Math.round((n / d) * 100 * 10) / 10}%`;

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);


  return (
    <div className="dashboard-card" id="dashboard">
      <div className="dashboard-header">
        <div>
          <h2 className="dashboard-title">CWV Dashboard</h2>
          <p className="dashboard-subtitle">
            Overview of Core Web Vitals issues for your tickets
          </p>
        </div>
      </div>

      <div className="summary-row">
        <div className="summary-card total">
          <div className="summary-icon total-icon">📋</div>
          <div className="summary-body">
            <div className="summary-label">Total Bugs</div>
            <div className="summary-value">{stats.total}</div>
          </div>
        </div>
        <div className="summary-card good">
          <div className="summary-icon good-icon">✓</div>
          <div className="summary-body">
            <div className="summary-label">Good</div>
            <div className="summary-value">
              {stats.good}{" "}
              <span className="summary-pct">{pct(stats.good, stats.total)}</span>
            </div>
          </div>
        </div>
        <div className="summary-card warning">
          <div className="summary-icon warning-icon">🔧</div>
          <div className="summary-body">
            <div className="summary-label">Needs Fix</div>
            <div className="summary-value">
              {stats.needsFix}{" "}
              <span className="summary-pct">
                {pct(stats.needsFix, stats.total)}
              </span>
            </div>
          </div>
        </div>
        <div className="summary-card critical">
          <div className="summary-icon critical-icon">⚠</div>
          <div className="summary-body">
            <div className="summary-label">Critical</div>
            <div className="summary-value">
              {stats.critical}{" "}
              <span className="summary-pct">
                {pct(stats.critical, stats.total)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-toolbar">
        <TimeRangePicker value={range} onChange={setRange} />
        <button
          className="get-data-btn"
          onClick={handleGetData}
          disabled={loading || rows.length === 0}
        >
          {loading ? "Fetching…" : "Get Data from New Relic"}
        </button>
      </div>

      <table className="bugs-table">
        <thead>
          <tr>
            <th>Bug ID</th>
            <th>Title</th>
            <th>Parameter</th>
            <th>Metric Value from Azure</th>
            {showNewRelic && <th>Value from New Relic</th>}
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {pageRows.length > 0 ? (
            pageRows.map((item) => {
              const psiState = psiMap[item.ticket_id];
              const commentText = commentMap[item.ticket_id];
              return (
                <React.Fragment key={item.ticket_id}>
                  <tr className={commentText ? "row--commented" : ""}>
                    <td className="bug-id">{item.ticket_id}</td>
                    <td className="url-cell">
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noopener noreferrer">
                          {item.url}
                        </a>
                      ) : (
                        <span className="url-not-found">URL not found in the given ticket Id</span>
                      )}
                    </td>
                    <td>{item.metric ?? "-"}</td>
                    <td>
                      <span className={`value-cell ${item.status?.toLowerCase() ?? ""}`}>
                        {item.value !== null && item.value !== undefined
                          ? item.value.toFixed(3)
                          : "—"}
                      </span>
                    </td>
                    {showNewRelic && (
                      <td>
                        <span className={`value-cell ${item.newRelicStatus?.toLowerCase() ?? ""}`}>
                          {item.newRelicValue !== null && item.newRelicValue !== undefined
                            ? item.newRelicValue.toFixed(3)
                            : "—"}
                        </span>
                      </td>
                    )}
                    <td>
                      {showNewRelic && item.newRelicStatus === "Green" ? (
                        <button
                          className="action-btn comment"
                          onClick={() => handleComment(item)}
                          disabled={commentingId === item.ticket_id || !!commentText}
                        >
                          {commentText ? "✅ Commented" : commentingId === item.ticket_id ? "Commenting…" : "💬 Comment"}
                        </button>
                      ) : showNewRelic && item.newRelicStatus ? (
                        <button
                          className={`action-btn fix${psiState ? " fix--active" : ""}`}
                          onClick={() => handleFix(item)}
                        >
                          {psiState ? "✕ Close" : "🔧 Fix"}
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>

                  {psiState && (
                    <tr className="psi-expanded-row">
                      <td colSpan={showNewRelic ? 6 : 5}>
                        <div className="psi-panel">
                          {psiState.status === "loading" && (
                            <div className="psi-loading">
                              <span className="psi-spinner" aria-label="Loading" />
                              Fetching PageSpeed recommendations…
                            </div>
                          )}

                          {psiState.status === "error" && (
                            <div className="psi-error">
                              <span className="psi-error-msg">
                                Could not load recommendations: {psiState.message}
                              </span>
                              <button
                                type="button"
                                className="psi-retry-btn"
                                onClick={() => fetchPsi(item)}
                              >
                                ↺ Try Again
                              </button>
                              {item.url && (
                                <a
                                  href={`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(item.url)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="psi-external-link"
                                >
                                  Open in PageSpeed Insights ↗
                                </a>
                              )}
                            </div>
                          )}

                          {psiState.status === "done" && (
                            <div className="psi-recommendations">
                              <div className="psi-header">
                                <span className="psi-title">Top PageSpeed Recommendations</span>
                                {item.url && (
                                  <a
                                    href={`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(item.url)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="psi-external-link"
                                  >
                                    Full report ↗
                                  </a>
                                )}
                              </div>
                              {psiState.audits.length === 0 ? (
                                <p className="psi-empty">No failed audits found.</p>
                              ) : (
                                <ul className="psi-audit-list">
                                  {psiState.audits.map((audit) => (
                                    <li key={audit.id} className="psi-audit-item">
                                      <div className="psi-audit-header">
                                        <span className={`psi-score-badge psi-score--${audit.score < 0.5 ? "fail" : "warn"}`}>
                                          {Math.round(audit.score * 100)}
                                        </span>
                                        <span className="psi-audit-title">{audit.title}</span>
                                        {audit.displayValue && (
                                          <span className="psi-display-value">{audit.displayValue}</span>
                                        )}
                                      </div>
                                      {audit.description && (
                                        <p className="psi-audit-desc">{audit.description}</p>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}

                  {commentText && (
                    <tr className="row--comment-msg">
                      <td colSpan={showNewRelic ? 6 : 5}>
                        <div className="comment-preview">
                          <span className="comment-preview-icon">✅</span>
                          <span className="comment-preview-text">{commentText}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })
          ) : (
            <tr>
              <td colSpan={showNewRelic ? 6 : 5} className="empty">
                No data — analyze tickets above to populate the dashboard.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {rows.length > 0 && (
        <div className="dashboard-footer">
          <div className="footer-info">
            Showing {(page - 1) * pageSize + 1} to{" "}
            {Math.min(page * pageSize, rows.length)} of {rows.length} results
          </div>
          <div className="pagination">
            <button
              className="page-btn"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              ‹
            </button>
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                className={`page-btn${page === i + 1 ? " active" : ""}`}
                onClick={() => setPage(i + 1)}
              >
                {i + 1}
              </button>
            ))}
            <button
              className="page-btn"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              ›
            </button>
          </div>
          <div className="rows-per-page">
            Rows per page:
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
