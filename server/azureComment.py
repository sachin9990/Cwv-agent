# -----------------------------
# azureComment.py
# -----------------------------

import requests
from requests.auth import HTTPBasicAuth
import re
import os
from dotenv import load_dotenv
from datetime import datetime
from logger import log_issue

# -----------------------------
# Load environment variables
# -----------------------------
load_dotenv()

# Azure DevOps configuration
organization = os.getenv("AZDO_ORG")
project = os.getenv("AZDO_PROJECT")
personal_access_token = os.getenv("AZDO_PAT")

# New Relic configuration
account_id = os.getenv("NEWRELIC_ACCOUNT_ID")
api_key = os.getenv("NEWRELIC_API_KEY")

# Certificate Path
# custom_ca = os.getenv("CUSTOM_CA")

# Control flag
DRY_RUN = True  # Set to False to enable actual updates

# Default lookback
days_back = 30


# -----------------------------
# Status Logic
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
# Get metric from New Relic
# -----------------------------
def get_metric_value(pageURL, metric, days_back):
    metric_map = {
        "CLS": "cumulativeLayoutShift",
        "INP": "interactionToNextPaint",
        "LCP": "largestContentfulPaint",
    }

    attr = metric_map.get(metric, metric)

    nrql_query_string = (
        f"SELECT percentile({attr}, 75) AS '{metric}' "
        f"FROM PageViewTiming "
        f"WHERE pageUrl = '{pageURL}' "
        f"AND deviceType = 'Mobile' "
        f"SINCE {days_back} days ago"
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

    headers = {
        "Content-Type": "application/json",
        "API-Key": api_key,
    }

    print("Query--------------------------->",nrql_query)

    response_nr = requests.post(
        "https://api.newrelic.com/graphql",
        headers=headers,
        json={"query": nrql_query},
        verify=True,
    )

    if response_nr.status_code != 200:
        print("Error querying New Relic:", response_nr.status_code, response_nr.text)
        return None

    data = response_nr.json()

    print(f"----------------------------->NRQL Query Result for {metric} on {pageURL}:", data)
    results = (
        data.get("data", {})
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


# -----------------------------
# Reassign ticket
# -----------------------------
def reassign_to_reporter(work_item_id, reporter_unique_name, auth):
    if DRY_RUN:
        print(f"DRY_RUN: Skipping reassignment of {work_item_id}")
        return

    patch_url = (
        f"https://dev.azure.com/{organization}/{project}/_apis/wit/workitems/"
        f"{work_item_id}?api-version=7.0"
    )

    patch_payload = [
        {
            "op": "replace",
            "path": "/fields/System.AssignedTo",
            "value": reporter_unique_name,
        }
    ]

    headers = {"Content-Type": "application/json-patch+json"}

    response = requests.patch(
        patch_url,
        auth=auth,
        headers=headers,
        json=patch_payload,
    )
    response.raise_for_status()

    updated = response.json()
    assigned = updated["fields"].get("System.AssignedTo", {})

    print(
        f"✅ Work Item {work_item_id} reassigned to: "
        f"{assigned.get('displayName')} ({assigned.get('uniqueName')})"
    )


# -----------------------------
# Main processor
# -----------------------------
def process_work_items(work_item_ids, days_back=7):
    auth = HTTPBasicAuth("", personal_access_token)

    for work_item_id in work_item_ids:
        print(f"\nProcessing Work Item: {work_item_id}")

        # -----------------------------
        # Fetch work item
        # -----------------------------
        url_azdo = (
            f"https://dev.azure.com/{organization}/{project}/_apis/wit/workitems/"
            f"{work_item_id}?api-version=7.0"
        )

        response = requests.get(url_azdo, auth=auth)

        if response.status_code != 200:
            print("Error fetching work item:", response.status_code, response.text)
            continue

        work_item = response.json()
        title = work_item["fields"]["System.Title"]

        # Reporter info
        bug_reporter = work_item["fields"].get("Custom.BugReportedBy", {})
        reporter_name = bug_reporter.get("displayName", "Reporter")
        reporter_descriptor = bug_reporter.get("descriptor", "")
        reporter_unique_name = bug_reporter.get("uniqueName", "")

        # -----------------------------
        # Extract URL
        # -----------------------------
        urls = re.findall(r"https?://\S+", title)

        if not urls:
            print("❌ No URL found in title")
            continue

        pageURL = urls[0]
        print(f"Extracted URL: {pageURL}")

        # -----------------------------
        # Detect metric
        # -----------------------------
        metric = next(
            (key for key in ["CLS", "INP", "LCP"] if key in title),
            None,
        )

        if not metric:
            print("❌ No CLS/INP/LCP found")
            continue

        # -----------------------------
        # Fetch metric value
        # -----------------------------
        metric_value = get_metric_value(pageURL, metric, days_back)

        if metric_value is None:
            print(f"No data for {metric}")
            continue

        status = get_status(metric, metric_value)

        print(f"{metric} → {status} ({metric_value:.3f})")

        # -----------------------------
        # If GREEN → comment + reassign
        # -----------------------------
        if status == "Green":
            current_date = datetime.now().strftime("%Y-%m-%d")

            mention_html = (
                f'<a href="#" data-vss-mention="version:2.0,{reporter_descriptor}">'
                f"@{reporter_name}</a>"
            )

            comment_text = (
                f"{mention_html}: {metric} is within threshold "
                f"({metric_value:.3f}) as of {current_date}. "
                f"Observed over last {days_back} days."
            )

            # Reassign
            if reporter_unique_name:
                reassign_to_reporter(work_item_id, reporter_unique_name, auth)

            # Comment
            payload = {
                "text": comment_text,
                "mentions": [
                    {
                        "type": "person",
                        "id": reporter_descriptor,
                        "name": reporter_name,
                    }
                ],
            }

            print(f"🟢 Comment: {comment_text}")

            if not DRY_RUN:
                comment_url = (
                    f"https://dev.azure.com/{organization}/{project}/_apis/wit/"
                    f"workItems/{work_item_id}/comments?api-version=7.0-preview.3"
                )

                response_comment = requests.post(
                    comment_url,
                    auth=auth,
                    headers={"Content-Type": "application/json"},
                    json=payload,
                )
                response_comment.raise_for_status()

                print("✅ Comment added")

        else:
            print(f"❌ Not Green → Logging issue")

            log_issue(
                work_item_id,
                pageURL,
                metric,
                status,
                metric_value,
                days_back,
            )


# -----------------------------
# test_get_url.py
# -----------------------------
import requests
import re
from requests.auth import HTTPBasicAuth

auth = HTTPBasicAuth("", personal_access_token)


def get_work_item_url(work_item_id):
    print(f"\nProcessing Work Item: {work_item_id}")

    url_azdo = (
        f"https://dev.azure.com/{organization}/{project}/_apis/wit/workitems/"
        f"{work_item_id}?api-version=7.0"
    )

    response = requests.get(url_azdo, auth=auth)

    if response.status_code != 200:
        print("Error fetching work item:", response.status_code, response.text)
        return None

    work_item = response.json()
    title = work_item["fields"]["System.Title"]

    print("Title:", title)

    # Extract metric, value, and URL
    match = re.search(
        r"\b(CLS|INP|LCP)\b.*?(\d+\.?\d*)\s*\|.*?(https?://\S+?)(?=\s+-\s|\s*$)",
        title,
    )

    if not match:
        print("❌ Could not parse data")
        return None

    result = {
        "metric": match.group(1),
        "value": float(match.group(2)),
        "URL": match.group(3).strip(),
    }

    print("Extracted:", result)

    return result