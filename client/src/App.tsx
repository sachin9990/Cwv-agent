import { useState } from "react";
import AnalyzeTickets from "./components/AnalyzeTickets";
import CWVDashboard from "./components/CWVDashBoard";
import Sidebar from "./components/Sidebar";
import "./App.css";

function App() {
  const [dashboardData, setDashboardData] = useState([]);

  console.log("App dashboardData:---->", dashboardData); // <-- Debug log to check data flow to App

  return (
    <div className="app-root">
      <Sidebar />
      <main className="main-content">
        <AnalyzeTickets onResult={setDashboardData} />
        {Array.isArray(dashboardData) && dashboardData.length > 0 && (
          <CWVDashboard data={dashboardData} />
        )}
      </main>
    </div>
  );
}

export default App;
