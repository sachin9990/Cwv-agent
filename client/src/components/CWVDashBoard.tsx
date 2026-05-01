import { useState, useEffect } from "react";
import "./CWVDashboard.css";

export default function CWVDashboard({ data }: { data: any[] }) {
  const [rows, setRows] = useState(data);
  const [showNewRelic, setShowNewRelic] = useState(false);

  useEffect(() => {
    setRows(data);
  }, [data]);

  // Fetch metric for a single ticket
  const fetchMetric = async (row: any) => {
    if (!row.url || !row.metric) return row;
    try {
      const resp = await fetch(
        `http://127.0.0.1:8000/get-metric?ticket_id=${row.ticket_id}&url=${encodeURIComponent(
          row.url,
        )}&metric=${row.metric}&days=7`,
      );
      const result = await resp.json();
      return {
        ...row,
        newRelicValue: result.value ?? null,
        newRelicStatus: result.status ?? null,
      };
    } catch {
      return row;
    }
  };

  // Fetch metrics for all tickets
  const handleGetData = async () => {
    const updatedRows = await Promise.all(rows.map(fetchMetric));
    setRows(updatedRows);
    setShowNewRelic(true);
  };

  // Helper to get background color based on status
  const getCellStyle = (status: string | null) => {
    switch (status) {
      case "Green":
        return { backgroundColor: "#d4edda" };
      case "Amber":
        return { backgroundColor: "#fff3cd" };
      case "Red":
        return { backgroundColor: "#f8d7da" };
      default:
        return {};
    }
  };

  return (
    <div className="dashboard-card">
      <h2 className="dashboard-title">CWV Dashboard</h2>
      <button
        className="analyze-btn"
        style={{ marginBottom: 16 }}
        onClick={handleGetData}
      >
        Get Data from New Relic
      </button>
      <table className="bugs-table">
        <thead>
          <tr>
            <th>Ticket ID</th>
            <th>URL</th>
            <th>Metric</th>
            <th>Value</th>
            {showNewRelic && <th>Values from New Relic</th>}
            {showNewRelic && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {rows && rows.length > 0 ? (
            rows.map((item) => (
              <tr key={item.ticket_id}>
                <td>{item.ticket_id}</td>
                <td>
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {item.url}
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
                <td>{item.metric ?? "-"}</td>
                <td style={getCellStyle(item.status)}>
                  {item.value !== null && item.value !== undefined
                    ? item.value
                    : "-"}
                </td>
                {showNewRelic && (
                  <>
                    <td style={getCellStyle(item.newRelicStatus)}>
                      {item.newRelicValue !== null &&
                      item.newRelicValue !== undefined
                        ? item.newRelicValue
                        : "-"}
                    </td>
                    <td>
                      {item.newRelicStatus === "Green" ? (
                        <button
                          style={{
                            backgroundColor: "#28a745",
                            color: "#fff",
                            border: "none",
                            borderRadius: "4px",
                            padding: "6px 12px",
                            cursor: "pointer",
                          }}
                        >
                          Comment
                        </button>
                      ) : (
                        <button
                          style={{
                            backgroundColor: "#dc3545",
                            color: "#fff",
                            border: "none",
                            borderRadius: "4px",
                            padding: "6px 12px",
                            cursor: "pointer",
                          }}
                        >
                          Fix it
                        </button>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={showNewRelic ? 6 : 4}
                style={{ textAlign: "center" }}
              >
                No data available
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
