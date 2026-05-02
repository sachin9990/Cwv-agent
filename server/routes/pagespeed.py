import os
import httpx
from typing import Literal
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import JSONResponse

router = APIRouter()

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


@router.get("/get-pagespeed")
async def get_pagespeed(
    url: str = Query(...),
    metric: Literal["LCP", "CLS", "INP"] | None = Query(None, description="CWV metric: LCP, CLS, or INP"),
    strategy: str = Query("mobile"),
):
    page_speed_key = os.getenv("PAGE_SPEED_INSIGHTS")
    if not page_speed_key:
        raise HTTPException(status_code=500, detail="PAGE_SPEED_INSIGHTS API key not configured.")

    params = {
        "url": url,
        "key": page_speed_key,
        "category": "performance",
        "strategy": strategy,
    }
    psi_endpoint = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"

    resp = None
    async with httpx.AsyncClient() as client:
        for attempt in range(2):
            try:
                resp = await client.get(psi_endpoint, params=params, timeout=60.0)
                resp.raise_for_status()
                break
            except httpx.TimeoutException:
                if attempt == 1:
                    raise HTTPException(
                        status_code=504,
                        detail="PageSpeed Insights request timed out after 2 attempts.",
                    )
            except httpx.HTTPStatusError as exc:
                raise HTTPException(
                    status_code=502,
                    detail=f"PageSpeed Insights error: {exc.response.status_code}",
                )
            except httpx.RequestError as exc:
                raise HTTPException(
                    status_code=502,
                    detail=f"PageSpeed Insights request failed: {str(exc)}",
                )

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
