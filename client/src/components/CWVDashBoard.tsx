import React, { useEffect, useMemo, useState } from "react";
import TimeRangePicker, { type TimeRange } from "./TimeRangePicker";
import type { WorkItem } from "../types";
import { API_BASE } from "../lib/api";
import { TESTING } from "../lib/config";
import { MOCK_NR_DATA, mockCommentPreview } from "../lib/mockData";
import ErrorBoundary from "./ErrorBoundary";
import "./CWVDashboard.css";

type Row = WorkItem;
type Toast = { id: string; message: string; type: "success" | "error" };
type PsiNodeRef = { selector?: string; snippet?: string; nodeLabel?: string };
type PsiDetailItem = {
  url?: string;
  totalBytes?: number;
  wastedBytes?: number;
  wastedMs?: number;
  score?: number;
  label?: string;
  groupLabel?: string;
  duration?: number;
  transferSize?: number;
  node?: PsiNodeRef;
};
type PsiDetails = {
  type?: string;
  items: PsiDetailItem[];
  totalItems: number;
  overallSavingsMs?: number | null;
  overallSavingsBytes?: number | null;
};
type PsiAudit = {
  id: string;
  title: string;
  description: string;
  score: number;
  displayValue: string;
  details?: PsiDetails | null;
};

function shortenUrl(url: string, max = 64): string {
  if (url.length <= max) return url;
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    const head = u.host;
    const tailLen = Math.max(8, max - head.length - 3);
    return path.length > tailLen ? `${head}…${path.slice(-tailLen)}` : `${head}${path}`;
  } catch {
    return url.slice(0, max - 1) + "…";
  }
}

