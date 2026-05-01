import { useEffect, useState } from "react";
import "./Sidebar.css";

type MenuItem = {
  text: string;
  icon: string;
  target?: string;
};

const menuItems: MenuItem[] = [
  { text: "Analyze", icon: "📊", target: "analyze" },
  { text: "Dashboard", icon: "📈", target: "dashboard" },
  { text: "History", icon: "🕓" },
  { text: "Settings", icon: "⚙️" },
];

export default function Sidebar() {
  const [active, setActive] = useState<string>("Analyze");

  // Auto-highlight the menu item whose section is in view
  useEffect(() => {
    const sections = menuItems
      .filter((m) => m.target)
      .map((m) => ({ text: m.text, el: document.getElementById(m.target!) }))
      .filter((s) => s.el !== null) as { text: string; el: HTMLElement }[];

    if (sections.length === 0) return;

    const onScroll = () => {
      const scrollY = window.scrollY + 120;
      let current = sections[0].text;
      for (const s of sections) {
        if (s.el.offsetTop <= scrollY) current = s.text;
      }
      setActive(current);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleClick = (item: MenuItem) => {
    setActive(item.text);
    if (item.target) {
      document
        .getElementById(item.target)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">C</div>
        <h2>CWV Agent</h2>
      </div>

      <ul className="menu">
        {menuItems.map((item) => (
          <li
            key={item.text}
            className={`menu-item${active === item.text ? " active" : ""}`}
            onClick={() => handleClick(item)}
          >
            <span className="menu-icon">{item.icon}</span>
            <span className="menu-text">{item.text}</span>
          </li>
        ))}
      </ul>

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
