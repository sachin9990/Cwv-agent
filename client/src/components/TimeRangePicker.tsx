import { useEffect, useRef, useState } from "react";
import "./TimeRangePicker.css";

export type TimeRange =
  | { kind: "relative"; since: string; label: string }
  | { kind: "custom"; from: string; to: string; timezone: string; label: string };

type Props = {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
};

const PRESETS: { label: string; since: string }[] = [
  { label: "5 minutes", since: "5 minutes" },
  { label: "30 minutes", since: "30 minutes" },
  { label: "60 minutes", since: "60 minutes" },
  { label: "3 hours", since: "3 hours" },
  { label: "6 hours", since: "6 hours" },
  { label: "12 hours", since: "12 hours" },
  { label: "24 hours", since: "24 hours" },
  { label: "3 days", since: "3 days" },
  { label: "7 days", since: "7 days" },
  { label: "1 month", since: "1 month" },
  { label: "3 months", since: "3 months" },
  { label: "6 months", since: "6 months" },
];

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function nowIso(): { date: string; time: string } {
  const d = new Date();
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function fiveMinutesAgoIso(): { date: string; time: string } {
  const d = new Date(Date.now() - 5 * 60 * 1000);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export default function TimeRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(value.kind === "custom");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const initialFrom = value.kind === "custom" ? value.from : "";
  const initialTo = value.kind === "custom" ? value.to : "";
  const [fromDate, setFromDate] = useState(initialFrom.split(" ")[0] || fiveMinutesAgoIso().date);
  const [fromTime, setFromTime] = useState(
    initialFrom.split(" ")[1]?.slice(0, 5) || fiveMinutesAgoIso().time,
  );
  const [toDate, setToDate] = useState(initialTo.split(" ")[0] || nowIso().date);
  const [toTime, setToTime] = useState(initialTo.split(" ")[1]?.slice(0, 5) || nowIso().time);
  const timezone = "Asia/Kolkata";

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const choosePreset = (preset: { label: string; since: string }) => {
    onChange({ kind: "relative", since: preset.since, label: preset.label });
    setShowCustom(false);
    setOpen(false);
  };

  const resetToNow = () => {
    const now = nowIso();
    const ago = fiveMinutesAgoIso();
    setFromDate(ago.date);
    setFromTime(ago.time);
    setToDate(now.date);
    setToTime(now.time);
  };

  const applyCustom = () => {
    const from = `${fromDate} ${fromTime}:00`;
    const to = `${toDate} ${toTime}:00`;
    if (new Date(from).getTime() >= new Date(to).getTime()) {
      alert("Start time must be earlier than end time.");
      return;
    }
    onChange({
      kind: "custom",
      from,
      to,
      timezone,
      label: `${fromDate} ${fromTime} → ${toDate} ${toTime} (${timezone})`,
    });
    setOpen(false);
  };

  return (
    <div className="trp-wrapper" ref={wrapperRef}>
      <button
        type="button"
        className="trp-trigger"
        title="Select time range"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="trp-icon">📅</span>
        <span>{value.label}</span>
        <span className="trp-chevron">▾</span>
      </button>

      {open && (
        <div className={`trp-popover${showCustom ? " trp-popover--wide" : ""}`}>
          <div className="trp-rail">
            <div className="trp-rail-heading">Default</div>
            <ul>
              {PRESETS.map((p) => {
                const active =
                  value.kind === "relative" && value.since === p.since && !showCustom;
                return (
                  <li
                    key={p.since}
                    className={`trp-rail-item${active ? " active" : ""}`}
                    onClick={() => choosePreset(p)}
                  >
                    {p.label}
                  </li>
                );
              })}
            </ul>
            <div
              className={`trp-rail-item trp-set-custom${showCustom ? " active" : ""}`}
              onClick={() => setShowCustom(true)}
            >
              Set custom <span className="trp-chevron-right">▸</span>
            </div>
          </div>

          {showCustom && (
            <div className="trp-panel">
              <div className="trp-panel-header">
                <span className="trp-panel-title">CUSTOM</span>
                <button
                  type="button"
                  className="trp-link"
                  onClick={resetToNow}
                >
                  Reset to now
                </button>
              </div>

              <div className="trp-row">
                <input
                  type="date"
                  className="trp-input"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
                <input
                  type="time"
                  className="trp-input"
                  value={fromTime}
                  onChange={(e) => setFromTime(e.target.value)}
                />
                <input
                  type="date"
                  className="trp-input"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
                <input
                  type="time"
                  className="trp-input"
                  value={toTime}
                  onChange={(e) => setToTime(e.target.value)}
                />
              </div>

              <div className="trp-actions-row">
                <button
                  type="button"
                  className="trp-btn trp-btn-ghost"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="trp-btn trp-btn-primary"
                  onClick={applyCustom}
                >
                  Apply
                </button>
              </div>

              <div className="trp-recent">
                <div className="trp-recent-heading">Recent</div>
                <div className="trp-recent-empty">
                  You don't have any history yet :-)
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
