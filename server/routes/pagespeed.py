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
    return JSONResponse({
        "recommendations": failed[:5],
        "thirdParties": _extract_third_parties(audits.get("third-party-summary")),
    })


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


_MAX_THIRD_PARTY_ENTITIES = 15
_MAX_SCRIPTS_PER_ENTITY = 5


def _entity_name(entity) -> str | None:
    if isinstance(entity, str):
        return entity
    if isinstance(entity, dict):
        return entity.get("text") or entity.get("url")
    return None


def _extract_third_parties(audit: dict | None) -> dict | None:
    if not isinstance(audit, dict):
        return None
    details = audit.get("details")
    if not isinstance(details, dict):
        return None
    items = details.get("items")
    if not isinstance(items, list) or not items:
        return None

    entities = []
    total_blocking = 0.0
    total_main_thread = 0.0
    total_transfer = 0
    for item in items:
        if not isinstance(item, dict):
            continue
        name = _entity_name(item.get("entity"))
        if not name:
            continue
        blocking = item.get("blockingTime") or 0
        main_thread = item.get("mainThreadTime") or 0
        transfer = item.get("transferSize") or 0
        total_blocking += blocking
        total_main_thread += main_thread
        total_transfer += transfer

        scripts: list[dict] = []
        sub = item.get("subItems")
        if isinstance(sub, dict):
            for s in (sub.get("items") or [])[:_MAX_SCRIPTS_PER_ENTITY]:
                if not isinstance(s, dict) or not s.get("url"):
                    continue
                scripts.append({
                    "url": s["url"],
                    "blockingTime": s.get("blockingTime") or 0,
                    "mainThreadTime": s.get("mainThreadTime") or 0,
                    "transferSize": s.get("transferSize") or 0,
                })

        entities.append({
            "entity": name,
            "blockingTime": blocking,
            "mainThreadTime": main_thread,
            "transferSize": transfer,
            "scripts": scripts,
        })

    entities.sort(key=lambda e: e["blockingTime"], reverse=True)
    return {
        "title": audit.get("title", ""),
        "displayValue": audit.get("displayValue", ""),
        "totalBlockingTime": total_blocking,
        "totalMainThreadTime": total_main_thread,
        "totalTransferSize": total_transfer,
        "entityCount": len(entities),
        "entities": entities[:_MAX_THIRD_PARTY_ENTITIES],
    }
