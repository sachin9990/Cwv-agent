# -----------------------------
# Standard library
# -----------------------------
import io
import os
import requests

# -----------------------------
# Third-party libraries
# -----------------------------
import pandas as pd
from fastapi import (
    FastAPI,
    Query,
    Request,
    UploadFile,
    File,
    HTTPException,
    Form,
)
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# -----------------------------
# Local modules
# -----------------------------
from routes import hello_routes
from azureComment import (
    process_work_items,
    get_work_item_url,
    get_metric_value,
    get_status,
)

PAGE_SPEED_KEY = os.getenv("PAGE_SPEED_INSIGHTS")

# -----------------------------
# App setup
# -----------------------------
app = FastAPI()
templates = Jinja2Templates(directory="templates")

# -----------------------------
# Middleware
# -----------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ⚠️ Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# Routers
# -----------------------------
app.include_router(hello_routes.router)



# -----------------------------
# Routes
# -----------------------------

@app.post("/run-script")
async def run_script(
    file: UploadFile = File(None),
    ticket_numbers: str = Form(""),
):
    print("➡️ Received request with ticket_numbers:", ticket_numbers)

    work_item_ids = []

    # -----------------------------
    # Case 1: Manual input
    # -----------------------------
    if ticket_numbers.strip():
        work_item_ids = [
            x.strip()
            for x in ticket_numbers.split(",")
            if x.strip()
        ]

    # -----------------------------
    # Case 2: File upload
    # -----------------------------
    elif file is not None:
        contents = await file.read()
        filename = file.filename.lower()

        try:
            if filename.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(contents))
            elif filename.endswith((".xlsx", ".xls")):
                df = pd.read_excel(io.BytesIO(contents))
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Only CSV and Excel files are supported.",
                )
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Could not read file: {str(e)}",
            )

        # Normalize columns
        df.columns = df.columns.str.strip().str.lower()

        TICKET_COLUMN_VARIANTS = ["ticket_id", "ticketid"]

        matched_column = next(
            (col for col in TICKET_COLUMN_VARIANTS if col in df.columns),
            None,
        )

        if matched_column:
            work_item_ids = df[matched_column].dropna().tolist()

        # Normalize IDs
        work_item_ids = [
            str(x).strip()
            for x in work_item_ids
            if str(x).strip()
        ]

    print("DEBUG work_item_ids:", work_item_ids)

    # -----------------------------
    # Build response
    # -----------------------------
    work_items = []

    for wid in work_item_ids:
        parsed = get_work_item_url(wid)

        status = None
        if parsed and parsed["metric"] and parsed["value"] is not None:
            status = get_status(parsed["metric"], parsed["value"])

        work_items.append(
            {
                "response_from": "Azure DevOps",
                "ticket_id": wid,
                "url": parsed["URL"] if parsed else None,
                "metric": parsed["metric"] if parsed else None,
                "value": parsed["value"] if parsed else None,
                "status": status,
            }
        )

    return JSONResponse(content=work_items)


# -----------------------------
# Analyze endpoint
# -----------------------------
@app.post("/analyze")
async def analyze(request: Request, ticket_ids: str = Form(...)):
    ids = [x.strip() for x in ticket_ids.split(",") if x.strip()]

    process_work_items(ids)

    script_result = f"Processed {len(ids)} ticket(s)."

    return templates.TemplateResponse(
        request=request,
        name="result.html",
        context={
            "work_item_ids": ids,
            "script_result": script_result,
        },
    )


# -----------------------------
# Get metric endpoint
# -----------------------------
@app.get("/get-metric")
def get_metric(
    ticket_id: str,
    url: str,
    metric: str,
    since: str | None = Query(None, description="Relative window e.g. '7 days', '30 minutes'"),
    from_time: str | None = Query(None, description="Custom range start, 'YYYY-MM-DD HH:MM:SS'"),
    to_time: str | None = Query(None, description="Custom range end, 'YYYY-MM-DD HH:MM:SS'"),
    timezone: str | None = Query(None, description="IANA timezone, e.g. 'Asia/Kolkata'"),
):
    # Validate: if one of from/to is supplied, both must be
    if bool(from_time) ^ bool(to_time):
        raise HTTPException(
            status_code=400,
            detail="from_time and to_time must be supplied together.",
        )

    value = get_metric_value(
        url,
        metric,
        since=since,
        from_time=from_time,
        to_time=to_time,
        timezone=timezone,
    )

    status = None
    if metric and value is not None:
        status = get_status(metric, value)

    # Human-readable label of the window used
    if from_time and to_time:
        window = f"{from_time} → {to_time}" + (f" ({timezone})" if timezone else "")
    else:
        window = since or "7 days"

    return JSONResponse(
        {
            "response_from": "New Relic",
            "ticket_id": ticket_id,
            "value": value,
            "window": window,
            "status": status,
            "url": url,
        }
    )


