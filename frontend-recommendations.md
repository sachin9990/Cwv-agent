# Frontend Code Recommendations

---

## Section 1 — Recommendations

### 1. Extract the hardcoded API base URL
`http://127.0.0.1:8000` appears five times across `AnalyzeTickets.tsx` and `CWVDashBoard.tsx`. One environment variable (`VITE_API_URL`) would make it trivial to point at staging or production without touching component code.

### 2. Create a shared types file
`WorkItem` (in `AnalyzeTickets.tsx`) and `Row` (in `CWVDashBoard.tsx`) describe the same shape. They are defined twice and will silently drift apart. Moving both into a single `src/types.ts` and re-exporting them fixes this.

### 3. Remove `any` types in `App.tsx`
`dashboardData` and `handleResult` are typed as `any[]`. Once the shared type exists this is a one-line fix, and TypeScript will catch mismatches end-to-end.

### 4. Replace `alert()` calls with inline UI feedback
`AnalyzeTickets.tsx` and `CWVDashBoard.tsx` call `alert()` on errors. Native browser alerts block the tab, look inconsistent, and cannot be styled. Inline error banners inside the card are better UX.

### 5. Fix dropzone accessibility
The drag-and-drop `<div>` in `AnalyzeTickets.tsx` is a keyboard dead-end. It needs `role="button"`, `tabIndex={0}`, and an `onKeyDown` handler so keyboard-only users can activate it. Disabled sidebar items should carry `aria-disabled="true"` instead of relying only on a CSS class.

### 6. Add pagination truncation
The pagination renders one button per page via `Array.from({ length: totalPages })`. With 100 rows at page-size 5 that produces 20 buttons. A truncated version (first · … · prev · current · next · … · last) is standard and scales to any dataset size.

### 7. Auto-detect timezone instead of hardcoding
`"Asia/Kolkata"` is hardcoded in `TimeRangePicker.tsx`. Users outside that zone will get silently wrong results. `Intl.DateTimeFormat().resolvedOptions().timeZone` returns the browser's local timezone at zero cost.

### 8. Wire up or remove the "Recent" section in TimeRangePicker
The Recent panel always renders `"You don't have any history yet :-)"` and is never populated. It should either be backed by `localStorage` (save the last 5 custom ranges) or removed entirely to avoid dead UI.

### ~~9. Remove the unused `prevValue` field on `Row`~~
~~`CWVDashBoard.tsx` declares `prevValue?: number | null` in the `Row` type but never reads it. Dead fields in shared types mislead readers into thinking there is comparison logic somewhere.~~

### ~~10. Remove the redundant `if (onResult)` guard~~
~~`AnalyzeTickets.tsx` line 74 checks `if (onResult) onResult(data)`. `onResult` is a required prop — it can never be falsy here. The guard adds noise without safety.~~

### ~~11. Avoid mounting both pages simultaneously~~
~~`App.tsx` renders both `<AnalyzeTickets>` and `<CWVDashboard>` at all times, toggling them with `display: none`. `CWVDashboard` mounts and runs its `useEffect` even before any data exists. Conditional rendering (`{page === "analyze" && <AnalyzeTickets />}`) is simpler and avoids unnecessary work.~~

### ~~12. Show a table-level loading indicator while fetching New Relic data~~
~~While `loading` is `true` the "Get Data from New Relic" button reads "Fetching…", but the table gives no visual feedback. A subtle loading overlay or row skeleton on the table body makes the wait state unambiguous.~~

---

## Section 2 — Code Changes

### Change 1 — `src/lib/api.ts` (new file)

```ts
// src/lib/api.ts
export const API_BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";
```

Add to `/client/.env.development` (create if absent):
```
VITE_API_URL=http://127.0.0.1:8000
```

---

### Change 2 — `src/types.ts` (new file)

```ts
// src/types.ts
export type WorkItem = {
  ticket_id: string;
  url: string | null;
  metric: string | null;
  value: number | null;
  status: string | null;
  newRelicValue?: number | null;
  newRelicStatus?: string | null;
};
```

---

### Change 3 — `App.tsx`

Replace the `any` types and use conditional rendering:

```tsx
// Before
import { useEffect, useState } from "react";
import AnalyzeTickets from "./components/AnalyzeTickets";
import CWVDashboard from "./components/CWVDashBoard";
import Sidebar from "./components/Sidebar";
import "./App.css";

export type Page = "analyze" | "dashboard";

function App() {
  const [page, setPage] = useState<Page>("analyze");
  const [dashboardData, setDashboardData] = useState<any[]>([]);
  // ...

  const handleResult = (data: any[]) => {
    setDashboardData(data);
    setPage("dashboard");
  };

  return (
    <div className="app-root">
      <Sidebar ... />
      <main className="main-content">
        <div style={{ display: page === "analyze" ? "contents" : "none" }}>
          <AnalyzeTickets onResult={handleResult} />
        </div>
        <div style={{ display: page === "dashboard" ? "contents" : "none" }}>
          <CWVDashboard data={dashboardData} />
        </div>
      </main>
    </div>
  );
}
```

