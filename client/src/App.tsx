import { useEffect, useState } from "react";
import AnalyzeTickets from "./components/AnalyzeTickets";
import CWVDashboard from "./components/CWVDashBoard";
import Sidebar from "./components/Sidebar";
import type { WorkItem } from "./types";
import "./App.css";

export type Page = "analyze" | "dashboard";

function App() {
  const [page, setPage] = useState<Page>("analyze");
  const [dashboardData, setDashboardData] = useState<WorkItem[]>([]);
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

  return (
    <div className="app-root">
      <Sidebar
        theme={theme}
        onToggleTheme={toggleTheme}
        activePage={page}
        onNavigate={setPage}
      />
      <main className="main-content">
        {page === "analyze" && <AnalyzeTickets onResult={handleResult} />}
        {page === "dashboard" && <CWVDashboard data={dashboardData} />}
      </main>
    </div>
  );
}

export default App;
