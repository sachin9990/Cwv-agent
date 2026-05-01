import { useEffect, useMemo, useState } from "react";
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

const DEFAULT_RANGE: TimeRange = {
  kind: "relative",
  since: "7 days",
  label: "Last 7 Days",
};

export default function CWVDashboard({ data }: { data: Row[] }) {
  const [rows, setRows] = useState<Row[]>(data);
  const [showNewRelic, setShowNewRelic] = useState(false);
  const [range, setRange] = useState<TimeRange>(DEFAULT_RANGE);
  const [tz, setTz] = useState<string>("Asia/Kolkata");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [commentingId, setCommentingId] = useState<string | null>(null);

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
      alert(result.message ?? (result.success ? "Comment added" : "Failed"));
    } catch (err) {
      alert(`Error: ${err}`);
    } finally {
      setCommentingId(null);
    }
  };

  const handleFix = (row: Row) => {
    if (!row.url) return;
    const target = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(row.url)}`;
    window.open(target, "_blank", "noopener,noreferrer");
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

  const statusChip = (status: string | null | undefined) => {
    if (!status) return <span className="status-cell">—</span>;
    const cls =
      status === "Green" ? "good" : status === "Amber" ? "warning" : "critical";
    const label =
      status === "Green" ? "Good" : status === "Amber" ? "Needs Fix" : "Critical";
    return (
      <span className={`status-cell ${cls}`}>
        <span className={`status-dot ${cls}`} />
        {label}
      </span>
    );
  };

  return (
    <div className="dashboard-card" id="dashboard">
      <div className="dashboard-header">
        <div>
          <h2 className="dashboard-title">CWV Dashboard</h2>
          <p className="dashboard-subtitle">
            Overview of Core Web Vitals issues for your tickets
          </p>
        </div>
        <div className="dashboard-controls">
          <TimeRangePicker value={range} onChange={setRange} />
          <div className="tz-pill">
            <span className="tz-icon">🌐</span>
            <select
              className="tz-select"
              value={tz}
              onChange={(e) => setTz(e.target.value)}
            >
              <option value="Asia/Kolkata">Time Zone: Asia/Kolkata</option>
              <option value="Etc/UTC">Time Zone: Etc/UTC</option>
              <option value="America/New_York">Time Zone: America/New_York</option>
              <option value="Europe/London">Time Zone: Europe/London</option>
            </select>
          </div>
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
            <th>
              Actual Value
              <div className="th-sub">(vs Previous {range.label})</div>
            </th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {pageRows.length > 0 ? (
            pageRows.map((item) => {
              const displayValue = showNewRelic ? item.newRelicValue : item.value;
              const displayStatus = showNewRelic ? item.newRelicStatus : item.status;
              return (
                <tr key={item.ticket_id}>
                  <td className="bug-id">
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noopener noreferrer">
                        {item.ticket_id}
                      </a>
                    ) : (
                      item.ticket_id
                    )}
                  </td>
                  <td>{item.url ?? "-"}</td>
                  <td>
                    {item.metric ? (
                      <span className={`param-chip ${item.metric.toLowerCase()}`}>
                        {item.metric}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    <span className={`value-cell ${displayStatus?.toLowerCase() ?? ""}`}>
                      {displayValue !== null && displayValue !== undefined
                        ? typeof displayValue === "number"
                          ? displayValue.toFixed(3)
                          : displayValue
                        : "—"}
                    </span>
                  </td>
                  <td>{statusChip(displayStatus)}</td>
                  <td>
                    {showNewRelic && item.newRelicStatus === "Green" ? (
                      <button
                        className="action-btn comment"
                        onClick={() => handleComment(item)}
                        disabled={commentingId === item.ticket_id}
                      >
                        💬 {commentingId === item.ticket_id ? "Commenting…" : "Comment"}
                      </button>
                    ) : showNewRelic && item.newRelicStatus ? (
                      <button
                        className="action-btn fix"
                        onClick={() => handleFix(item)}
                      >
                        🔧 Fix
                      </button>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={6} className="empty">
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
