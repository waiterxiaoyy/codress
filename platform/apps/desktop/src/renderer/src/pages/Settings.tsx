import { useCallback, useEffect, useRef, useState } from "react";
import { bridge, type AdapterStatus, type Settings as SettingsData, type UpdateState } from "../bridge";
import { useToast } from "../toast";
import codexIcon from "../assets/codex.png";
import workbuddyIcon from "../assets/workbuddy.png";
import { getThemeMode, setThemeMode, watchTheme, type ThemeMode } from "../theme";

const APP_IDS = ["codex", "workbuddy"] as const;
type AppId = (typeof APP_IDS)[number];

const APP_ICONS: Record<AppId, string> = {
  codex: codexIcon,
  workbuddy: workbuddyIcon,
};

const IS_WINDOWS = navigator.userAgent.includes("Windows");
const GITHUB_REPO = "https://github.com/waiterxiaoyy/codress";
const THEME_OPTIONS = [
  { value: "auto", label: "跟随系统", description: "系统切换外观时自动同步" },
  { value: "light", label: "浅色", description: "始终使用浅色外观" },
  { value: "dark", label: "深色", description: "始终使用深色外观" },
] as const;

function pathExample(id: AppId) {
  if (IS_WINDOWS) {
    return id === "codex"
      ? "例如 C:\\Users\\you\\AppData\\Local\\Programs\\Codex\\Codex.exe"
      : "例如 C:\\Users\\you\\AppData\\Local\\Programs\\WorkBuddy\\WorkBuddy.exe";
  }
  return id === "codex"
    ? "例如 /Applications/ChatGPT.app 或 /Applications/Codex.app"
    : "例如 /Applications/WorkBuddy.app";
}

