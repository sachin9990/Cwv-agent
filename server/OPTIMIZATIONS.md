# Server Optimizations

---

## Section 1 — Recommendations

- [ ] 1. **Parallelize `/run-script` ticket fetching** *(Performance)*
   `routes/tickets.py` calls `get_work_item_url` in a `for` loop. Each iteration makes a synchronous HTTP request to Azure DevOps. With many tickets, this is fully sequential. Use `asyncio.gather` to run all requests concurrently.

- [ ] 2. **Replace `requests` with `httpx`** *(Performance)*
   The entire backend uses the synchronous `requests` library inside `async def` route handlers, blocking the event loop on every outbound HTTP call. Switching to `httpx` with `AsyncClient` would make Azure, New Relic, and PageSpeed calls non-blocking.

- [ ] 3. **`/get-metric` is a synchronous route handler** *(Performance)*
   It is defined as `def get_metric(...)`, not `async def`. FastAPI runs sync handlers in a thread pool, which is fine, but it is inconsistent and will not benefit from the async improvements above until changed.

- [x] ~~4. **`PAGE_SPEED_KEY` is evaluated at import time** *(Correctness)*
   `PAGE_SPEED_KEY = os.getenv("PAGE_SPEED_INSIGHTS")` in `pagespeed.py` runs when the module is first imported. `load_dotenv()` is only called inside `azure_client.py` — if `pagespeed.py` is imported first the key will be `None` even if `.env` has the value. `load_dotenv()` should be called once at the top of `main.py`, before all route imports.~~

- [x] ~~5. **No validation of the `metric` query parameter** *(Correctness)*
   `/get-metric` and `/get-pagespeed` accept any string for `metric`. Passing an invalid value like `"FCP"` silently returns null data instead of a clear error. Using `Literal["LCP", "CLS", "INP"]` or an `Enum` provides automatic 422 validation and improves the auto-generated API docs.~~

- [x] ~~6. **New Relic GraphQL errors are not checked** *(Correctness)*
   `get_metric_value` only checks `response.status_code != 200`. A GraphQL API always returns HTTP 200, even for errors — the actual error lives in `response.json()["errors"]`. A failed NRQL query silently returns `None` with no indication of why.~~

- [x] ~~7. **Window label construction is duplicated in three places** *(Code Quality)*
   The logic for building a human-readable window label appears independently in `routes/comments.py`, `azure_client.py::process_work_items`, and `routes/metrics.py`. A `format_window_label` helper in `utils.py` would consolidate this.~~

- [x] ~~8. **`process_work_items` re-fetches what `get_work_item_url` already fetches** *(Code Quality)*
   Both functions independently call Azure DevOps, then both extract the title, URL, and metric from the response. `process_work_items` could call `get_work_item_url` internally to remove the duplication.~~

- [ ] 9. **`DRY_RUN` is a hardcoded constant** *(Architecture)*
   Toggling it requires a code change. It should be driven by an environment variable so it can be controlled through `.env` without touching the code.

- [ ] 10. **No startup validation of required environment variables** *(Architecture)*
    If `AZDO_PAT`, `NEWRELIC_API_KEY`, or `NEWRELIC_ACCOUNT_ID` are missing, the app starts without complaint and fails at the first real request with a cryptic error. A FastAPI `lifespan` startup handler that checks all required env vars would catch misconfigured deployments immediately.

- [x] ~~11. **`logger.py` runs I/O at import time** *(Architecture)*
    `os.makedirs` and the initial `json.dump([])` execute the moment `logger.py` is imported — even in dry runs. This should be moved inside `log_issue()` so the directory and file are only created when an issue is actually logged.~~

- [x] ~~12. **`/analyze` route is likely dead code** *(Architecture)*
    It uses Jinja2 templates to render `result.html`, which is a server-side rendering pattern. The entire frontend is React — this endpoint is almost certainly never called from the UI. Confirm and remove if unused.~~

---

## Section 2 — Code Changes

---

### 1. Parallelize `/run-script` ticket fetching

**File:** `routes/tickets.py`

```python
# Before
work_items = []
for wid in work_item_ids:
    parsed = get_work_item_url(wid)
    ...
    work_items.append({...})

# After
import asyncio

async def _fetch_one(wid: str) -> dict:
    parsed = await asyncio.to_thread(get_work_item_url, wid)
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

work_items = await asyncio.gather(*[_fetch_one(wid) for wid in work_item_ids])
```

---

### 2. Replace `requests` with `httpx`

**Install:**
```
pip install httpx
```

**File:** `azure_client.py` — replace all `requests` calls

```python
# Before
import requests
response = requests.get(f"{AZDO_BASE_URL}/{work_item_id}?api-version=7.0", auth=auth)

# After
import httpx
async with httpx.AsyncClient() as client:
    response = await client.get(
        f"{AZDO_BASE_URL}/{work_item_id}?api-version=7.0",
        auth=(auth.username, auth.password),
    )
```

All functions in `azure_client.py` that call `requests.get` / `requests.post` / `requests.patch` need to become `async def` and use `await client.get(...)` etc. Route handlers that call them must also be `async def`.

---

### 3. Make `/get-metric` async

**File:** `routes/metrics.py`

```python
# Before
def get_metric(...):

# After
async def get_metric(...):
    value = await get_metric_value(url, metric, ...)   # once azure_client is async
```

---

### ~~4. Centralize `load_dotenv()` and fix `PAGE_SPEED_KEY`~~

~~**File:** `main.py` — add `load_dotenv()` before all route imports~~