function formatKb(bytes: number): string {
  return bytes >= 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${bytes} B`;
}
type PsiResult =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; audits: PsiAudit[] };
type PsiStrategy = "mobile" | "desktop";
type PsiChoice = PsiStrategy | "both";
type PsiState = {
  choice: PsiChoice;
  collapsed?: boolean;
  mobile?: PsiResult;
  desktop?: PsiResult;
};

const PSI_STRATEGY_STORAGE_KEY = "cwv-psi-strategy";
const DEFAULT_PSI_CHOICE: PsiChoice = "mobile";

function readPsiChoice(): PsiChoice {
  const stored = sessionStorage.getItem(PSI_STRATEGY_STORAGE_KEY);
  return stored === "mobile" || stored === "desktop" || stored === "both" ? stored : DEFAULT_PSI_CHOICE;
}
type RunStats = { total: number; good: number; needsFix: number; critical: number };
type StatusFilter = "All" | "Green" | "Amber" | "Red";
type MetricFilter = "All" | "LCP" | "CLS" | "INP";

const DEFAULT_RANGE: TimeRange = { kind: "relative", since: "7 days", label: "7 days" };

export default function CWVDashboard({
  data,
  onGoAnalyze,
}: {
  data: Row[];
  onGoAnalyze?: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(data);
  const [showNewRelic, setShowNewRelic] = useState(false);
  const [range, setRange] = useState<TimeRange>(DEFAULT_RANGE);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [commentingId, setCommentingId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [psiMap, setPsiMap] = useState<Record<string, PsiState>>({});
  const [commentMap, setCommentMap] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [prevStats, setPrevStats] = useState<RunStats | null>(() => {
    const s = localStorage.getItem("cwv-prev-stats");
    return s ? JSON.parse(s) : null;
  });

  // Filter state — persisted to localStorage
  const [search, setSearch] = useState(() => localStorage.getItem("cwv-filter-search") ?? "");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    () => (localStorage.getItem("cwv-filter-status") as StatusFilter) ?? "All"
  );
  const [metricFilter, setMetricFilter] = useState<MetricFilter>(
    () => (localStorage.getItem("cwv-filter-metric") as MetricFilter) ?? "All"
  );

  const showToast = (message: string, type: "success" | "error") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };

  useEffect(() => {
    setRows(data);
    setShowNewRelic(false);
    setPage(1);
    setSelectedIds(new Set());
  }, [data]);

  // Persist filters across page navigations
  useEffect(() => {
    localStorage.setItem("cwv-filter-search", search);
    localStorage.setItem("cwv-filter-status", statusFilter);
    localStorage.setItem("cwv-filter-metric", metricFilter);
  }, [search, statusFilter, metricFilter]);

  // Reset to page 1 whenever any filter changes
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, metricFilter]);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("All");
    setMetricFilter("All");
  };

  const hasActiveFilters = search.trim() !== "" || statusFilter !== "All" || metricFilter !== "All";

  const saveRunStats = (updated: Row[]) => {
    const counted = updated.filter((r) => r.newRelicStatus);
    const newStats: RunStats = {
      total: counted.length,
      good: counted.filter((r) => r.newRelicStatus === "Green").length,
      needsFix: counted.filter((r) => r.newRelicStatus === "Amber").length,
      critical: counted.filter((r) => r.newRelicStatus === "Red").length,
    };
    const prev = localStorage.getItem("cwv-prev-stats");
    setPrevStats(prev ? JSON.parse(prev) : null);
    localStorage.setItem("cwv-prev-stats", JSON.stringify(newStats));
  };

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
    return `${API_BASE}/get-metric?${params.toString()}`;
  };

  const fetchMetric = async (row: Row): Promise<Row> => {
    if (!row.url || !row.metric) return row;
    try {
      const resp = await fetch(buildMetricUrl(row));
      const result = await resp.json();
      if (!resp.ok) {
        console.error(`Metric fetch failed for ${row.ticket_id}:`, result?.detail ?? resp.status);
        return row;
      }
      return { ...row, newRelicValue: result.value ?? null, newRelicStatus: result.status ?? null };
    } catch {
      return row;
    }
  };

  const handleGetData = async () => {
    setLoading(true);
    if (TESTING) {
      await new Promise((r) => setTimeout(r, 800));
      const updated = rows.map((row) => {
        const nr = MOCK_NR_DATA[row.ticket_id];
        return nr ? { ...row, newRelicValue: nr.value, newRelicStatus: nr.status } : row;
      });
      setRows(updated);
      setShowNewRelic(true);
      saveRunStats(updated);
      setLoading(false);
      return;
    }
    const updated = await Promise.all(rows.map(fetchMetric));
    setRows(updated);
    setShowNewRelic(true);
    saveRunStats(updated);
    setLoading(false);
  };

  const handleComment = async (row: Row, silent = false) => {
    setCommentingId(row.ticket_id);
    try {
      if (TESTING) {
        await new Promise((r) => setTimeout(r, 500));
        const preview = mockCommentPreview(row.ticket_id, row.metric, row.newRelicValue ?? null);
        setCommentMap((prev) => ({ ...prev, [row.ticket_id]: preview }));
        if (!silent) showToast(`Comment added to ${row.ticket_id}`, "success");
        return;
      }
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
      const resp = await fetch(`${API_BASE}/comment-assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await resp.json();
      if (result.success && result.comment_preview) {
        setCommentMap((prev) => ({ ...prev, [row.ticket_id]: result.comment_preview }));
        if (!silent) showToast(`Comment added to ${row.ticket_id}`, "success");
      } else {
        if (!silent) showToast(result.message ?? "Failed to add comment", "error");
      }
    } catch (err) {
      if (!silent) showToast(`Error: ${err}`, "error");
    } finally {
      setCommentingId(null);
    }
  };

  const fetchPsiStrategy = async (row: Row, strategy: PsiStrategy) => {
    if (!row.url) return;
    setPsiMap((prev) => {
      const existing = prev[row.ticket_id];
      const choice = existing?.choice ?? readPsiChoice();
      return { ...prev, [row.ticket_id]: { ...existing, choice, [strategy]: { status: "loading" } } };
    });
    try {
      const params = new URLSearchParams({ url: row.url, strategy });
      if (row.metric) params.set("metric", row.metric);
      const resp = await fetch(`${API_BASE}/get-pagespeed?${params}`);
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.detail ?? `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setPsiMap((prev) => {
        const existing = prev[row.ticket_id];
        if (!existing) return prev;
        return { ...prev, [row.ticket_id]: { ...existing, [strategy]: { status: "done", audits: data.recommendations } } };
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setPsiMap((prev) => {
        const existing = prev[row.ticket_id];
        if (!existing) return prev;
        return { ...prev, [row.ticket_id]: { ...existing, [strategy]: { status: "error", message } } };
      });
    }
  };

  const ensurePsiForChoice = (row: Row, choice: PsiChoice, current?: PsiState) => {
    const targets: PsiStrategy[] = choice === "both" ? ["mobile", "desktop"] : [choice];
    for (const strategy of targets) {
      if (!current?.[strategy]) {
        fetchPsiStrategy(row, strategy);
      }
    }
  };

  const handleFix = (row: Row) => {
    if (!row.url) return;
    const existing = psiMap[row.ticket_id];
    if (existing) {
      setPsiMap((prev) => ({ ...prev, [row.ticket_id]: { ...existing, collapsed: !existing.collapsed } }));
      return;
    }
    const choice = readPsiChoice();
    setPsiMap((prev) => ({ ...prev, [row.ticket_id]: { choice, collapsed: false } }));
    ensurePsiForChoice(row, choice);
  };

  const handlePsiChoiceChange = (row: Row, choice: PsiChoice) => {
    sessionStorage.setItem(PSI_STRATEGY_STORAGE_KEY, choice);
    setPsiMap((prev) => {
      const existing = prev[row.ticket_id];
      if (!existing) return prev;
      return { ...prev, [row.ticket_id]: { ...existing, choice } };
    });
    ensurePsiForChoice(row, choice, psiMap[row.ticket_id]);
  };

  const handlePsiRefresh = (row: Row) => {
    const existing = psiMap[row.ticket_id];
    if (!existing) return;
    const targets: PsiStrategy[] = existing.choice === "both" ? ["mobile", "desktop"] : [existing.choice];
    for (const strategy of targets) {
      fetchPsiStrategy(row, strategy);
    }
  };

  // Filtered rows — drives the table; summary cards always count all rows
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!row.ticket_id.toLowerCase().includes(q) && !(row.url ?? "").toLowerCase().includes(q)) {
          return false;
        }
      }
      if (statusFilter !== "All") {
        const rowStatus = row.newRelicStatus ?? row.status;
        if (rowStatus !== statusFilter) return false;
      }
      if (metricFilter !== "All") {
        if (row.metric !== metricFilter) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter, metricFilter]);

  const selectableIds = useMemo(
    () => filteredRows.filter((r) => r.newRelicStatus === "Green" && !commentMap[r.ticket_id]).map((r) => r.ticket_id),
    [filteredRows, commentMap]
  );

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const handleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(selectableIds));
  };

  const handleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkComment = async () => {
    const toComment = rows.filter((r) => selectedIds.has(r.ticket_id));
    setBulkProgress({ done: 0, total: toComment.length });
    for (let i = 0; i < toComment.length; i++) {
      await handleComment(toComment[i], true);
      setBulkProgress({ done: i + 1, total: toComment.length });
    }
    setSelectedIds(new Set());
    setBulkProgress(null);
    showToast(`${toComment.length} ticket(s) commented successfully`, "success");
  };

  // Summary stats always reflect all rows (not filtered)
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

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  const trendBadge = (current: number, prev: number, positiveIsGood: boolean) => {
    if (!showNewRelic || !prevStats) return null;
    const diff = current - prev;
    if (diff === 0) return null;
    const good = positiveIsGood ? diff > 0 : diff < 0;
    return (
      <span className={`trend-badge trend-badge--${good ? "good" : "bad"}`}>
        {diff > 0 ? "↑" : "↓"} {Math.abs(diff)}
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
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <svg
            className="empty-state-svg"
            viewBox="0 0 160 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect x="12" y="12" width="136" height="96" rx="8" stroke="currentColor" strokeWidth="2" strokeDasharray="6 4" opacity="0.3" />
            <rect x="28" y="34" width="48" height="8" rx="4" fill="currentColor" opacity="0.18" />
            <rect x="28" y="50" width="72" height="8" rx="4" fill="currentColor" opacity="0.13" />
            <rect x="28" y="66" width="60" height="8" rx="4" fill="currentColor" opacity="0.09" />
            <rect x="28" y="82" width="36" height="8" rx="4" fill="currentColor" opacity="0.06" />
            <circle cx="120" cy="60" r="22" fill="currentColor" opacity="0.07" />
            <text x="120" y="67" textAnchor="middle" fontSize="24" fill="currentColor" opacity="0.3">?</text>
          </svg>
          <h3 className="empty-state-title">No data yet</h3>
          <p className="empty-state-body">
            Submit ticket IDs or upload a CSV on the Analyze page to populate the dashboard.
          </p>
          {onGoAnalyze && (
            <button className="empty-state-cta" onClick={onGoAnalyze}>
              Go to Analyze →
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="summary-row">
            <div className="summary-card total">
              <div className="summary-icon total-icon">📋</div>
              <div className="summary-body">
                <div className="summary-label">Total Bugs</div>
                <div className="summary-value">
                  {stats.total}
                  {trendBadge(stats.total, prevStats?.total ?? 0, true)}
                </div>
              </div>
            </div>
            <div className="summary-card good">
              <div className="summary-icon good-icon">✓</div>
              <div className="summary-body">
                <div className="summary-label">Good</div>
                <div className="summary-value">
                  {stats.good}{" "}
                  <span className="summary-pct">{pct(stats.good, stats.total)}</span>
                  {trendBadge(stats.good, prevStats?.good ?? 0, true)}
                </div>
              </div>
            </div>
            <div className="summary-card warning">
              <div className="summary-icon warning-icon">🔧</div>
              <div className="summary-body">
                <div className="summary-label">Needs Fix</div>
                <div className="summary-value">
                  {stats.needsFix}{" "}
                  <span className="summary-pct">{pct(stats.needsFix, stats.total)}</span>
                  {trendBadge(stats.needsFix, prevStats?.needsFix ?? 0, false)}
                </div>
              </div>
            </div>
            <div className="summary-card critical">
              <div className="summary-icon critical-icon">⚠</div>
              <div className="summary-body">
                <div className="summary-label">Critical</div>
                <div className="summary-value">
                  {stats.critical}{" "}
                  <span className="summary-pct">{pct(stats.critical, stats.total)}</span>
                  {trendBadge(stats.critical, prevStats?.critical ?? 0, false)}
                </div>
              </div>
            </div>
          </div>

          <div className="dashboard-toolbar">
            <TimeRangePicker value={range} onChange={setRange} />
            {selectedIds.size > 0 && (
              <button
                className="bulk-comment-btn"
                onClick={handleBulkComment}
                disabled={bulkProgress !== null}
              >
                {bulkProgress
                  ? `Commenting ${bulkProgress.done}/${bulkProgress.total}…`
                  : `💬 Bulk Comment (${selectedIds.size})`}
              </button>
            )}
            <button
              className="get-data-btn"
              onClick={handleGetData}
              disabled={loading || rows.length === 0}
            >
              {loading ? "Fetching…" : "Get Data from New Relic"}
            </button>
          </div>

          {/* ── Filter bar ── */}
          <div className="filter-bar">
            <div className="filter-search-wrap">
              <svg className="filter-search-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                className="filter-search-input"
                placeholder="Search by ticket ID or URL…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button className="filter-search-clear" onClick={() => setSearch("")} aria-label="Clear search">
                  ✕
                </button>
              )}
            </div>

            <div className="filter-status-group">
              {(["All", "Green", "Amber", "Red"] as const).map((s) => (
                <button
                  key={s}
                  className={`filter-status-btn filter-status-btn--${s.toLowerCase()}${statusFilter === s ? " active" : ""}`}
                  onClick={() => setStatusFilter(s)}
                >
                  {s}
                </button>
              ))}
            </div>

            <select
              className="filter-metric-select"
              value={metricFilter}
              onChange={(e) => setMetricFilter(e.target.value as MetricFilter)}
            >
              {(["All", "LCP", "CLS", "INP"] as const).map((m) => (
                <option key={m} value={m}>{m === "All" ? "All Metrics" : m}</option>
              ))}
            </select>

            {hasActiveFilters && (
              <button className="filter-clear-all" onClick={clearFilters}>
                Clear
              </button>
            )}
          </div>

          <div className="table-wrapper">
            <table className="bugs-table">
              <thead>
                <tr>
                  <th className="th-checkbox col-checkbox">
                    {showNewRelic && selectableIds.length > 0 && (
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={handleSelectAll}
                        title="Select all Green tickets"
                      />
                    )}
                  </th>
                  <th className="col-bugid">Bug ID</th>
                  <th className="col-title">Title / URL</th>
                  <th className="col-param">Metric</th>
                  <th className="col-azure">Azure Value</th>
                  {showNewRelic && <th className="col-nr">New Relic (Mobile)</th>}
                  <th className="col-action">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: pageSize }).map((_, i) => (
                    <tr key={i} className="skeleton-row">
                      <td><span className="skeleton-cell skeleton-checkbox" /></td>
                      <td><span className="skeleton-cell skeleton-short" /></td>
                      <td><span className="skeleton-cell skeleton-long" /></td>
                      <td><span className="skeleton-cell skeleton-short" /></td>
                      <td><span className="skeleton-cell skeleton-medium" /></td>
                      {showNewRelic && <td><span className="skeleton-cell skeleton-medium" /></td>}
                      <td><span className="skeleton-cell skeleton-medium" /></td>
                    </tr>
                  ))
                ) : pageRows.length > 0 ? (
                  pageRows.map((item) => {
                    const psiState = psiMap[item.ticket_id];
                    const commentText = commentMap[item.ticket_id];
                    return (
                      <ErrorBoundary
                        key={item.ticket_id}
                        fallback={
                          <tr>
                            <td colSpan={showNewRelic ? 7 : 6} className="row-error">
                              Failed to render row {item.ticket_id}.
                            </td>
                          </tr>
                        }
                      >
                        <React.Fragment>
                          <tr className={commentText ? "row--commented" : ""}>
                            <td className="td-checkbox">
                              {showNewRelic && item.newRelicStatus === "Green" && !commentText && (
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(item.ticket_id)}
                                  onChange={() => handleSelectRow(item.ticket_id)}
                                />
                              )}
                            </td>
                            <td className="bug-id">{item.ticket_id}</td>
                            <td className="url-cell">
                              {item.url ? (
                                <a href={item.url} target="_blank" rel="noopener noreferrer" title={item.url}>
                                  {item.url}
                                </a>
                              ) : (
                                <span className="url-not-found">URL not found in the given ticket Id</span>
                              )}
                            </td>
                            <td>{item.metric ?? "-"}</td>
                            <td>
                              <span className={`value-cell ${item.status?.toLowerCase() ?? ""}`}>
                                {item.value !== null && item.value !== undefined ? item.value.toFixed(3) : "—"}
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
                              {!item.url || !item.metric ? (
                                <span className="no-cwv-badge" title="This ticket's title does not contain a CWV metric or URL">No CWV data</span>
                              ) : showNewRelic && item.newRelicStatus === "Green" ? (
                                <button
                                  className="action-btn comment"
                                  onClick={() => handleComment(item)}
                                  disabled={commentingId === item.ticket_id || !!commentText}
                                >
                                  {commentText ? "✅ Commented" : commentingId === item.ticket_id ? "Commenting…" : "💬 Comment"}
                                </button>
                              ) : showNewRelic && item.newRelicStatus ? (
                                <button
                                  className={`action-btn fix${psiState && !psiState.collapsed ? " fix--active" : ""}`}
                                  onClick={() => handleFix(item)}
                                >
                                  {!psiState ? "Get Recommendations" : psiState.collapsed ? "▼ Expand" : "▲ Collapse"}
                                </button>
                              ) : (
                                <span className="muted">—</span>
                              )}
                            </td>
                          </tr>

                          {psiState && !psiState.collapsed && (
                            <tr className="psi-expanded-row">
                              <td colSpan={showNewRelic ? 7 : 6}>
                                <div className="psi-panel">
                                  <div className="psi-header">
                                    <span className="psi-title">PageSpeed Recommendations</span>
                                    <div className="psi-controls">
                                      <div className="psi-strategy-toggle" role="group" aria-label="Form factor">
                                        {(["mobile", "desktop", "both"] as const).map((opt) => (
                                          <button
                                            key={opt}
                                            type="button"
                                            className={`psi-strategy-btn${psiState.choice === opt ? " is-active" : ""}`}
                                            onClick={() => handlePsiChoiceChange(item, opt)}
                                            aria-pressed={psiState.choice === opt}
                                          >
                                            {opt === "mobile" ? "📱 Mobile" : opt === "desktop" ? "💻 Desktop" : "Both"}
                                          </button>
                                        ))}
                                      </div>
                                      <button
                                        type="button"
                                        className="psi-refresh-btn"
                                        onClick={() => handlePsiRefresh(item)}
                                        title="Re-run PageSpeed Insights"
                                      >
                                        ↻ Refresh
                                      </button>
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
                                  </div>

                                  {(["mobile", "desktop"] as const)
                                    .filter((s) => psiState.choice === s || psiState.choice === "both")
                                    .map((strategy) => {
                                      const result = psiState[strategy];
                                      const showLabel = psiState.choice === "both";
                                      return (
                                        <div key={strategy} className="psi-strategy-section">
                                          {showLabel && (
                                            <div className="psi-strategy-label">
                                              {strategy === "mobile" ? "📱 Mobile" : "💻 Desktop"}
                                            </div>
                                          )}
                                          {(!result || result.status === "loading") && (
                                            <div className="psi-loading">
                                              <span className="psi-spinner" aria-label="Loading" />
                                              Fetching {strategy} recommendations…
                                            </div>
                                          )}
                                          {result?.status === "error" && (
                                            <div className="psi-error">
                                              <span className="psi-error-msg">
                                                Could not load {strategy} recommendations: {result.message}
                                              </span>
                                              <button
                                                type="button"
                                                className="psi-retry-btn"
                                                onClick={() => fetchPsiStrategy(item, strategy)}
                                              >
                                                ↺ Try Again
                                              </button>
                                            </div>
                                          )}
                                          {result?.status === "done" && (
                                            result.audits.length === 0 ? (
                                              <p className="psi-empty">No failed audits found.</p>
                                            ) : (
                                              <ul className="psi-audit-list">
                                                {result.audits.map((audit) => (
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
                                                    {audit.details && audit.details.items.length > 0 && (
                                                      <div className="psi-details">
                                                        {(audit.details.overallSavingsMs || audit.details.overallSavingsBytes) && (
                                                          <div className="psi-savings-summary">
                                                            Potential savings:{" "}
                                                            {audit.details.overallSavingsMs
                                                              ? `${Math.round(audit.details.overallSavingsMs)} ms`
                                                              : ""}
                                                            {audit.details.overallSavingsMs && audit.details.overallSavingsBytes ? " · " : ""}
                                                            {audit.details.overallSavingsBytes
                                                              ? formatKb(audit.details.overallSavingsBytes)
                                                              : ""}
                                                          </div>
                                                        )}
                                                        <ul className="psi-detail-list">
                                                          {audit.details.items.map((it, i) => {
                                                            const impactParts: string[] = [];
                                                            if (it.wastedMs) impactParts.push(`${Math.round(it.wastedMs)} ms`);
                                                            if (it.wastedBytes) impactParts.push(formatKb(it.wastedBytes));
                                                            if (!it.wastedMs && !it.wastedBytes && typeof it.score === "number") {
                                                              impactParts.push(`shift: ${it.score.toFixed(3)}`);
                                                            }
                                                            if (!impactParts.length && it.totalBytes) impactParts.push(formatKb(it.totalBytes));
                                                            return (
                                                              <li key={i} className="psi-detail-item">
                                                                {it.node?.selector && (
                                                                  <code className="psi-selector" title={it.node.snippet}>
                                                                    {it.node.selector}
                                                                  </code>
                                                                )}
                                                                {it.url && (
                                                                  <a
                                                                    href={it.url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="psi-detail-url"
                                                                    title={it.url}
                                                                  >
                                                                    {shortenUrl(it.url)}
                                                                  </a>
                                                                )}
                                                                {!it.node?.selector && !it.url && (it.label || it.groupLabel) && (
                                                                  <span className="psi-detail-label">{it.label ?? it.groupLabel}</span>
                                                                )}
                                                                {impactParts.length > 0 && (
                                                                  <span className="psi-item-impact">{impactParts.join(" · ")}</span>
                                                                )}
                                                              </li>
                                                            );
                                                          })}
                                                        </ul>
                                                        {audit.details.totalItems > audit.details.items.length && (
                                                          <div className="psi-more">
                                                            + {audit.details.totalItems - audit.details.items.length} more
                                                          </div>
                                                        )}
                                                      </div>
                                                    )}
                                                  </li>
                                                ))}
                                              </ul>
                                            )
                                          )}
                                        </div>
                                      );
                                    })}
                                </div>
                              </td>
                            </tr>
                          )}

                          {commentText && (
                            <tr className="row--comment-msg">
                              <td colSpan={showNewRelic ? 7 : 6}>
                                <div className="comment-preview">
                                  <span className="comment-preview-icon">✅</span>
                                  <span className="comment-preview-text">{commentText}</span>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      </ErrorBoundary>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={showNewRelic ? 7 : 6} className="empty">
                      {hasActiveFilters ? (
                        <>
                          No tickets match the current filters.{" "}
                          <button className="empty-clear-filters" onClick={clearFilters}>
                            Clear filters
                          </button>
                        </>
                      ) : (
                        "No data — analyze tickets above to populate the dashboard."
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredRows.length > 0 && (
            <div className="dashboard-footer">
              <div className="footer-info">
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredRows.length)} of{" "}
                {filteredRows.length}
                {filteredRows.length !== rows.length && (
                  <span className="footer-filtered"> ({rows.length} total)</span>
                )}
              </div>
              <div className="pagination">
                <button className="page-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                  ‹
                </button>
                {(() => {
                  const pages: (number | "…")[] = [];
                  if (totalPages <= 7) {
                    for (let i = 1; i <= totalPages; i++) pages.push(i);
                  } else {
                    pages.push(1);
                    if (page > 3) pages.push("…");
                    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
                    if (page < totalPages - 2) pages.push("…");
                    pages.push(totalPages);
                  }
                  return pages.map((p, i) =>
                    p === "…" ? (
                      <span key={`ellipsis-${i}`} className="page-ellipsis">…</span>
                    ) : (
                      <button
                        key={p}
                        className={`page-btn${page === p ? " active" : ""}`}
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </button>
                    )
                  );
                })()}
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
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
              </div>
            </div>
          )}
        </>
      )}

      <div className="toast-container" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.type}`}>
            <span className="toast-icon">{toast.type === "success" ? "✅" : "❌"}</span>
            <span className="toast-msg">{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
