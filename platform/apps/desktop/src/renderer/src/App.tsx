import { useState } from "react";
import { ToastProvider } from "./toast";
import Themes from "./pages/Themes";
import Pets from "./pages/Pets";
import Mine from "./pages/Mine";
import Settings from "./pages/Settings";

const pages = [
  { key: "themes", label: "主题", component: Themes },
  { key: "pets", label: "宠物", component: Pets },
  { key: "mine", label: "我的", component: Mine },
  { key: "settings", label: "设置", component: Settings },
] as const;

export default function App() {
  const [active, setActive] = useState<(typeof pages)[number]["key"]>("themes");
  const Page = pages.find((p) => p.key === active)!.component;
  return (
    <ToastProvider>
      <div className="shell">
        <aside className="side">
          <div className="brand">CODRESS</div>
          {pages.map((page) => (
            <div
              key={page.key}
              className={`nav-item ${active === page.key ? "active" : ""}`}
              onClick={() => setActive(page.key)}
            >
              {page.label}
            </div>
          ))}
          <div className="side-footer">
            不修改官方文件
            <br />
            随时恢复默认
          </div>
        </aside>
        <main className="content">
          <Page />
        </main>
      </div>
    </ToastProvider>
  );
}
