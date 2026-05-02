from typing import Literal
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import JSONResponse

from azure_client import get_metric_value
from utils import get_status, format_window_label

router = APIRouter()


@router.get("/get-metric")
async def get_metric(
    ticket_id: str,
    url: str,
    metric: Literal["LCP", "CLS", "INP"],
    since: str | None = Query(None, description="Relative window e.g. '7 days', '30 minutes'"),
    from_time: str | None = Query(None, description="Custom range start, 'YYYY-MM-DD HH:MM:SS'"),
    to_time: str | None = Query(None, description="Custom range end, 'YYYY-MM-DD HH:MM:SS'"),
    timezone: str | None = Query(None, description="IANA timezone, e.g. 'Asia/Kolkata'"),
):
    if bool(from_time) ^ bool(to_time):
        raise HTTPException(
            status_code=400,
            detail="from_time and to_time must be supplied together.",
        )

    value = await get_metric_value(
        url, metric,
        since=since, from_time=from_time, to_time=to_time, timezone=timezone,
    )
    status = get_status(metric, value) if metric and value is not None else None

    window = format_window_label(since, from_time, to_time, timezone)

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
