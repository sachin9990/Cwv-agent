# -----------------------------
# Standard library
# -----------------------------
import io

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


# -----------------------------
# Request model
# -----------------------------
class TicketIdRequest(BaseModel):
    ticket_id: str
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

        return JSONResponse(
            {
                "success": True,
                "message": f"✅ Comment added & reassigned for {ticket_id}",
            }
        )

    except Exception as e:
        return JSONResponse(
            {"success": False, "message": str(e)},
            status_code=500,
        )