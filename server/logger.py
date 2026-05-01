# -----------------------------
# Standard library
# -----------------------------
import os
import json
from datetime import datetime

# -----------------------------
# Path setup
# -----------------------------
today_str = datetime.now().strftime("%Y-%m-%d")

# Option 1: Use current working directory
project_root = os.getcwd()

# Option 2: Use fixed project path (currently active)
# project_root = "/Users/SachinKumar/Documents/bajajRepo/3in1cms/bajajfinserv-web/ui.solid/src"

report_folder = os.path.join(project_root, f"CWVs Report - {today_str}")
os.makedirs(report_folder, exist_ok=True)

# Output file
output_file = os.path.join(report_folder, "metrics_report.json")


# -----------------------------
# Ensure file exists
# -----------------------------
if not os.path.exists(output_file):
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump([], f, indent=2)


# -----------------------------
# Logger function
# -----------------------------
def log_issue(work_item_id, pageURL, metric, status, value, days):
    """Append amber/red metric entry to the daily JSON report."""

    new_entry = {
        "work_item_id": work_item_id,
        "url": pageURL,
        "metric": metric,
        "status": status,
        "value": round(value, 3),
        "deviceType": "Mobile",
        "days": days,
        "timestamp": datetime.now().isoformat(),
    }

    # -----------------------------
    # Read existing data
    # -----------------------------
    try:
        with open(output_file, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        data = []

    # -----------------------------
    # Append new entry
    # -----------------------------
    data.append(new_entry)

    # -----------------------------
    # Write back to file
    # -----------------------------
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(f"📄 Logged issue to {output_file}")