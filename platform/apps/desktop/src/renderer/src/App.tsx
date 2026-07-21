import { useEffect, useState } from "react";
import { ToastProvider } from "./toast";
import Themes from "./pages/Themes";
import Pets from "./pages/Pets";
import Mine from "./pages/Mine";
import Settings from "./pages/Settings";

function IconThemes() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <circle cx="8.6" cy="9.4" r="1.6" />
      <path d="M3 16.5l5-4.5 4.2 3.8L16 12l5 4.5" />
    </svg>
  );
}

function IconPets() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="8.5" r="1.9" />
      <circle cx="17" cy="8.5" r="1.9" />
      <circle cx="4.6" cy="13.2" r="1.7" />
      <circle cx="19.4" cy="13.2" r="1.7" />
      <path d="M12 12.2c2.6 0 5 2.1 5 4.4 0 1.6-1.2 2.6-2.6 2.6-1 0-1.7-.5-2.4-.5s-1.4.5-2.4.5c-1.4 0-2.6-1-2.6-2.6 0-2.3 2.4-4.4 5-4.4z" />
    </svg>
  );
}

function IconMine() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8.2" r="3.6" />
      <path d="M4.8 20c1.2-3.4 4-5.2 7.2-5.2s6 1.8 7.2 5.2" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7.5h9M17 7.5h3" />
      <circle cx="15" cy="7.5" r="2" />
      <path d="M4 16.5h3M11 16.5h9" />
      <circle cx="9" cy="16.5" r="2" />
    </svg>
  );
}

function IconCollapse({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: collapsed ? "scaleX(-1)" : undefined }}
    >
      <path d="M13.5 6l-6 6 6 6" />
      <path d="M19 6l-6 6 6 6" />
    </svg>
  );
}

const pages = [
  { key: "themes", label: "主题", icon: IconThemes, component: Themes },
  { key: "pets", label: "宠物", icon: IconPets, component: Pets },
  { key: "mine", label: "我的", icon: IconMine, component: Mine },
  { key: "settings", label: "设置", icon: IconSettings, component: Settings },
] as const;

const COLLAPSED_KEY = "codress.sidebar.collapsed";

export default function App() {
  const [active, setActive] = useState<(typeof pages)[number]["key"]>("themes");
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === "1");
  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);
  const Page = pages.find((p) => p.key === active)!.component;
  return (
    <ToastProvider>
      <div className={`shell ${collapsed ? "collapsed" : ""}`}>
        <aside className="side">
          <div className="brand" title="Codress">
            {collapsed ? "C" : "CODRESS"}
          </div>
          {pages.map((page) => {
            const Icon = page.icon;
            return (
              <div
                key={page.key}
                className={`nav-item ${active === page.key ? "active" : ""}`}
                onClick={() => setActive(page.key)}
                title={collapsed ? page.label : undefined}
              >
                <Icon />
                <span className="nav-label">{page.label}</span>
              </div>
            );
          })}
          <div className="side-footer">
            <div
              className="nav-item collapse-toggle"
              onClick={() => setCollapsed((v) => !v)}
              title={collapsed ? "展开菜单" : "收起菜单"}
            >
              <IconCollapse collapsed={collapsed} />
              <span className="nav-label">收起</span>
            </div>
          </div>
        </aside>
        <main className="content">
          <Page />
        </main>
      </div>
    </ToastProvider>
  );
}
