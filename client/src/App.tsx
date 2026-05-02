import { useEffect, useState } from "react";
import AnalyzeTickets from "./components/AnalyzeTickets";
import CWVDashboard from "./components/CWVDashBoard";
import Sidebar from "./components/Sidebar";
import "./App.css";

export type Page = "analyze" | "dashboard";

function App() {
  const [page, setPage] = useState<Page>("analyze");
  const [dashboardData, setDashboardData] = useState<any[]>([]);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("cwv-theme") as "light" | "dark") ?? "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("cwv-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  const handleResult = (data: any[]) => {
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
        <div style={{ display: page === "analyze" ? "contents" : "none" }}>
          <AnalyzeTickets onResult={handleResult} />
        </div>
        <div style={{ display: page === "dashboard" ? "contents" : "none" }}>
          <CWVDashboard data={dashboardData} />
        </div>
      </main>
    </div>
  );
}

export default App;
