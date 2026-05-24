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
        _format_audit(v)
        for v in audits.values()
        if v.get("score") is not None
        and v["score"] < 1
        and (relevant_ids is None or v["id"] in relevant_ids)
    ]
    failed.sort(key=lambda a: a["score"])
    return JSONResponse({"recommendations": failed[:5]})


_MAX_ITEMS_PER_AUDIT = 5
_ITEM_FIELDS = (
    "url", "totalBytes", "wastedBytes", "wastedMs", "score",
    "label", "groupLabel", "duration", "transferSize",
)


def _extract_node(node: dict) -> dict:
    return {
        "selector": node.get("selector"),
        "snippet": node.get("snippet"),
        "nodeLabel": node.get("nodeLabel"),
    }


def _extract_item(item: dict) -> dict:
    cleaned = {k: item[k] for k in _ITEM_FIELDS if k in item}
    node = item.get("node")
    if isinstance(node, dict):
        cleaned["node"] = _extract_node(node)
    return cleaned


def _extract_details(details: dict | None) -> dict | None:
    if not isinstance(details, dict):
        return None
    items = details.get("items")
    if not isinstance(items, list) or not items:
        return None
    cleaned_items = [_extract_item(i) for i in items[:_MAX_ITEMS_PER_AUDIT] if isinstance(i, dict)]
    if not cleaned_items:
        return None
    return {
        "type": details.get("type"),
        "items": cleaned_items,
        "totalItems": len(items),
        "overallSavingsMs": details.get("overallSavingsMs"),
        "overallSavingsBytes": details.get("overallSavingsBytes"),
    }


def _format_audit(audit: dict) -> dict:
    return {
        "id": audit["id"],
        "title": audit.get("title", ""),
        "description": audit.get("description", ""),
        "score": audit["score"],
        "displayValue": audit.get("displayValue", ""),
        "details": _extract_details(audit.get("details")),
    }