# Audit IDs from the Lighthouse report that are directly relevant to each CWV metric
_METRIC_AUDIT_IDS: dict[str, set[str]] = {
    "LCP": {
        "largest-contentful-paint-element",
        "render-blocking-resources",
        "unused-css-rules",
        "unused-javascript",
        "uses-optimized-images",
        "uses-text-compression",
        "server-response-time",
        "redirects",
        "uses-responsive-images",
        "offscreen-images",
        "unminified-css",
        "unminified-javascript",
        "preload-lcp-image",
        "prioritize-lcp-image",
        "uses-long-cache-ttl",
        "total-byte-weight",
        "critical-request-chains",
        "efficient-animated-content",
        "dom-size",
    },
    "CLS": {
        "layout-shift-elements",
        "non-composited-animations",
        "unsized-images",
        "uses-responsive-images",
        "preload-fonts",
    },
    "INP": {
        "total-blocking-time",
        "long-tasks",
        "third-party-summary",
        "dom-size",
        "bootup-time",
        "mainthread-work-breakdown",
        "uses-passive-event-listeners",
        "no-document-write",
        "third-party-facades",
        "viewport",
    },
}

# -----------------------------
# PageSpeed Insights endpoint
# -----------------------------
@app.get("/get-pagespeed")
def get_pagespeed(
    url: str = Query(...),
    metric: str | None = Query(None, description="CWV metric: LCP, CLS, or INP"),
    strategy: str = Query("mobile"),
):
    if not PAGE_SPEED_KEY:
        raise HTTPException(status_code=500, detail="PAGE_SPEED_INSIGHTS API key not configured.")
    params = {
        "url": url,
        "key": PAGE_SPEED_KEY,
        "category": "performance",
        "strategy": strategy,
    }
    psi_endpoint = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
    resp = None
    for attempt in range(2):
        try:
            resp = requests.get(psi_endpoint, params=params, timeout=60)
            resp.raise_for_status()
            break
        except requests.exceptions.Timeout:
            if attempt == 1:
                raise HTTPException(status_code=504, detail="PageSpeed Insights request timed out after 2 attempts.")
        except requests.exceptions.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"PageSpeed Insights error: {exc.response.status_code}")
        except requests.exceptions.RequestException as exc:
            raise HTTPException(status_code=502, detail=f"PageSpeed Insights request failed: {str(exc)}")

    audits = resp.json().get("lighthouseResult", {}).get("audits", {})
    relevant_ids = _METRIC_AUDIT_IDS.get((metric or "").upper())

    failed = [
        {
            "id": v["id"],
            "title": v.get("title", ""),
            "description": v.get("description", ""),
            "score": v["score"],
            "displayValue": v.get("displayValue", ""),
        }
        for v in audits.values()
        if v.get("score") is not None
        and v["score"] < 1
        and (relevant_ids is None or v["id"] in relevant_ids)
    ]
    failed.sort(key=lambda a: a["score"])
    return JSONResponse({"recommendations": failed[:5]})


# -----------------------------
# Request model
# -----------------------------
class TicketIdRequest(BaseModel):
    ticket_id: str
    metric: str | None = None
    newrelic_value: float | None = None
    newrelic_status: str | None = None
    since: str | None = None
    from_time: str | None = None
    to_time: str | None = None
    timezone: str | None = None


# -----------------------------
# Comment + Assign endpoint
# -----------------------------
@app.post("/comment-assign")
def comment_and_assign(payload: TicketIdRequest):
    ticket_id = payload.ticket_id
    newrelic_value = payload.newrelic_value
    newrelic_status = payload.newrelic_status

    if not ticket_id:
        return JSONResponse(
            {"success": False, "message": "No ticket_id provided."},
            status_code=400,
        )

    if newrelic_status != "Green":
        return JSONResponse(
            {
                "success": False,
                "message": f"Ticket {ticket_id} is not green.",
            },
            status_code=400,
        )

    try:
        print(
            f"Commenting on {ticket_id} | "
            f"value={newrelic_value}, status={newrelic_status}"
        )

        process_work_items(
            [ticket_id],
            since=payload.since,
            from_time=payload.from_time,
            to_time=payload.to_time,
            timezone=payload.timezone,
        )

        from datetime import datetime as _dt
        today = _dt.now().strftime("%Y-%m-%d")
        if payload.from_time and payload.to_time:
            window_label = f"{payload.from_time} → {payload.to_time}"
            if payload.timezone:
                window_label += f" ({payload.timezone})"
        else:
            window_label = payload.since or "7 days"

        metric_label = payload.metric or "Metric"
        value_str = f"{newrelic_value:.3f}" if newrelic_value is not None else "—"
        comment_preview = (
            f"{metric_label} is within threshold ({value_str}) as of {today}. "
            f"Observed over: {window_label}."
        )

        return JSONResponse(
            {
                "success": True,
                "message": f"✅ Comment added & reassigned for {ticket_id}",
                "comment_preview": comment_preview,
            }
        )

    except Exception as e:
        return JSONResponse(
            {"success": False, "message": str(e)},
            status_code=500,
        )