```tsx
// After
import { useEffect, useState } from "react";
import AnalyzeTickets from "./components/AnalyzeTickets";
import CWVDashboard from "./components/CWVDashBoard";
import Sidebar from "./components/Sidebar";
import type { WorkItem } from "./types";
import "./App.css";

export type Page = "analyze" | "dashboard";

function App() {
  const [page, setPage] = useState<Page>("analyze");
  const [dashboardData, setDashboardData] = useState<WorkItem[]>([]);
  // ...

  const handleResult = (data: WorkItem[]) => {
    setDashboardData(data);
    setPage("dashboard");
  };

  return (
    <div className="app-root">
      <Sidebar ... />
      <main className="main-content">
        {page === "analyze" && <AnalyzeTickets onResult={handleResult} />}
        {page === "dashboard" && <CWVDashboard data={dashboardData} />}
      </main>
    </div>
  );
}
```

---

### Change 4 — `AnalyzeTickets.tsx`

**4a. Use shared type, API constant, inline error, remove redundant guard, fix dropzone accessibility:**

```tsx
// Before (top of file + handleSubmit + dropzone)
import { useRef, useState } from "react";
import "./AnalyzeTickets.css";

type WorkItem = {
  ticket_id: string;
  url: string | null;
  metric: string | null;
  value: number | null;
  status: string | null;
};

// ...inside handleSubmit:
    const response = await fetch("http://127.0.0.1:8000/run-script", { ... });
    if (onResult) onResult(data);
  } catch (err) {
    alert("Failed to analyze tickets. Is the backend running on port 8000?");
  }

// ...dropzone:
<div
  className="dropzone"
  onClick={() => fileInputRef.current?.click()}
  onDragOver={handleDragOver}
  onDrop={handleDrop}
>
```

```tsx
// After
import { useRef, useState } from "react";
import type { WorkItem } from "../types";
import { API_BASE } from "../lib/api";
import "./AnalyzeTickets.css";

// WorkItem type removed — imported from shared types

// ...inside handleSubmit:
    const response = await fetch(`${API_BASE}/run-script`, { ... });
    onResult(data);                          // guard removed, prop is required
  } catch (err) {
    setError("Failed to analyze tickets. Is the backend running?");
  }

// Add error state near other useState declarations:
const [error, setError] = useState<string | null>(null);

// Clear error on new submission:
const handleSubmit = async () => {
  if (!ticketInput.trim() && !fileInputRef.current?.files?.[0]) return;
  setError(null);
  setSubmitting(true);
  // ...
};

// Render error inline (add below the analyze-footer div):
{error && <p className="analyze-error">{error}</p>}

// ...dropzone with accessibility:
<div
  className="dropzone"
  role="button"
  tabIndex={0}
  onClick={() => fileInputRef.current?.click()}
  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
  onDragOver={handleDragOver}
  onDrop={handleDrop}
>
```

Add to `AnalyzeTickets.css`:
```css
.analyze-error {
  color: var(--red, #f87171);
  font-size: 0.85rem;
  margin-top: 0.5rem;
  text-align: center;
}
```

---

### Change 5 — `CWVDashBoard.tsx`

**5a. Use shared type, API constant, inline error on comment failure, remove unused `prevValue`:**

```tsx
// Before
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
  prevValue?: number | null;   // ← unused, remove
};

// fetch calls:
const resp = await fetch(buildMetricUrl(row));
const resp = await fetch("http://127.0.0.1:8000/comment-assign", { ... });
const resp = await fetch(`http://127.0.0.1:8000/get-pagespeed?${params}`);

// alert on comment failure:
  alert(result.message ?? "Failed to add comment");
} catch (err) {
  alert(`Error: ${err}`);
}
```

```tsx
// After
import React, { useEffect, useMemo, useState } from "react";
import TimeRangePicker, { type TimeRange } from "./TimeRangePicker";
import type { WorkItem } from "../types";
import { API_BASE } from "../lib/api";
import "./CWVDashboard.css";

// Row extends the shared type (no separate re-declaration needed):
type Row = WorkItem;   // newRelicValue / newRelicStatus already on WorkItem

