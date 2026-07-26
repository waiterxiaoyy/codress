import { useCallback, useEffect, useRef, useState } from "react";
import { bridge, type UpdateState } from "../bridge";
import { useToast } from "../toast";
import { getThemeMode, setThemeMode, watchTheme, type ThemeMode } from "../theme";

const GITHUB_REPO = "https://github.com/waiterxiaoyy/codress";
const THEME_OPTIONS = [
  { value: "auto", label: "跟随系统", description: "系统切换外观时自动同步" },
  { value: "light", label: "浅色", description: "始终使用浅色外观" },
  { value: "dark", label: "深色", description: "始终使用深色外观" },
] as const;

export default function Settings() {
  const toast = useToast();
  const [clientInfo, setClientInfo] = useState<{ version: string; platform: "mac" | "win" | "other" } | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getThemeMode);
  const updateSectionRef = useRef<HTMLDivElement>(null);

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

  const openIssue = () => {
    const params = new URLSearchParams({
      title: "[Feedback] ",
      body: `## 问题描述\n\n\n## 复现步骤\n1. \n\n## 环境\n- Codress: ${clientInfo?.version ?? "unknown"}\n- Platform: ${clientInfo?.platform ?? "unknown"}\n`,
    });
    bridge.openExternal(`${GITHUB_REPO}/issues/new?${params}`);
  };

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
