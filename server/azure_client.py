import re
import os
import requests
from requests.auth import HTTPBasicAuth
from datetime import datetime
from dotenv import load_dotenv

from logger import log_issue
from utils import get_status, build_time_clause, format_window_label

load_dotenv()

organization = os.getenv("AZDO_ORG")
project = os.getenv("AZDO_PROJECT")
personal_access_token = os.getenv("AZDO_PAT")
AZDO_BASE_URL = f"https://dev.azure.com/{organization}/{project}/_apis/wit/workitems"

account_id = os.getenv("NEWRELIC_ACCOUNT_ID")
api_key = os.getenv("NEWRELIC_API_KEY")

DRY_RUN = True  # Set to False to enable actual Azure DevOps writes

METRIC_MAP = {
    "CLS": "cumulativeLayoutShift",
    "INP": "interactionToNextPaint",
    "LCP": "largestContentfulPaint",
}

auth = HTTPBasicAuth("", personal_access_token)


def get_metric_value(
    page_url: str,
    metric: str,
    since: str | None = None,
    from_time: str | None = None,
    to_time: str | None = None,
    timezone: str | None = None,
) -> float | None:
    attr = METRIC_MAP.get(metric, metric)
    time_clause = build_time_clause(since, from_time, to_time, timezone)

    nrql_query_string = (
        f"SELECT percentile({attr}, 75) AS '{metric}' "
        f"FROM PageViewTiming "
        f"WHERE pageUrl = '{page_url}' "
        f"AND deviceType = 'Mobile' "
        f"{time_clause}"
    )

    nrql_query = f"""
    {{
    actor {{
        account(id: {account_id}) {{
        nrql(query: "{nrql_query_string}") {{
            results
        }}
        }}
    }}
    }}
    """

    response = requests.post(
        "https://api.newrelic.com/graphql",
        headers={"Content-Type": "application/json", "API-Key": api_key},
        json={"query": nrql_query},
        verify=True,
    )

    if response.status_code != 200:
        print("Error querying New Relic:", response.status_code, response.text)
        return None

    data = response.json()
    if "errors" in data:
        print("New Relic GraphQL error:", data["errors"])
        return None

    results = (
        data
        .get("data", {})
        .get("actor", {})
        .get("account", {})
        .get("nrql", {})
        .get("results", [])
    )

    if not results:
        return None

    metric_dict = results[0].get(metric)
    if isinstance(metric_dict, dict) and "75" in metric_dict:
        return metric_dict["75"]

    return None


def get_work_item_url(work_item_id: str) -> dict | None:
    print(f"\nProcessing Work Item: {work_item_id}")

    response = requests.get(
        f"{AZDO_BASE_URL}/{work_item_id}?api-version=7.0", auth=auth
    )

    if response.status_code != 200:
        print("Error fetching work item:", response.status_code, response.text)
        return None

    work_item = response.json()
    title = work_item["fields"]["System.Title"]
    print("Title:", title)

    match = re.search(
        r"\b(CLS|INP|LCP)\b.*?(\d+\.?\d*)\s*\|.*?(https?://\S+?)(?=\s+-\s|\s*$)",
        title,
    )

    if not match:
        print("❌ URL not found")
        return None

    bug_reporter = work_item["fields"].get("Custom.BugReportedBy", {})

    result = {
        "metric": match.group(1),
        "value": float(match.group(2)),
        "URL": match.group(3).strip(),
        "reporter_name": bug_reporter.get("displayName", "Reporter"),
        "reporter_descriptor": bug_reporter.get("descriptor", ""),
        "reporter_unique_name": bug_reporter.get("uniqueName", ""),
    }
    print("Extracted:", result)
    return result


def reassign_to_reporter(work_item_id: str, reporter_unique_name: str) -> None:
    if DRY_RUN:
        print(f"DRY_RUN: Skipping reassignment of {work_item_id}")
        return

    response = requests.patch(
        f"{AZDO_BASE_URL}/{work_item_id}?api-version=7.0",
        auth=auth,
        headers={"Content-Type": "application/json-patch+json"},
        json=[
            {
                "op": "replace",
                "path": "/fields/System.AssignedTo",
                "value": reporter_unique_name,
            }
        ],
    )
    response.raise_for_status()

    assigned = response.json()["fields"].get("System.AssignedTo", {})
    print(
        f"✅ Work Item {work_item_id} reassigned to: "
        f"{assigned.get('displayName')} ({assigned.get('uniqueName')})"
    )


def process_work_items(
    work_item_ids: list[str],
    since: str | None = None,
    from_time: str | None = None,
    to_time: str | None = None,
    timezone: str | None = None,
) -> None:
    window_label = format_window_label(since, from_time, to_time, timezone)

    for work_item_id in work_item_ids:
        parsed = get_work_item_url(work_item_id)
        if not parsed:
            continue

        page_url = parsed["URL"]
        metric = parsed["metric"]
        reporter_name = parsed["reporter_name"]
        reporter_descriptor = parsed["reporter_descriptor"]
        reporter_unique_name = parsed["reporter_unique_name"]

        metric_value = get_metric_value(
            page_url, metric,
            since=since, from_time=from_time, to_time=to_time, timezone=timezone,
        )
        if metric_value is None:
            print(f"No data for {metric}")
            continue

        status = get_status(metric, metric_value)
        print(f"{metric} → {status} ({metric_value:.3f})")

        if status == "Green":
            current_date = datetime.now().strftime("%Y-%m-%d")
            mention_html = (
                f'<a href="#" data-vss-mention="version:2.0,{reporter_descriptor}">'
                f"@{reporter_name}</a>"
            )
            comment_text = (
                f"{mention_html}: {metric} is within threshold "
                f"({metric_value:.3f}) as of {current_date}. "
                f"Observed over: {window_label}."
            )

            if reporter_unique_name:
                reassign_to_reporter(work_item_id, reporter_unique_name)

            payload = {
                "text": comment_text,
                "mentions": [
                    {"type": "person", "id": reporter_descriptor, "name": reporter_name}
                ],
            }
            print(f"🟢 Comment: {comment_text}")

            if not DRY_RUN:
                comment_url = (
                    f"https://dev.azure.com/{organization}/{project}/_apis/wit/"
                    f"workItems/{work_item_id}/comments?api-version=7.0-preview.3"
                )
                resp = requests.post(
                    comment_url,
                    auth=auth,
                    headers={"Content-Type": "application/json"},
                    json=payload,
                )
                resp.raise_for_status()
                print("✅ Comment added")
        else:
            print(f"❌ Not Green → Logging issue")
            log_issue(work_item_id, page_url, metric, status, metric_value, window_label)
