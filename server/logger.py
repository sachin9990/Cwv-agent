import os
import json
from datetime import datetime


def log_issue(work_item_id, pageURL, metric, status, value, days):
    """Append amber/red metric entry to the daily JSON report."""

    today_str = datetime.now().strftime("%Y-%m-%d")
    report_folder = os.path.join(os.getcwd(), f"CWVs Report - {today_str}")
    os.makedirs(report_folder, exist_ok=True)
    output_file = os.path.join(report_folder, "metrics_report.json")

    try:
        with open(output_file, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        data = []

    data.append({
        "work_item_id": work_item_id,
        "url": pageURL,
        "metric": metric,
        "status": status,
        "value": round(value, 3),
        "deviceType": "Mobile",
        "days": days,
        "timestamp": datetime.now().isoformat(),
    })

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(f"📄 Logged issue to {output_file}")
