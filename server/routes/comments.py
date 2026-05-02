from datetime import datetime
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from azure_client import process_work_items, DRY_RUN
from utils import format_window_label

router = APIRouter()


class TicketIdRequest(BaseModel):
    ticket_id: str
    metric: str | None = None
    newrelic_value: float | None = None
    newrelic_status: str | None = None
    since: str | None = None
    from_time: str | None = None
    to_time: str | None = None
    timezone: str | None = None


@router.post("/comment-assign")
def comment_and_assign(payload: TicketIdRequest):
    if not payload.ticket_id:
        return JSONResponse(
            {"success": False, "message": "No ticket_id provided."},
            status_code=400,
        )

    if payload.newrelic_status != "Green":
        return JSONResponse(
            {"success": False, "message": f"Ticket {payload.ticket_id} is not green."},
            status_code=400,
        )

    try:
        print(
            f"Commenting on {payload.ticket_id} | "
            f"value={payload.newrelic_value}, status={payload.newrelic_status}"
        )
        process_work_items(
            [payload.ticket_id],
            since=payload.since,
            from_time=payload.from_time,
            to_time=payload.to_time,
            timezone=payload.timezone,
        )

        today = datetime.now().strftime("%Y-%m-%d")
        window_label = format_window_label(payload.since, payload.from_time, payload.to_time, payload.timezone)

        metric_label = payload.metric or "Metric"
        value_str = f"{payload.newrelic_value:.3f}" if payload.newrelic_value is not None else "—"
        comment_preview = (
            f"{metric_label} is within threshold ({value_str}) as of {today}. "
            f"Observed over: {window_label}."
        )
        if DRY_RUN:
            comment_preview += " (DRY RUN enabled — this is a preview only; no comment was posted to Azure DevOps.)"

        return JSONResponse(
            {
                "success": True,
                "message": f"✅ Comment added & reassigned for {payload.ticket_id}",
                "comment_preview": comment_preview,
            }
        )
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)