export default function Settings() {
  const toast = useToast();
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [statuses, setStatuses] = useState<AdapterStatus[]>([]);
  const [apiBase, setApiBase] = useState("");
  const [pathDrafts, setPathDrafts] = useState<Record<string, string>>({});
  const [savingPath, setSavingPath] = useState<string | null>(null);
  const [clientInfo, setClientInfo] = useState<{ version: string; platform: "mac" | "win" | "other" } | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getThemeMode);
  const dirtyPaths = useRef(new Set<string>());
  const updateSectionRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const [nextSettings, nextStatuses] = await Promise.all([bridge.getSettings(), bridge.appStatus()]);
    setSettings(nextSettings);
    setApiBase(nextSettings.apiBase);
    setStatuses(nextStatuses);
    setPathDrafts((current) => {
      const next = { ...current };
      for (const id of APP_IDS) {
        if (dirtyPaths.current.has(id)) continue;
        const detected = nextStatuses.find((status) => status.id === id)?.installPath ?? "";
        // 以本次真正识别到的路径为准；手动路径失效时，发现链仍可回填新的安装位置。
        next[id] = detected || nextSettings.appPaths[id] || "";
      }
      return next;
    });
  }, []);

  useEffect(() => {
    refresh();
    return bridge.onStatusChanged(refresh);
  }, [refresh]);

  useEffect(() => watchTheme(setThemeModeState), []);

  const checkForUpdate = useCallback(async (notify = false) => {
    try {
      const state = await bridge.checkForUpdates();
      setUpdateState(state);
      if (notify) {
        toast(state.status === "available"
          ? `发现新版本 ${state.version}`
          : state.status === "error"
            ? state.error ?? "检查更新失败"
            : "当前已是最新版本",
        state.status === "error");
      }
    } catch (error) {
      toast((error as Error).message || "暂时无法检查更新", true);
    }
  }, [toast]);

  useEffect(() => {
    Promise.all([bridge.clientInfo(), bridge.getUpdateState()])
      .then(([info, state]) => { setClientInfo(info); setUpdateState(state); })
      .catch(() => undefined);
    return bridge.onUpdateState(setUpdateState);
  }, []);

  useEffect(() => {
    const showUpdate = () => {
      if (sessionStorage.getItem("codress.settings.section") === "update") {
        sessionStorage.removeItem("codress.settings.section");
        requestAnimationFrame(() => updateSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    };
    showUpdate();
    window.addEventListener("codress:show-update", showUpdate);
    return () => window.removeEventListener("codress:show-update", showUpdate);
  }, []);

  const installUpdate = async () => {
    try {
      await bridge.installUpdate();
    } catch (error) {
      toast((error as Error).message || "更新失败，请稍后重试", true);
    }
  };

  const savePath = async (id: AppId) => {
    if (!settings) return;
    setSavingPath(id);
    try {
      const updated = await bridge.patchSettings({
        appPaths: { ...settings.appPaths, [id]: (pathDrafts[id] ?? "").trim() },
      });
      dirtyPaths.current.delete(id);
      setSettings(updated);
      await refresh();
      toast("应用路径已保存");
    } finally {
      setSavingPath(null);
    }
  };

  const pickPath = async (id: AppId) => {
    const selected = await bridge.pickAppPath(id, pathDrafts[id]);
    if (!selected) return;
    dirtyPaths.current.add(id);
    setPathDrafts((current) => ({ ...current, [id]: selected }));
  };

  const openIssue = () => {
    const params = new URLSearchParams({
      title: "[Feedback] ",
      body: `## 问题描述\n\n\n## 复现步骤\n1. \n\n## 环境\n- Codress: ${clientInfo?.version ?? "unknown"}\n- Platform: ${clientInfo?.platform ?? "unknown"}\n`,
    });
    bridge.openExternal(`${GITHUB_REPO}/issues/new?${params}`);
  };

  if (!settings) return null;

  return (
    <div>
      <h1 className="page-title">设置</h1>

      <div className="settings-section-heading settings-appearance-heading">
        <div>
          <h2>外观</h2>
          <p>选择浅色、深色，或跟随系统自动切换。</p>
        </div>
      </div>
      <section className="appearance-card">
        <div>
          <strong>主题模式</strong>
          <span>当前：{THEME_OPTIONS.find((option) => option.value === themeMode)?.label}</span>
        </div>
        <div className="theme-segmented" role="group" aria-label="选择主题模式">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={themeMode === option.value ? "active" : ""}
              aria-pressed={themeMode === option.value}
              title={option.description}
              onClick={() => {
                setThemeMode(option.value);
                setThemeModeState(option.value);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <div className="field settings-api-field">
        <label>服务端地址（皮肤商店 API）</label>
        <div className="row">
          <input value={apiBase} onChange={(event) => setApiBase(event.target.value)} />
          <button
            className="btn"
            onClick={() =>
              bridge.patchSettings({ apiBase: apiBase.replace(/\/$/, "") }).then(() => toast("已保存"))
            }
          >
            保存
          </button>
        </div>
      </div>

      <hr className="divider" />
      <div className="settings-section-heading">
        <div>
          <h2>目标应用</h2>
          <p>已自动识别安装位置，也可以手动修改应用路径。</p>
        </div>
        <button className="btn ghost small" onClick={refresh}>重新检测</button>
      </div>

      <div className="target-app-list">
        {APP_IDS.map((id) => {
          const status = statuses.find((item) => item.id === id);
          if (!status) return null;
          const configured = Boolean(settings.appPaths[id] && settings.appPaths[id] === pathDrafts[id]);
          return (
            <section className="target-app-card" key={id}>
              <div className="target-app-summary">
                <img className="target-app-icon" src={APP_ICONS[id]} alt="" />
                <div className="target-app-identity">
                  <div className="target-app-name-row">
                    <strong>{status.name}</strong>
                    <span className={`target-app-state ${status.installed ? "installed" : ""}`}>
                      {status.installed ? "已识别" : "未识别"}
                    </span>
                  </div>
                  <span className="target-app-connection">
                    <span className={`status-dot ${status.cdpReady ? "on" : ""}`} />
                    {status.cdpReady
                      ? `端口 ${status.port} 已连接 · ${status.sessions} 个窗口`
                      : status.installed
                        ? `端口 ${status.port} 待连接，应用皮肤时自动开启`
                        : `端口 ${status.port} 未连接`}
                  </span>
                </div>
              </div>

              <div className="target-path-area">
                <div className="target-path-label">
                  <span>{IS_WINDOWS ? "可执行文件路径" : "应用路径"}</span>
                  <span>{configured ? "手动指定" : status.installed ? "自动检测" : "等待设置"}</span>
                </div>
                <div className="target-path-controls">
                  <input
                    value={pathDrafts[id] ?? ""}
                    placeholder={pathExample(id)}
                    spellCheck={false}
                    onChange={(event) => {
                      dirtyPaths.current.add(id);
                      setPathDrafts((current) => ({ ...current, [id]: event.target.value }));
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") savePath(id);
                    }}
                  />
                  <button className="btn ghost" onClick={() => pickPath(id)}>选择</button>
                  <button
                    className="btn primary"
                    disabled={savingPath === id}
                    onClick={() => savePath(id)}
                  >
                    {savingPath === id ? "保存中…" : "保存"}
                  </button>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <div className="muted settings-note">
        皮肤通过本机回环 CDP 注入，只在你的电脑内通信；不会修改目标应用安装目录，恢复默认即可完全还原。
        如果应用正在运行但未开启皮肤通道，应用皮肤时会请求确认重启一次。
      </div>

      <hr className="divider" />
      <div className="settings-section-heading about-heading" ref={updateSectionRef}>
        <div>
          <h2>关于与更新</h2>
          <p>查看客户端版本、更新说明与项目支持入口。</p>
        </div>
      </div>

      <section className="about-card">
        <div className="about-version-row">
          <div>
            <span className="about-eyebrow">当前版本</span>
            <div className="about-version">Codress {clientInfo?.version ?? "—"}</div>
          </div>
          <div className="row">
            {updateState?.status === "available" || updateState?.status === "downloaded" ? (
              <button className="btn primary" onClick={installUpdate}>
                {updateState.status === "downloaded"
                  ? "重启并安装"
                  : `更新并重启 ${updateState.version ?? ""}`}
              </button>
            ) : updateState?.status === "downloading" ? (
              <button className="btn primary" disabled>
                下载中 {Math.round(updateState.progress ?? 0)}%
              </button>
            ) : (
              <button className="btn ghost" disabled={updateState?.status === "checking"} onClick={() => checkForUpdate(true)}>
                {updateState?.status === "checking" ? "检查中…" : "检查更新"}
              </button>
            )}
          </div>
        </div>

        {updateState?.status === "error" && (
          <div className="about-update-message error">{updateState.error ?? "更新失败，请稍后重试"}</div>
        )}
        {updateState?.status === "not-available" && (
          <div className="about-update-message">当前已是最新版本。</div>
        )}
        {updateState && ["available", "downloading", "downloaded"].includes(updateState.status) && (
          <div className="about-release">
            <div className="about-release-title">
              <strong>发现新版本 {updateState.version}</strong>
              {updateState.status === "downloading" && <span>{Math.round(updateState.progress ?? 0)}%</span>}
              {updateState.status === "downloaded" && <span>已下载，等待重启</span>}
            </div>
            <div className="about-release-notes">
              {updateState.notes?.trim() || "本次发布暂无更新说明。"}
            </div>
            {updateState.status === "downloading" && (
              <div className="update-progress-track">
                <span style={{ width: `${updateState.progress ?? 0}%` }} />
              </div>
            )}
          </div>
        )}

        <div className="about-links">
          <button className="about-link" onClick={() => bridge.openExternal(GITHUB_REPO)}>
            <span>GitHub 项目</span><span>查看源码与发布记录 →</span>
          </button>
          <button className="about-link" onClick={openIssue}>
            <span>反馈问题</span><span>创建 GitHub Issue →</span>
          </button>
        </div>
      </section>
    </div>
  );
}
