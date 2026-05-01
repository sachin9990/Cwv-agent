import { useRef, useState } from "react";
import "./AnalyzeTickets.css";

type WorkItem = {
  ticket_id: string;
  url: string | null;
  metric: string | null;
  value: number | null;
  status: string | null;
};

type AnalyzeTicketsProps = {
  onResult: (data: WorkItem[]) => void;
};
export default function AnalyzeTickets({ onResult }: AnalyzeTicketsProps) {
  const [ticketInput, setTicketInput] = useState("");
  const [fileName, setFileName] = useState("");
  const [ticketsCount, setTicketsCount] = useState(0);
  const [result, setResult] = useState<any>(null);

  // console.log('RESULT-------->', result)
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTicketInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTicketInput(e.target.value);
    const count = e.target.value
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0).length;
    setTicketsCount(count);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFileName(e.target.files[0].name);
    }
  };

  const handleSubmit = async () => {
    const formData = new FormData();
    if (ticketInput.trim()) formData.append("ticket_numbers", ticketInput);
    if (fileInputRef.current?.files?.[0])
      formData.append("file", fileInputRef.current.files[0]);

    try {
      const response = await fetch("http://127.0.0.1:8000/run-script", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      setResult(data);
      if (onResult) onResult(data); // <-- update dashboard data in App
    } catch (err) {
      console.error("Error submitting form:", err);
    }
  };

  return (
    <div className="card">
      <div className="row">
        {/* Left: Ticket URLs */}
        <div className="column">
          <div className="header">
            <div className="icon purple">⬆️</div>
            <div>
              <h3>Enter Ticket URLs</h3>
              <p>Add multiple ticket URLs separated by commas</p>
            </div>
          </div>
          <textarea
            placeholder="e.g. JIRA-123, JIRA-456, JIRA-789"
            value={ticketInput}
            onChange={handleTicketInput}
          />
          <div className="status">✅ No. of tickets added: {ticketsCount}</div>
        </div>

        {/* Divider with OR */}
        <div className="divider">
          <span>OR</span>
        </div>

        {/* Right: Upload CSV */}
        <div className="column">
          <div className="header">
            <div className="icon green">⬆️</div>
            <div>
              <h3>Upload CSV File</h3>
              <p>Upload a CSV file with ticket URLs</p>
            </div>
          </div>
          <div
            className="dropzone"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="big-icon">⬆️</div>
            <p>Drag and drop your CSV file here</p>
            <p className="browse">or browse files</p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            {fileName && <p className="selected">Selected: {fileName}</p>}
          </div>
          <div className="hint">Supported format: .csv, .xlsx, .xls ℹ️</div>
        </div>
      </div>
      <div className="footer">
        <button className="analyze-btn" onClick={handleSubmit}>
          Analyze CWV Issues
        </button>
      </div>
    </div>
  );
}
