import { useEffect, useState, type CSSProperties } from "react";
import { ToastProvider } from "./toast";
import Themes, { preloadThemeStore } from "./pages/Themes";
import Pets, { preloadPetStore } from "./pages/Pets";
import Mine from "./pages/Mine";
import Settings from "./pages/Settings";
import { bridge, type UpdateState } from "./bridge";
import { applyTheme, watchTheme } from "./theme";
import { PageVisibilityProvider } from "./components/PageVisibility";
import codressLogo from "./assets/codress-logo.png";
import codressBanner from "./assets/codress-banner.png";

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
const STARTUP_MIN_MS = 520;
const STARTUP_MAX_MS = 2200;
let startupWarmupPromise: Promise<void> | null = null;

function warmupStartupData(): Promise<void> {
  if (!startupWarmupPromise) {
    startupWarmupPromise = Promise.allSettled([
      preloadThemeStore(),
      preloadPetStore(),
    ]).then(() => undefined);
  }
  return startupWarmupPromise;
}

export default function App() {
  const [active, setActive] = useState<(typeof pages)[number]["key"]>("themes");
  const [mountedPages, setMountedPages] = useState<Set<(typeof pages)[number]["key"]>>(() => new Set(["themes"]));
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === "1");
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [starting, setStarting] = useState(true);
  useEffect(() => {
    applyTheme();
    return watchTheme();
  }, []);
  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);
  useEffect(() => {
    bridge.getUpdateState().then(setUpdateState).catch(() => undefined);
    return bridge.onUpdateState(setUpdateState);
  }, []);
  useEffect(() => {
    let active = true;
    let minimumTimer = 0;
    let deadlineTimer = 0;
    const minimum = new Promise<void>((resolve) => {
      minimumTimer = window.setTimeout(resolve, STARTUP_MIN_MS);
    });
    const deadline = new Promise<void>((resolve) => {
      deadlineTimer = window.setTimeout(resolve, STARTUP_MAX_MS);
    });
    Promise.race([
      Promise.all([warmupStartupData(), minimum]).then(() => undefined),
      deadline,
    ]).then(() => {
      if (active) setStarting(false);
    });
    return () => {
      active = false;
      window.clearTimeout(minimumTimer);
      window.clearTimeout(deadlineTimer);
    };
  }, []);
  const updateAvailable = updateState && ["available", "downloading", "downloaded"].includes(updateState.status);
  const showPage = (key: (typeof pages)[number]["key"]) => {
    setMountedPages((current) => current.has(key) ? current : new Set([...current, key]));
    setActive(key);
  };
  const showUpdate = () => {
    sessionStorage.setItem("codress.settings.section", "update");
    showPage("settings");
    window.dispatchEvent(new Event("codress:show-update"));
  };
  return (
    <ToastProvider>
      {starting ? (
        <div className="startup-screen" role="status" aria-label="Codress 正在启动">
          <div className="startup-brand">
            <img className="startup-banner" src={codressBanner} alt="Codress" />
          </div>
          <div className="startup-status">
            <span className="startup-spinner" aria-hidden="true" />
            <span>正在准备主题与宠物…</span>
          </div>
        </div>
      ) : <div className={`shell ${collapsed ? "collapsed" : ""}`}>
        <aside className="side">
          <div className="brand" title="Codress">
            <span className="brand-identity">
              <img className="brand-banner" src={codressBanner} alt="Codress" />
              <img className="brand-logo" src={codressLogo} alt="" aria-hidden="true" />
            </span>
            {updateAvailable && (
              <button
                className="brand-update-btn"
                title={updateState.status === "downloading"
                  ? `正在下载 ${Math.round(updateState.progress ?? 0)}%`
                  : `发现新版本 ${updateState.version ?? ""}，点击查看并更新`}
                aria-label="发现新版本，查看更新"
                onClick={showUpdate}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 16V8M8.5 11.5 12 8l3.5 3.5" />
                </svg>
                {updateState.status === "downloading" && (
                  <span style={{ "--update-progress": `${updateState.progress ?? 0}%` } as CSSProperties} />
                )}
              </button>
            )}
          </div>
          {pages.map((page) => {
            const Icon = page.icon;
            return (
              <div
                key={page.key}
                className={`nav-item ${active === page.key ? "active" : ""}`}
                onClick={() => showPage(page.key)}
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
          {pages.map((page) => {
            if (!mountedPages.has(page.key)) return null;
            const Page = page.component;
            const isActive = active === page.key;
            return (
              <PageVisibilityProvider active={isActive} key={page.key}>
                <section className="page-keepalive" hidden={!isActive} aria-hidden={!isActive}>
                  <Page />
                </section>
              </PageVisibilityProvider>
            );
          })}
        </main>
      </div>}
    </ToastProvider>
  );
}
