# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CWV Agent is a full-stack tool that analyzes Core Web Vitals (CWV) tickets from Azure DevOps and cross-references them with New Relic performance metrics. It auto-comments and reassigns tickets in Azure DevOps when metrics meet thresholds.

## Commands

### Frontend (`/client`)
```bash
npm install        # Install dependencies
npm run dev        # Start Vite dev server
npm run build      # TypeScript check + production bundle
npm run lint       # ESLint
npm run preview    # Preview production build
```

### Backend (`/server`)
```bash
# First time setup (Windows)
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Run dev server
uvicorn main:app --reload
```

Backend runs on `http://127.0.0.1:8000`; frontend hardcodes this URL.

## Architecture

**Frontend** — React 19 + TypeScript + Vite (`/client/src/`)  
**Backend** — FastAPI + Uvicorn (`/server/`)

### Key API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/run-script` | Fetch CWV metrics from Azure DevOps (ticket IDs or file upload) |
| GET | `/get-metric` | Fetch per-ticket metrics from New Relic |
| POST | `/comment-assign` | Add comment and reassign ticket in Azure DevOps |

### Frontend Data Flow
1. User submits ticket IDs or CSV/Excel → `POST /run-script` → dashboard renders Azure data
2. User clicks "Get Data from New Relic" → `GET /get-metric` per ticket
3. When status is Green, "Comment" button appears → `POST /comment-assign` triggers Azure update

### CWV Thresholds
- **LCP**: Green < 2.5s, Amber 2.5–4.0s, Red ≥ 4.0s
- **CLS**: Green < 0.1, Amber 0.1–0.25, Red ≥ 0.25
- **INP**: Green < 200ms, Amber 200–500ms, Red ≥ 500ms

## Environment Variables

Create `/server/.env`:
```
AZDO_ORG=BFLDevOpsOrg
AZDO_PROJECT=3in1 Agile Board_MarTech
AZDO_PAT=<personal-access-token>
NEWRELIC_ACCOUNT_ID=2364187
NEWRELIC_API_KEY=<api-key>
PAGE_SPEED_INSIGHTS=<google-api-key>
```

## Key Implementation Details

- **`DRY_RUN` flag** in `server/azureComment.py` — set to `False` to enable actual Azure DevOps writes (defaults to `True`)
- **File upload** accepts `.csv` and `.xlsx`/`.xls`; expects a `ticket_id` or `ticketid` column
- **Report logging** writes to `server/CWVs Report - YYYY-MM-DD/metrics_report.json`
- **CORS** is unrestricted (`allow_origins=["*"]`) — restrict before deploying to production
- **React Compiler** is enabled in `vite.config.ts`
