import { useState } from "react";
import TimeRangePicker, { type TimeRange } from "./TimeRangePicker";
import PsiPanel from "./PsiPanel";
import { API_BASE } from "../lib/api";
import {
  fetchPsi,
  readPsiChoice,
  writePsiChoice,
  type PsiChoice,
  type PsiState,
  type PsiStrategy,
} from "./psi";
import "./CheckUrl.css";

type Metric = "LCP" | "CLS" | "INP";
const METRICS: Metric[] = ["LCP", "CLS", "INP"];

type MetricResult =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; value: number | null; verdict: string | null; window: string };

type MetricsMap = Partial<Record<Metric, MetricResult>>;
type PsiMap = Partial<Record<Metric, PsiState>>;

const DEFAULT_RANGE: TimeRange = { kind: "relative", since: "7 days", label: "7 days" };

function formatMetricValue(metric: Metric, value: number | null): string {
  if (value === null || value === undefined) return "—";
  if (metric === "CLS") return value.toFixed(3);
  return `${value.toFixed(3)} ms`;
}

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export default function CheckUrl() {
  const [url, setUrl] = useState("");
  const [range, setRange] = useState<TimeRange>(DEFAULT_RANGE);
  const [metrics, setMetrics] = useState<MetricsMap>({});
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  // Per-metric PSI state
  const [psiMap, setPsiMap] = useState<PsiMap>({});
  const [activeMetric, setActiveMetric] = useState<Metric | null>(null);
  const [psiUrl, setPsiUrl] = useState<string>("");

  const buildMetricUrl = (metric: Metric, targetUrl: string) => {
    const params = new URLSearchParams({ ticket_id: "check-url", url: targetUrl, metric });
    if (range.kind === "relative") {
      params.set("since", range.since);
    } else {
      params.set("from_time", range.from);
      params.set("to_time", range.to);
      params.set("timezone", range.timezone);
    }
    return `${API_BASE}/get-metric?${params.toString()}`;
  };

  const fetchMetric = async (metric: Metric, targetUrl: string): Promise<MetricResult> => {
    try {
      const resp = await fetch(buildMetricUrl(metric, targetUrl));
      const data = await resp.json();
      if (!resp.ok) return { status: "error", message: data?.detail ?? `HTTP ${resp.status}` };
      return { status: "done", value: data.value ?? null, verdict: data.status ?? null, window: data.window ?? "" };
    } catch (err) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  };

  const handleGetMetrics = async () => {
    const trimmed = url.trim();
    if (!trimmed) { setUrlError("Enter a URL to check."); return; }
    if (!isValidUrl(trimmed)) { setUrlError("Please enter a valid http:// or https:// URL."); return; }
    setUrlError(null);
    setMetricsLoading(true);
    // Reset per-metric PSI when URL is re-fetched
    setPsiMap({});
    setActiveMetric(null);
    setMetrics(Object.fromEntries(METRICS.map((m) => [m, { status: "loading" }])) as MetricsMap);
    const results = await Promise.all(METRICS.map((m) => fetchMetric(m, trimmed)));
    const next: MetricsMap = {};
    METRICS.forEach((m, i) => { next[m] = results[i]; });
    setMetrics(next);
    setMetricsLoading(false);
  };

  const runPsiStrategies = async (metric: Metric, targetUrl: string, choice: PsiChoice) => {
    const targets: PsiStrategy[] = choice === "both" ? ["mobile", "desktop"] : [choice];
    for (const strategy of targets) {
      setPsiMap((prev) => ({
        ...prev,
        [metric]: { ...(prev[metric] ?? { choice }), [strategy]: { status: "loading" } },
      }));
      try {
        const data = await fetchPsi(targetUrl, strategy, metric);
        setPsiMap((prev) => {
          const existing = prev[metric];
          if (!existing) return prev;
          return { ...prev, [metric]: { ...existing, [strategy]: { status: "done", audits: data.audits, thirdParties: data.thirdParties } } };
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setPsiMap((prev) => {
          const existing = prev[metric];
          if (!existing) return prev;
          return { ...prev, [metric]: { ...existing, [strategy]: { status: "error", message } } };
        });
      }
    }
  };

  const handleGetSuggestion = (metric: Metric) => {
    const trimmed = url.trim();
    if (!isValidUrl(trimmed)) { setUrlError("Please enter a valid http:// or https:// URL."); return; }
    setUrlError(null);

    // Toggle collapse if already open for this metric
    if (activeMetric === metric) {
      setActiveMetric(null);
      return;
    }

    setActiveMetric(metric);
    setPsiUrl(trimmed);

    // Only fetch if not already fetched
    if (!psiMap[metric]) {
      const choice = readPsiChoice();
      setPsiMap((prev) => ({ ...prev, [metric]: { choice } }));
      runPsiStrategies(metric, trimmed, choice);
    }
  };

  const handlePsiChoiceChange = (metric: Metric, choice: PsiChoice) => {
    writePsiChoice(choice);
    setPsiMap((prev) => {
      const existing = prev[metric];
      if (!existing) return prev;
      return { ...prev, [metric]: { ...existing, choice } };
    });
    const targets: PsiStrategy[] = choice === "both" ? ["mobile", "desktop"] : [choice];
    const existing = psiMap[metric];
    const missing = targets.filter((s) => !existing?.[s]);
    if (missing.length > 0 && psiUrl) {
      runPsiStrategies(metric, psiUrl, choice);
    }
  };

  const handlePsiRefresh = (metric: Metric) => {
    const existing = psiMap[metric];
    if (!existing || !psiUrl) return;
    runPsiStrategies(metric, psiUrl, existing.choice);
  };

  const handlePsiRetry = (metric: Metric, strategy: PsiStrategy) => {
    if (!psiUrl) return;
    const existing = psiMap[metric];
    if (!existing) return;
    runPsiStrategies(metric, psiUrl, strategy);
  };

  const hasMetrics = Object.keys(metrics).length > 0;
  const activePsiState = activeMetric ? psiMap[activeMetric] : null;

  return (
    <div className="check-url-page">
      <header className="check-url-header">
        <h1>Check URLs</h1>
        <p className="check-url-subtitle">
          Enter any URL to fetch Core Web Vitals from New Relic and get PageSpeed recommendations.
        </p>
      </header>

      <section className="check-url-form">
        <div className="check-url-row">
          <input
            type="text"
            className="check-url-input"
            placeholder="https://example.com/page"
            value={url}
            onChange={(e) => { setUrl(e.target.value); if (urlError) setUrlError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !metricsLoading) handleGetMetrics(); }}
          />
          <TimeRangePicker value={range} onChange={setRange} />
          <button
            type="button"
            className="check-url-btn check-url-btn--primary"
            onClick={handleGetMetrics}
            disabled={metricsLoading}
          >
            {metricsLoading ? "Fetching…" : "Get Metrics"}
          </button>
        </div>
        {urlError && <p className="check-url-error">{urlError}</p>}
      </section>

      {hasMetrics && (
        <section className="check-url-metrics">
          {METRICS.map((metric) => {
            const result = metrics[metric];
            const isActive = activeMetric === metric;
            return (
              <div key={metric} className={`metric-card${isActive ? " metric-card--active" : ""}`}>
                <div className="metric-card-header">
                  <span className="metric-card-name">{metric}</span>
                  {result?.status === "done" && result.verdict && (
                    <span className={`history-status-badge history-status-badge--${result.verdict.toLowerCase()}`}>
                      {result.verdict}
                    </span>
                  )}
                </div>
                <div className="metric-card-value">
                  {!result || result.status === "loading" ? (
                    <span className="metric-card-loading">Loading…</span>
                  ) : result.status === "error" ? (
                    <span className="metric-card-error" title={result.message}>—</span>
                  ) : (
                    formatMetricValue(metric, result.value)
                  )}
                </div>
                {result?.status === "done" && result.window && (
                  <div className="metric-card-window">{result.window}</div>
                )}
                {result?.status === "error" && (
                  <div className="metric-card-error-msg">{result.message}</div>
                )}
                <button
                  type="button"
                  className={`metric-card-suggestion-btn${isActive ? " is-active" : ""}`}
                  onClick={() => handleGetSuggestion(metric)}
                  disabled={!url.trim()}
                >
                  {isActive ? "▲ Hide Suggestions" : "💡 Get Suggestion"}
                </button>
              </div>
            );
          })}
        </section>
      )}

      {activeMetric && activePsiState && psiUrl && (
        <section className="check-url-psi">
          <div className="check-url-psi-label">
            Suggestions for <strong>{activeMetric}</strong>
          </div>
          <PsiPanel
            url={psiUrl}
            state={activePsiState}
            onChoiceChange={(choice) => handlePsiChoiceChange(activeMetric, choice)}
            onRefresh={() => handlePsiRefresh(activeMetric)}
            onRetry={(strategy) => handlePsiRetry(activeMetric, strategy)}
          />
        </section>
      )}
    </div>
  );
}
