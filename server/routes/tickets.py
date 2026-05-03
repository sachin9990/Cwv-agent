import io
import asyncio
import pandas as pd
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse

from azure_client import get_work_item_url
from utils import get_status

router = APIRouter()

TICKET_COLUMN_VARIANTS = ["ticket_id", "ticketid"]


async def _fetch_one(wid: str) -> dict:
    parsed = await get_work_item_url(wid)
    status = None
    if parsed and parsed["metric"] and parsed["value"] is not None:
        status = get_status(parsed["metric"], parsed["value"])
    return {
        "response_from": "Azure DevOps",
        "ticket_id": wid,
        "url": parsed["URL"] if parsed else None,
        "metric": parsed["metric"] if parsed else None,
        "value": parsed["value"] if parsed else None,
        "status": status,
    }


@router.post("/run-script")
async def run_script(
    file: UploadFile = File(None),
    ticket_numbers: str = Form(""),
):
    print("➡️ Received request with ticket_numbers:", ticket_numbers)

    work_item_ids: list[str] = []

    if ticket_numbers.strip():
        raw_ids = [x.strip() for x in ticket_numbers.split(",") if x.strip()]
        invalid = [x for x in raw_ids if not x.isdigit()]
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid ticket ID(s): {', '.join(invalid)}. Only numeric IDs are accepted.",
            )
        work_item_ids = raw_ids
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
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not read file: {str(e)}")

        df.columns = df.columns.str.strip().str.lower()
        matched_column = next(
            (col for col in TICKET_COLUMN_VARIANTS if col in df.columns), None
        )
        if matched_column:
            work_item_ids = [
                str(x).strip() for x in df[matched_column].dropna().tolist() if str(x).strip()
            ]

    print("DEBUG work_item_ids:", work_item_ids)

    work_items = list(await asyncio.gather(*[_fetch_one(wid) for wid in work_item_ids]))

    return JSONResponse(content=work_items)
