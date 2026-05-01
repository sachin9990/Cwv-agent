# -----------------------------
# Standard library
# -----------------------------
import io
import re
from datetime import datetime

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
    Body,
)
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse
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
# Status Logic (Duplicate - consider DRY)
# -----------------------------
def get_status(metric, value):
    if metric == "CLS":
        if value < 0.1:
            return "Green"
        elif value < 0.25:
            return "Amber"
        else:
            return "Red"

    elif metric == "INP":
        if value < 0.2:
            return "Green"
        elif value < 0.5:
            return "Amber"
        else:
            return "Red"

    elif metric == "LCP":
        if value < 2.5:
            return "Green"
        elif value < 4.0:
            return "Amber"
        else:
            return "Red"

    return "Unknown"


# -----------------------------
# Routes
# -----------------------------
# @app.get("/", response_class=HTMLResponse)
# async def hello(request: Request):
#     return templates.TemplateResponse(
#         request=request,
#         # name="upload.html",
#     )


@app.post("/run-script", response_class=HTMLResponse)
async def run_script(
    request: Request,
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
@app.post("/analyze", response_class=HTMLResponse)
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
def get_metric(ticket_id: str, url: str, metric: str, days: int = Query(...)):
    value = get_metric_value(url, metric, days_back=days)

    status = None
    if metric and value is not None:
        status = get_status(metric, value)

    return JSONResponse(
        {
            "response_from": "New Relic",
            "ticket_id": ticket_id,
            "value": value,
            "days": days,
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

        process_work_items([ticket_id], days_back=7)

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