```python
# Add at the very top of main.py, before any local imports
from dotenv import load_dotenv
load_dotenv()

from routes.tickets import router as tickets_router
# ... rest of imports
```

~~**File:** `routes/pagespeed.py` — remove module-level key read, read it inside the handler~~

```python
# Before (module level)
PAGE_SPEED_KEY = os.getenv("PAGE_SPEED_INSIGHTS")

# After (inside the handler)
@router.get("/get-pagespeed")
def get_pagespeed(...):
    page_speed_key = os.getenv("PAGE_SPEED_INSIGHTS")
    if not page_speed_key:
        raise HTTPException(status_code=500, detail="PAGE_SPEED_INSIGHTS API key not configured.")
```

~~Also remove `load_dotenv()` from `azure_client.py` since `main.py` now handles it.~~

---

### ~~5. Validate `metric` with a `Literal` type~~

~~**File:** `routes/metrics.py` and `routes/pagespeed.py`~~

```python
# Before
metric: str,

# After
from typing import Literal
metric: Literal["LCP", "CLS", "INP"],
```

~~FastAPI will automatically return a 422 error with a clear message if any other value is passed.~~

---

### ~~6. Check New Relic GraphQL errors~~

~~**File:** `azure_client.py` — inside `get_metric_value`~~

```python
# Before
if response.status_code != 200:
    print("Error querying New Relic:", response.status_code, response.text)
    return None

data = response.json()

# After
if response.status_code != 200:
    print("Error querying New Relic:", response.status_code, response.text)
    return None

data = response.json()
if "errors" in data:
    print("New Relic GraphQL error:", data["errors"])
    return None
```

---

### ~~7. Extract `format_window_label` into `utils.py`~~

~~**File:** `utils.py` — add the helper~~

```python
def format_window_label(
    since: str | None = None,
    from_time: str | None = None,
    to_time: str | None = None,
    timezone: str | None = None,
) -> str:
    if from_time and to_time:
        label = f"{from_time} → {to_time}"
        if timezone:
            label += f" ({timezone})"
        return label
    return since or "7 days"
```

~~**Files:** `routes/comments.py`, `azure_client.py`, `routes/metrics.py` — replace the duplicated inline logic with a call to `format_window_label(...)`.~~

---

### ~~8. Reuse `get_work_item_url` inside `process_work_items`~~

~~**File:** `azure_client.py`~~

```python
# Before — process_work_items fetches and parses the work item itself
response = requests.get(f"{AZDO_BASE_URL}/{work_item_id}?api-version=7.0", auth=auth)
work_item = response.json()
title = work_item["fields"]["System.Title"]
urls = re.findall(r"https?://\S+", title)
metric = next((key for key in ["CLS", "INP", "LCP"] if key in title), None)

# After — get_work_item_url expanded to also return reporter fields,
# process_work_items calls it once and gets everything it needs
parsed = get_work_item_url(work_item_id)
if not parsed:
    continue
page_url = parsed["URL"]
metric = parsed["metric"]
reporter_name = parsed["reporter_name"]
reporter_descriptor = parsed["reporter_descriptor"]
reporter_unique_name = parsed["reporter_unique_name"]
```

---

### 9. Make `DRY_RUN` an environment variable

**File:** `azure_client.py`

```python
# Before
DRY_RUN = True

# After
DRY_RUN = os.getenv("DRY_RUN", "true").lower() == "true"
```

**File:** `.env`
```
DRY_RUN=true
```

---

### 10. Add startup env var validation via `lifespan`

**File:** `main.py`

```python
from contextlib import asynccontextmanager

REQUIRED_ENV_VARS = [
    "AZDO_ORG",
    "AZDO_PROJECT",
    "AZDO_PAT",
    "NEWRELIC_ACCOUNT_ID",
    "NEWRELIC_API_KEY",
]

@asynccontextmanager
async def lifespan(app: FastAPI):
    missing = [v for v in REQUIRED_ENV_VARS if not os.getenv(v)]
    if missing:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")
    yield

app = FastAPI(lifespan=lifespan)
```

---

### ~~11. Defer `logger.py` I/O to call time~~

~~**File:** `logger.py` — remove all module-level I/O, move it inside `log_issue`~~

```python
# Before — runs at import time
today_str = datetime.now().strftime("%Y-%m-%d")
report_folder = os.path.join(project_root, f"CWVs Report - {today_str}")
os.makedirs(report_folder, exist_ok=True)
output_file = os.path.join(report_folder, "metrics_report.json")
if not os.path.exists(output_file):
    with open(output_file, "w") as f:
        json.dump([], f)

# After — all of the above moves inside log_issue()
def log_issue(work_item_id, pageURL, metric, status, value, days):
    today_str = datetime.now().strftime("%Y-%m-%d")
    report_folder = os.path.join(os.getcwd(), f"CWVs Report - {today_str}")
    os.makedirs(report_folder, exist_ok=True)
    output_file = os.path.join(report_folder, "metrics_report.json")

    # read existing or start fresh
    try:
        with open(output_file, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        data = []

    data.append({...})

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
```

---

### ~~12. Remove `/analyze` dead code~~

~~**File:** `routes/tickets.py` — delete the `/analyze` route and its imports~~

```python
# Delete entirely
@router.post("/analyze")
async def analyze(request: Request, ticket_ids: str = Form(...)):
    ...

# Also remove these now-unused imports
from fastapi import ..., Request
from fastapi.templating import Jinja2Templates
templates = Jinja2Templates(directory="templates")
```

~~**File:** `main.py` — remove the `Jinja2Templates` import if it was there.~~