// fetch calls:
const resp = await fetch(buildMetricUrl(row));                          // unchanged, uses helper
const resp = await fetch(`${API_BASE}/comment-assign`, { ... });
const resp = await fetch(`${API_BASE}/get-pagespeed?${params}`);

// buildMetricUrl updated:
return `${API_BASE}/get-metric?${params.toString()}`;

// Replace alert() on comment failure with inline error state:
const [commentError, setCommentError] = useState<string | null>(null);

// In handleComment:
    if (!result.success) {
      setCommentError(result.message ?? "Failed to add comment");
    }
  } catch (err) {
    setCommentError(`Error: ${err}`);
  }

// Render below the toolbar:
{commentError && (
  <div className="dashboard-error">{commentError}</div>
)}
```

Add to `CWVDashBoard.css`:
```css
.dashboard-error {
  background: rgba(248, 113, 113, 0.12);
  border: 1px solid #f87171;
  border-radius: 6px;
  color: #f87171;
  font-size: 0.85rem;
  padding: 0.5rem 1rem;
  margin-bottom: 0.75rem;
}
```

**5b. Table loading overlay while fetching New Relic data:**

```tsx
// Wrap <table> in a relative container and add overlay:
<div className="table-wrapper">
  {loading && <div className="table-loading-overlay"><span className="psi-spinner" /></div>}
  <table className="bugs-table">
    {/* unchanged */}
  </table>
</div>
```

Add to `CWVDashBoard.css`:
```css
.table-wrapper {
  position: relative;
}
.table-loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  z-index: 2;
}
```

**5c. Paginated page buttons with truncation:**

```tsx
// Before
{Array.from({ length: totalPages }).map((_, i) => (
  <button
    key={i}
    className={`page-btn${page === i + 1 ? " active" : ""}`}
    onClick={() => setPage(i + 1)}
  >
    {i + 1}
  </button>
))}
```

```tsx
// After — helper function (add above the return statement)
function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i);
  }
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}

// In JSX:
{getPageNumbers(page, totalPages).map((p, i) =>
  p === "..." ? (
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
)}
```

Add to `CWVDashBoard.css`:
```css
.page-ellipsis {
  padding: 0 4px;
  color: var(--text-secondary, #888);
  user-select: none;
}
```

---

### Change 6 — `TimeRangePicker.tsx`

**Auto-detect timezone, wire Recent to localStorage:**

```tsx
// Before
const timezone = "Asia/Kolkata";
```

```tsx
// After
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
```

**Recent history backed by localStorage:**

```tsx
// Add near other state declarations:
const RECENT_KEY = "cwv-trp-recent";
const MAX_RECENT = 5;

function loadRecent(): TimeRange[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveRecent(range: TimeRange) {
  const prev = loadRecent().filter((r) => r.label !== range.label);
  localStorage.setItem(RECENT_KEY, JSON.stringify([range, ...prev].slice(0, MAX_RECENT)));
}

const [recentRanges, setRecentRanges] = useState<TimeRange[]>(loadRecent);

// Call saveRecent + refresh list whenever a range is applied:
const choosePreset = (preset: { label: string; since: string }) => {
  const range: TimeRange = { kind: "relative", since: preset.since, label: preset.label };
  saveRecent(range);
  setRecentRanges(loadRecent());
  onChange(range);
  setShowCustom(false);
  setOpen(false);
};

const applyCustom = () => {
  // ...existing validation...
  const range: TimeRange = { kind: "custom", from, to, timezone, label: `...` };
  saveRecent(range);
  setRecentRanges(loadRecent());
  onChange(range);
  setOpen(false);
};

// Replace the static Recent section:
<div className="trp-recent">
  <div className="trp-recent-heading">Recent</div>
  {recentRanges.length === 0 ? (
    <div className="trp-recent-empty">You don't have any history yet :-)</div>
  ) : (
    <ul>
      {recentRanges.map((r) => (
        <li
          key={r.label}
          className="trp-rail-item"
          onClick={() => { onChange(r); setOpen(false); }}
        >
          {r.label}
        </li>
      ))}
    </ul>
  )}
</div>
```

---

### Change 7 — `Sidebar.tsx`

Add `aria-disabled` to disabled items:

```tsx
// Before
<li
  key={item.text}
  className={`menu-item${item.page === activePage ? " active" : ""}${!item.page ? " disabled" : ""}`}
  onClick={() => handleClick(item)}
>
```

```tsx
// After
<li
  key={item.text}
  className={`menu-item${item.page === activePage ? " active" : ""}${!item.page ? " disabled" : ""}`}
  aria-disabled={!item.page ? true : undefined}
  aria-current={item.page === activePage ? "page" : undefined}
  onClick={() => handleClick(item)}
>
```
