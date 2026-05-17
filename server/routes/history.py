import os
import json
import re
from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()

_REPORT_DIR_RE = re.compile(r"^CWVs Report - (\d{4}-\d{2}-\d{2})$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _report_dirs():
    """Return (date_str, report_json_path) pairs, newest first."""
    base = os.getcwd()
    result = []
    try:
        for name in os.listdir(base):
            m = _REPORT_DIR_RE.match(name)
            if m and os.path.isdir(os.path.join(base, name)):
                result.append((m.group(1), os.path.join(base, name, "metrics_report.json")))
    except OSError:
        pass
    return sorted(result, key=lambda x: x[0], reverse=True)


@router.get("/history")
async def list_history():
    runs = []
    for date_str, report_path in _report_dirs():
        if not os.path.exists(report_path):
            continue
        try:
            with open(report_path, "r", encoding="utf-8") as f:
                entries = json.load(f)
        except Exception:
            continue
        statuses = [e.get("status", "") for e in entries]
        runs.append({
            "date": date_str,
            "ticket_count": len(entries),
            "green": statuses.count("Green"),
            "amber": statuses.count("Amber"),
            "red": statuses.count("Red"),
        })
    return JSONResponse(content=runs)


@router.get("/history/{date}")
async def get_history_detail(date: str):
    if not _DATE_RE.match(date):
        return JSONResponse(status_code=400, content={"detail": "Invalid date format"})
    report_path = os.path.join(
        os.getcwd(), f"CWVs Report - {date}", "metrics_report.json"
    )
    if not os.path.exists(report_path):
        return JSONResponse(status_code=404, content={"detail": "No report found for this date"})
    try:
        with open(report_path, "r", encoding="utf-8") as f:
            entries = json.load(f)
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": f"Could not read report: {e}"})
    return JSONResponse(content=entries)
