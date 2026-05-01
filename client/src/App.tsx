import { useState } from "react";
import AnalyzeTickets from "./components/AnalyzeTickets";
import CWVDashboard from "./components/CWVDashBoard";
import Sidebar from "./components/Sidebar";
import "./App.css";

function App() {
  const [dashboardData, setDashboardData] = useState<any[]>([]);

  return (
    <div className="app-root">
      <Sidebar />
      <main className="main-content">
        <AnalyzeTickets onResult={setDashboardData} />
        {dashboardData.length > 0 && <CWVDashboard data={dashboardData} />}
      </main>
    </div>
  );
}

export default App;
