# Frontend Improvement Plan

## Step 1 — Code Quality & Refactoring

- Split `CWVDashBoard.tsx` (496 lines) into smaller components:
  - `SummaryCards.tsx` — the 4 stat cards at the top
  - `MetricsTable.tsx` — the main data table
  - `PageSpeedPanel.tsx` — the expandable PageSpeed section
  - `CommentPreview.tsx` — the comment preview row
- Move all API calls from inline component code into `lib/api.ts`

---

## ~~Step 2 — Table Filters & Search~~

- ~~Add a search bar to filter rows by ticket ID or URL~~
- ~~Add status filter buttons: All / Green / Amber / Red~~
- ~~Add metric filter dropdown: All / LCP / CLS / INP~~
- ~~Persist filter state across page navigations~~

---

## ~~Step 3 — Bulk Actions~~

- ~~Add a "Select All" checkbox column to the table~~
- ~~Add a "Bulk Comment" button that comments on all selected Green tickets at once~~
- ~~Show a progress indicator while bulk commenting~~

---

## Step 4 — Export

- Add an "Export CSV" button to the dashboard toolbar
- Export should include all visible columns: ticket ID, URL, metric, Azure value, New Relic value, status

---

## ~~Step 5 — History Page~~

- ~~Build out the disabled "History" sidebar item~~
- ~~Read from `server/CWVs Report - YYYY-MM-DD/metrics_report.json` files~~
- ~~Show a list of past analysis runs with date, ticket count, and status breakdown~~
- ~~Allow clicking a past run to view its full results~~

---

## Step 6 — Settings Page

- Build out the disabled "Settings" sidebar item
- Fields: Azure DevOps PAT, New Relic API key, default time range
- Save settings to localStorage or a backend config endpoint

---

## ~~Step 7 — UI Polish~~

- ~~Make the layout responsive for smaller screens~~
- ~~Remove or replace the disabled sidebar items with a "Coming Soon" tooltip until built~~
- ~~Add empty state illustrations when the dashboard has no data~~
- ~~Make summary cards show percentage change vs. previous run (trend arrows)~~

---

## ~~Step 8 — Performance & DX~~

- ~~Add loading skeletons instead of spinners for the table~~
- ~~Add error boundaries so one failing row doesn't crash the whole dashboard~~
- ~~Add toast notifications for success/failure on comment and bulk actions~~
