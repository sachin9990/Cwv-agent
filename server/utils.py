def get_status(metric: str, value: float) -> str:
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


def build_time_clause(
    since: str | None = None,
    from_time: str | None = None,
    to_time: str | None = None,
    timezone: str | None = None,
) -> str:
    """Return the NRQL time clause for a New Relic query.

    Custom range:  SINCE '2026-04-25 00:00:00' UNTIL '2026-05-01 00:00:00' WITH TIMEZONE 'Asia/Kolkata'
    Relative:      SINCE 7 days ago  (default)
    """
    if from_time and to_time:
        clause = f"SINCE '{from_time}' UNTIL '{to_time}'"
        if timezone:
            clause += f" WITH TIMEZONE '{timezone}'"
        return clause
    return f"SINCE {since or '7 days'} ago"
