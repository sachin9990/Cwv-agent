import "./Sidebar.css";
import type { Page } from "../App";

type MenuItem = {
  text: string;
  icon: string;
  page?: Page;
};

type SidebarProps = {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  activePage: Page;
  onNavigate: (page: Page) => void;
  isOpen: boolean;
  onClose: () => void;
};

const menuItems: MenuItem[] = [
  { text: "Analyze", icon: "📊", page: "analyze" },
  { text: "Dashboard", icon: "📈", page: "dashboard" },
  { text: "Check URLs", icon: "🔎", page: "check-url" },
  { text: "History", icon: "🕓", page: "history" },
  { text: "Settings", icon: "⚙️" },
];

export default function Sidebar({ theme, onToggleTheme, activePage, onNavigate, isOpen, onClose }: SidebarProps) {
  const handleClick = (item: MenuItem) => {
    if (item.page) onNavigate(item.page);
  };

  return (
    <aside className={`sidebar${isOpen ? " sidebar--open" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">C</div>
        <h2>CWV Agent</h2>
        <button className="sidebar-close-btn" onClick={onClose} aria-label="Close menu">✕</button>
      </div>

      <ul className="menu">
        {menuItems.map((item) => (
          <li
            key={item.text}
            className={`menu-item${item.page === activePage ? " active" : ""}${!item.page ? " disabled" : ""}`}
            onClick={() => handleClick(item)}
          >
            <span className="menu-icon">{item.icon}</span>
            <span className="menu-text">{item.text}</span>
          </li>
        ))}
      </ul>

      <button className="theme-toggle" onClick={onToggleTheme}>
        {theme === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode"}
      </button>

      <div className="sidebar-promo">
        <div className="sidebar-promo-title">CWV Agent</div>
        <div className="sidebar-promo-body">
          Automatically analyze Core Web Vitals issues and take action.
        </div>
        <div className="sidebar-promo-rocket">🚀</div>
      </div>
    </aside>
  );
}
