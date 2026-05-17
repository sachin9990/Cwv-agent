import { useEffect, useState } from "react";
import AnalyzeTickets from "./components/AnalyzeTickets";
import CWVDashboard from "./components/CWVDashBoard";
import HistoryPage from "./components/HistoryPage";
import Sidebar from "./components/Sidebar";
import type { WorkItem } from "./types";
import "./App.css";

export type Page = "analyze" | "dashboard" | "history";

function App() {
  const [page, setPage] = useState<Page>("analyze");
  const [dashboardData, setDashboardData] = useState<WorkItem[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("cwv-theme") as "light" | "dark") ?? "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("cwv-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  const handleResult = (data: WorkItem[]) => {
    setDashboardData(data);
    setPage("dashboard");
  };

  const navigate = (p: Page) => {
    setPage(p);
    setSidebarOpen(false);
  };

  return (
    <div className="app-root">
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}
      <Sidebar
        theme={theme}
        onToggleTheme={toggleTheme}
        activePage={page}
        onNavigate={navigate}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="main-content">
        <button
          className="sidebar-hamburger"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          ☰
        </button>
        {page === "analyze" && <AnalyzeTickets onResult={handleResult} />}
        {page === "dashboard" && (
          <CWVDashboard
            data={dashboardData}
            onGoAnalyze={() => navigate("analyze")}
          />
        )}
        {page === "history" && <HistoryPage />}
      </main>
    </div>
  );
}

export default App;
