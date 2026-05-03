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
  const [submitting, setSubmitting] = useState(false);

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

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && fileInputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInputRef.current.files = dt.files;
      setFileName(file.name);
    }
  };

  const handleRemoveFile = () => {
    setFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!ticketInput.trim() && !fileInputRef.current?.files?.[0]) return;

    setSubmitting(true);
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
      onResult(data);
    } catch (err) {
      console.error("Error submitting form:", err);
      alert("Failed to analyze tickets. Is the backend running on port 8000?");
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = ticketInput.trim().length > 0 || fileName.length > 0;

  return (
    <section className="analyze-section">
      <div className="analyze-hero">
        <h1 className="hero-title">
          Let's analyze your{" "}
          <span className="hero-accent">Core Web Vitals</span>
          <br />
          issues
        </h1>
        <p className="hero-subtitle">
          Add your ticket URLs manually
          <br />
          or upload a CSV file to get started.
        </p>

        <div className="hero-illustration">
          <div className="hero-gauge">
            <div className="gauge-arc" />
            <div className="gauge-needle" />
          </div>
          <div className="hero-chips">
            <span className="hero-chip lcp">LCP</span>
            <span className="hero-chip cls">CLS</span>
            <span className="hero-chip inp">INP</span>
          </div>
        </div>
      </div>

      <div className="analyze-card">
        <div className="analyze-row">
          <div className="analyze-column">
            <div className="ax-header">
              <div className="ax-icon purple">🔗</div>
              <div>
                <h3>Enter Ticket URLs</h3>
                <p>Add multiple ticket URLs separated by commas</p>
              </div>
            </div>
            <textarea
              placeholder="e.g. 8703559, 8712320, 8712376"
              value={ticketInput}
              onChange={handleTicketInput}
            />
            <div className="status">
              <span className="status-tick">✓</span> No. of tickets added:{" "}
              <strong>{ticketsCount}</strong>
            </div>
          </div>

          <div className="analyze-divider">
            <span>OR</span>
          </div>

          <div className="analyze-column">
            <div className="ax-header">
              <div className="ax-icon green">⬆</div>
              <div>
                <h3>Upload CSV File</h3>
                <p>Upload a CSV file with ticket URLs</p>
              </div>
            </div>

            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handleFileChange}
            />

            {fileName ? (
              <div className="file-pill">
                <span className="file-pill-icon">📄</span>
                <span className="file-pill-name">{fileName}</span>
                <button className="file-pill-remove" onClick={handleRemoveFile} title="Remove file">✕</button>
              </div>
            ) : (
              <>
                <div
                  className="dropzone"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  <div className="dropzone-icon">☁️</div>
                  <p className="dropzone-main">Drag and drop your CSV file here</p>
                  <p>or <span className="browse">browse files</span></p>
                </div>
                <div className="hint">Supported format: .csv, .xlsx ⓘ</div>
              </>
            )}
          </div>
        </div>

        <div className="analyze-footer">
          <button
            className="analyze-btn"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
          >
            {submitting ? "Analyzing…" : "Analyze CWV Issues →"}
          </button>
        </div>
      </div>
    </section>
  );
}
