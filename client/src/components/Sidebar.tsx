import "./Sidebar.css";

const menuItems = [
 { text: "Analyze", icon: "📊" },
 { text: "Dashboard", icon: "📈" },
 { text: "History", icon: "📜" },
 { text: "Settings", icon: "⚙️" },
];

export default function Sidebar() {
 return (
 <div className="sidebar">
 <div className="sidebar-header">
 <h2>CWV Agent</h2>
 </div>
 <ul className="menu">
 {menuItems.map((item) => (
 <li key={item.text} className="menu-item">
 <span className="menu-icon">{item.icon}</span>
 <span className="menu-text">{item.text}</span>
 </li>
 ))}
 </ul>
 </div>
 );
}