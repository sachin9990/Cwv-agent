import type { PsiState, PsiChoice, PsiStrategy } from "./psi";
import { shortenUrl, formatKb } from "./psi";
import "./psi.css";

type Props = {
  url: string;
  state: PsiState;
  onChoiceChange: (choice: PsiChoice) => void;
  onRefresh: () => void;
  onRetry: (strategy: PsiStrategy) => void;
};

export default function PsiPanel({ url, state, onChoiceChange, onRefresh, onRetry }: Props) {
  return (
    <div className="psi-panel">
      <div className="psi-header">
        <span className="psi-title">PageSpeed Recommendations</span>
        <div className="psi-controls">
          <div className="psi-strategy-toggle" role="group" aria-label="Form factor">
            {(["mobile", "desktop", "both"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                className={`psi-strategy-btn${state.choice === opt ? " is-active" : ""}`}
                onClick={() => onChoiceChange(opt)}
                aria-pressed={state.choice === opt}
              >
                {opt === "mobile" ? "📱 Mobile" : opt === "desktop" ? "💻 Desktop" : "Both"}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="psi-refresh-btn"
            onClick={onRefresh}
            title="Re-run PageSpeed Insights"
          >
            ↻ Refresh
          </button>
          {url && (
            <a
              href={`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}`}
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
        .filter((s) => state.choice === s || state.choice === "both")
        .map((strategy) => {
          const result = state[strategy];
          const showLabel = state.choice === "both";
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
                    onClick={() => onRetry(strategy)}
                  >
                    ↺ Try Again
                  </button>
                </div>
              )}
              {result?.status === "done" && result.thirdParties && result.thirdParties.entities.length > 0 && (
                <div className="psi-third-parties">
                  <div className="psi-third-parties-header">
                    <span className="psi-third-parties-title">
                      🌐 Third-party scripts ({result.thirdParties.entityCount})
                    </span>
                    <span className="psi-third-parties-summary">
                      {Math.round(result.thirdParties.totalBlockingTime)} ms blocking ·{" "}
                      {formatKb(result.thirdParties.totalTransferSize)}
                    </span>
                  </div>
                  <ul className="psi-third-parties-list">
                    {result.thirdParties.entities.map((tp) => (
                      <li key={tp.entity} className="psi-third-party-item">
                        <div className="psi-third-party-row">
                          <span className="psi-third-party-name">{tp.entity}</span>
                          <span className="psi-third-party-impact">
                            {Math.round(tp.blockingTime)} ms blocking ·{" "}
                            {Math.round(tp.mainThreadTime)} ms main · {formatKb(tp.transferSize)}
                          </span>
                        </div>
                        {tp.scripts.length > 0 && (
                          <ul className="psi-third-party-scripts">
                            {tp.scripts.map((s, i) => (
                              <li key={i} className="psi-third-party-script">
                                <a
                                  href={s.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="psi-detail-url"
                                  title={s.url}
                                >
                                  {shortenUrl(s.url)}
                                </a>
                                <span className="psi-item-impact">
                                  {Math.round(s.blockingTime)} ms · {formatKb(s.transferSize)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
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
  );
}
